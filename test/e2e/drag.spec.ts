import { expect, type Page, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRemotePair, makeRepo } from '../helpers/repo'
import { launch } from './launch'

const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}

/** Drag "interno" dei file: il drag nativo è disattivato, così parte quello HTML5 che Playwright sa simulare. */
async function internalFileDrags(app: Awaited<ReturnType<typeof launch>>['app']) {
  // Sul prototipo: vale per qualunque oggetto WebContents usi il main
  await app.evaluate(({ webContents }) => {
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as Electron.WebContents
    proto.startDrag = () => {
      throw new Error('drag nativo disattivato nel test')
    }
  })
}

const subjects = (repo: string) => git(repo, 'log', '--format=%s').trim().split('\n')
// Testo esatto: "a" non deve prendere anche "main" o "rebase-qui"
const branchItem = (page: Page, name: string) => page.getByTestId('branch-item').filter({ hasText: new RegExp(`^${name}$`) })

test('branch sul corrente: merge; con ⌥ rebase', async () => {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'feature/a')
  commitFile(repo, 'a.txt', 'a\n', 'su feature')
  git(repo, 'switch', '-q', 'main')
  commitFile(repo, 'm.txt', 'm\n', 'su main')
  git(repo, 'branch', 'rebase-qui', 'feature/a')
  const { app, page } = await launch([repo])
  await branchItem(page, 'a').dragTo(branchItem(page, 'main'))
  await expect.poll(() => subjects(repo)[0]).toBe("Merge branch 'feature/a'")

  git(repo, 'reset', '-q', '--hard', 'HEAD~1')
  await page.keyboard.down('Alt')
  await branchItem(page, 'rebase-qui').dragTo(branchItem(page, 'main'))
  await page.keyboard.up('Alt')
  await expect.poll(() => subjects(repo)).toEqual(['su main', 'su feature', 'commit 1'])
  await app.close()
})

test('commit sul tag: nuovo tag; commit sul corrente: cherry-pick', async () => {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'altro')
  commitFile(repo, 'x.txt', 'x\n', 'da prendere')
  git(repo, 'switch', '-q', 'main')
  const { app, page } = await launch([repo])
  const row = page.getByTestId('commit-row').filter({ hasText: 'da prendere' })
  await row.dragTo(page.getByTestId('tags-header'))
  await page.getByTestId('prompt-field-name').fill('v-drag')
  await page.getByTestId('prompt-ok').click()
  await expect(page.getByTestId('tag-item')).toHaveText('v-drag')

  await row.dragTo(branchItem(page, 'main'))
  await expect.poll(() => subjects(repo)[0]).toBe('da prendere')
  await app.close()
})

test('file fra le sezioni, su Stash, poi lo stash sulle modifiche locali', async () => {
  const repo = makeRepo(2)
  writeFileSync(join(repo, 'file1.txt'), 'uno\n')
  writeFileSync(join(repo, 'file2.txt'), 'due\n')
  const { app, page } = await launch([repo])
  await internalFileDrags(app)
  await page.getByTestId('working-row').click()
  const file1 = page.getByTestId('section-unstaged').getByTestId('working-file').filter({ hasText: 'file1.txt' })
  await file1.dragTo(page.getByTestId('commit-subject'))
  await expect(page.getByTestId('section-unstaged').getByTestId('working-file')).toHaveCount(2)

  await file1.dragTo(page.getByTestId('section-unstaged'))
  await expect(page.getByTestId('section-unstaged').getByTestId('working-file')).toHaveCount(2)

  await file1.dragTo(page.getByTestId('stash-header'))
  await expect(page.getByTestId('stash-item')).toHaveCount(1)
  expect(git(repo, 'status', '--porcelain').trim()).toBe('M file2.txt')

  await page.getByTestId('stash-item').dragTo(page.getByTestId('working-row'))
  await expect.poll(() => git(repo, 'diff', '--name-only').trim().split('\n')).toEqual(['file1.txt', 'file2.txt'])
  await app.close()
})

test('stage trascinando un file in "In stage"', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'uno\n')
  writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
  git(repo, 'add', 'nuovo.txt')
  const { app, page } = await launch([repo])
  await internalFileDrags(app)
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-unstaged').getByTestId('working-file').dragTo(page.getByTestId('section-staged'))
  await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim().split('\n')).toEqual(['file1.txt', 'nuovo.txt'])
  await app.close()
})

test('branch locale su origin: push con upstream', async () => {
  const { bare, clone } = makeRemotePair()
  git(clone, 'branch', 'feature/push')
  const { app, page } = await launch([clone])
  await branchItem(page, 'push').dragTo(page.getByTestId('remote-item').filter({ hasText: 'origin' }))
  await expect.poll(() => git(bare, 'branch', '--list', 'feature/push').trim()).toBe('feature/push')
  expect(git(clone, 'rev-parse', '--abbrev-ref', 'feature/push@{u}').trim()).toBe('origin/feature/push')
  await app.close()
})

test('file di un commit verso altre app: startDrag riceve il contenuto di quel commit', async () => {
  const repo = makeRepo(1)
  commitFile(repo, 'file1.txt', 'versione due\n', 'seconda')
  const { app, page } = await launch([repo])
  await app.evaluate(({ webContents }) => {
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as Electron.WebContents
    proto.startDrag = (item) => {
      ;(globalThis as unknown as { dragged: string }).dragged = item.file
    }
  })
  await page.getByTestId('commit-row').filter({ hasText: 'commit 1' }).click()
  await page.getByTestId('file-row').dispatchEvent('dragstart')
  const dragged = await app.evaluate(() => (globalThis as unknown as { dragged?: string }).dragged)
  expect(dragged && readFileSync(dragged, 'utf8')).toBe('1\n')
  await app.close()
})
