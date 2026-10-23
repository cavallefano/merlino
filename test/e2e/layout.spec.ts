import { expect, type Page, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Trascina il centro di un divisore di dx, dy px. */
async function drag(page: Page, testid: string, dx: number, dy: number) {
  const b = await page.getByTestId(testid).boundingBox()
  if (!b) throw new Error(`divisore non visibile: ${testid}`)
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

const width = async (page: Page, selector: string) => Math.round((await page.locator(selector).boundingBox())?.width ?? 0)

test('divisori: la sidebar si allarga, la misura resta dopo il reload e il doppio clic la riporta a 220 px', async () => {
  const repo = makeRepo(2)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  expect(await width(page, 'aside.sidebar')).toBe(220)

  await drag(page, 'split-sidebar', 80, 0)
  await expect.poll(() => width(page, 'aside.sidebar')).toBe(300)

  await page.reload()
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  expect(await width(page, 'aside.sidebar')).toBe(300)

  await page.getByTestId('split-sidebar').dblclick()
  await expect.poll(() => width(page, 'aside.sidebar')).toBe(220)
  await app.close()
})

test('layout verticale dalle impostazioni, ritorno all\'orizzontale dal pulsante della barra', async () => {
  const repo = makeRepo(2)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  const box = async (selector: string) => (await page.locator(selector).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }

  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('pref-panelLayout').selectOption('vertical')
  await page.getByTestId('settings-close').click()
  // Il dettaglio sta sotto la lista, alla stessa x
  await expect.poll(async () => (await box('.detail')).y > (await box('.history')).y + 100).toBe(true)
  expect(Math.round((await box('.detail')).x)).toBe(Math.round((await box('.history')).x))

  await page.getByTestId('layout-toggle').click()
  await expect.poll(async () => (await box('.detail')).x > (await box('.history')).x + 100).toBe(true)
  await page.keyboard.press(`${mod}+Comma`)
  await expect(page.getByTestId('pref-panelLayout')).toHaveValue('horizontal')
  await app.close()
})

test('divisore fra file e diff nel dettaglio del commit', async () => {
  const repo = makeRepo(1)
  const { app, page } = await launch([repo])
  const files = page.locator('.detail .files')
  await expect(page.getByTestId('file-row')).toHaveCount(1)
  const height = async () => Math.round((await files.boundingBox())?.height ?? 0)
  expect(await height()).toBe(140)
  await drag(page, 'split-files', 0, 60)
  await expect.poll(height).toBe(200)
  await page.getByTestId('split-files').dblclick()
  await expect.poll(height).toBe(140)
  await app.close()
})

test('popup del diff: si apre dal pulsante e col doppio clic, ↓ passa al file successivo, Esc chiude', async () => {
  const repo = makeRepo(0)
  for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(repo, name), `${name}\n`)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'tre file')
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('file-row')).toHaveCount(3)
  const dialog = page.getByTestId('diff-dialog')

  await page.getByTestId('diff-popup').click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('diff-position')).toHaveText('1/3')
  await expect(dialog.getByTestId('diff-dialog-path')).toHaveText('a.txt')
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByTestId('diff-position')).toHaveText('2/3')
  await expect(dialog.getByTestId('diff-line-add')).toContainText('b.txt')
  // La selezione è quella del pannello
  await expect(page.getByTestId('file-row').nth(1)).toHaveClass(/selected/)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.getByTestId('file-row').nth(2).dblclick()
  await expect(dialog.getByTestId('diff-position')).toHaveText('3/3')
  await dialog.getByTestId('diff-dialog-close').click()
  await expect(dialog).toBeHidden()
  await app.close()
})

test('popup del diff nelle modifiche locali: stage di un blocco', async () => {
  const lines = Array.from({ length: 20 }, (_, i) => `riga ${i + 1}`)
  const repo = makeRepo(0)
  writeFileSync(join(repo, 'f.txt'), lines.join('\n') + '\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'base')
  const changed = [...lines]
  changed[1] = 'DUE'
  changed[17] = 'DICIOTTO'
  writeFileSync(join(repo, 'f.txt'), changed.join('\n') + '\n')

  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-unstaged').getByTestId('working-file').dblclick()
  const dialog = page.getByTestId('diff-dialog')
  await expect(dialog.getByTestId('hunk-stage')).toHaveCount(2)
  await dialog.getByTestId('hunk-stage').first().click()
  await expect.poll(() => git(repo, 'diff', '--cached')).toContain('+DUE')
  expect(git(repo, 'diff', '--cached')).not.toContain('DICIOTTO')
  // Il file resta anche fra quelli non in stage: il popup resta aperto sullo stesso file
  await expect(dialog.getByTestId('diff-dialog-path')).toHaveText('f.txt')
  await app.close()
})
