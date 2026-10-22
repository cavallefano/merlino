import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const lines = (n: number) => Array.from({ length: n }, (_, i) => `riga ${i + 1}`)

test('stage di un file e commit con ⌘↩, poi amend', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await expect(page.getByTestId('section-unstaged')).toContainText('file1.txt')
  await page.getByTestId('section-unstaged').getByTestId('stage-file').click()
  await expect(page.getByTestId('section-staged')).toContainText('file1.txt')

  await page.getByTestId('commit-subject').fill('primo commit dalla ui')
  await page.keyboard.press(`${mod}+Enter`)
  await expect(page.getByTestId('commit-row').first()).toContainText('primo commit dalla ui')
  await expect(page.getByTestId('working-row')).toBeHidden()

  writeFileSync(join(repo, 'file1.txt'), 'ancora\n')
  await page.getByTestId('working-row').click()
  await page.getByTestId('stage-all').first().click()
  await page.getByTestId('amend').check()
  await expect(page.getByTestId('commit-subject')).toHaveValue('primo commit dalla ui')
  await page.getByTestId('commit-subject').fill('commit corretto')
  await page.getByTestId('commit-button').click()
  await expect(page.getByTestId('commit-row').first()).toContainText('commit corretto')
  expect(git(repo, 'rev-list', '--count', 'HEAD').trim()).toBe('2')
  await app.close()
})

test('stage di una sola riga e scarto di un blocco con conferma', async () => {
  const repo = makeRepo(0)
  writeFileSync(join(repo, 'f.txt'), lines(20).join('\n') + '\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'base')
  const changed = lines(20)
  changed[1] = 'DUE'
  changed[17] = 'DICIOTTO'
  writeFileSync(join(repo, 'f.txt'), changed.join('\n') + '\n')

  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-unstaged').getByTestId('working-file').click()
  await page.getByTestId('stage-line').filter({ hasText: 'DUE' }).click()
  await page.getByTestId('lines-stage').click()
  await expect.poll(() => git(repo, 'diff', '--cached')).toContain('+DUE')
  expect(git(repo, 'diff', '--cached')).not.toContain('DICIOTTO')

  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('section-unstaged').getByTestId('working-file').click()
  await page.getByTestId('hunk-discard').last().click()
  await expect.poll(() => readFileSync(join(repo, 'f.txt'), 'utf8')).not.toContain('DICIOTTO')
  await app.close()
})

test('ignora un file non tracciato, stash e pop dalla sidebar', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'debug.log'), 'x\n')
  writeFileSync(join(repo, 'file1.txt'), 'da mettere da parte\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-untracked').getByTestId('ignore-file').click()
  await expect.poll(() => readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('/debug.log\n')

  await page.getByTestId('stash-toggle').click()
  await page.getByTestId('stash-message').fill('lavoro a metà')
  await page.getByTestId('stash-untracked').check()
  await page.getByTestId('stash-create').click()
  await expect(page.getByTestId('stash-item')).toContainText('lavoro a metà')
  // lo stash -u porta via anche il .gitignore appena creato: debug.log torna non tracciato
  await expect(page.getByTestId('working-row')).toContainText('(1)')

  await page.getByTestId('stash-pop').click()
  await expect(page.getByTestId('stash-item')).toHaveCount(0)
  await expect(page.getByTestId('working-row')).toBeVisible()
  expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('da mettere da parte\n')
  await app.close()
})
