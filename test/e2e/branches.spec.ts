import { expect, test } from '@playwright/test'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { cloneOf, git, makeRemotePair, makeRepo } from '../helpers/repo'
import { launch } from './launch'
import { chooseNextMenuItem } from './menu'

const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}

test('branch dal menu del commit, checkout dalla sidebar, merge con conflitto risolto e Continua', async () => {
  const repo = makeRepo(1)
  commitFile(repo, 'file1.txt', 'main\n', 'modifica su main')
  const { app, page } = await launch([repo])
  const rows = page.getByTestId('commit-row')
  await expect(rows).toHaveCount(2)

  await chooseNextMenuItem(app, 'Create Branch Here…')
  await rows.filter({ hasText: 'commit 1' }).click({ button: 'right' })
  await page.getByTestId('prompt-field-name').fill('feature/conflitto')
  await page.getByTestId('prompt-field-checkout').uncheck()
  await page.getByTestId('prompt-ok').click()
  await page.getByTestId('branch-item').filter({ hasText: 'conflitto' }).dblclick()
  await expect(page.getByTestId('repo-branch')).toHaveText('feature/conflitto')

  commitFile(repo, 'file1.txt', 'feature\n', 'modifica su feature')
  await chooseNextMenuItem(app, 'Merge into Current Branch')
  await page.getByTestId('branch-item').filter({ hasText: 'main' }).click({ button: 'right' })
  const banner = page.getByTestId('operation-banner')
  await expect(banner).toContainText('Merge in progress')
  await expect(page.getByTestId('op-continue')).toBeDisabled()

  await page.getByTestId('working-row').click()
  writeFileSync(join(repo, 'file1.txt'), 'risolto\n')
  await page.getByTestId('section-conflicted').getByTestId('stage-file').click()
  await page.getByTestId('op-continue').click()
  await expect(banner).toBeHidden()
  await expect(rows.first()).toContainText("Merge branch 'main'")
  expect(git(repo, 'rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ')).toHaveLength(3)
  await app.close()
})

test('push su un remote bare e pull dei commit pushati da un secondo clone', async () => {
  const { bare, clone } = makeRemotePair()
  commitFile(clone, 'locale.txt', 'x\n', 'da pushare')
  const { app, page } = await launch([clone])
  const push = page.getByTestId('push')
  await expect(push).toContainText('↑1')
  await push.click()
  await expect.poll(() => git(bare, 'log', '-1', '--format=%s', 'main').trim()).toBe('da pushare')
  await expect(push).not.toContainText('↑')

  const other = cloneOf(bare)
  commitFile(other, 'remoto.txt', 'y\n', 'dal collega')
  git(other, 'push', '-q')
  await page.getByTestId('fetch').click()
  await expect(page.getByTestId('pull')).toContainText('↓1')
  await page.getByTestId('pull').click()
  await expect(page.getByTestId('commit-row').first()).toContainText('dal collega')
  await expect(page.getByTestId('pull')).not.toContainText('↓')
  await app.close()
})

test('tag annotato creato dal menu del commit e pushato dalla sidebar', async () => {
  const { bare, clone } = makeRemotePair()
  const { app, page } = await launch([clone])
  await chooseNextMenuItem(app, 'Create Tag Here…')
  await page.getByTestId('commit-row').first().click({ button: 'right' })
  await page.getByTestId('prompt-field-name').fill('v1.0')
  await page.getByTestId('prompt-field-message').fill('prima release')
  await page.getByTestId('prompt-ok').click()
  await expect(page.getByTestId('tag-item')).toHaveText('v1.0')
  await expect(page.getByTestId('commit-row').first()).toContainText('v1.0')
  expect(git(clone, 'cat-file', '-t', 'v1.0').trim()).toBe('tag')

  await chooseNextMenuItem(app, 'Push to origin')
  await page.getByTestId('tag-item').click({ button: 'right' })
  await expect.poll(() => git(bare, 'tag', '--list')).toContain('v1.0')
  await app.close()
})

test('clona dalla schermata iniziale e apre il repo in una tab', async () => {
  const { bare } = makeRemotePair()
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-dest-')))
  const { app, page } = await launch()
  // Il dialog di scelta cartella è nativo: risponde da solo con parent
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, parent)
  await page.getByTestId('clone').click()
  await page.getByTestId('prompt-field-url').fill(bare)
  await page.getByTestId('prompt-ok').click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await expect(page.getByTestId('commit-row')).toContainText('commit 1')
  expect(git(join(parent, basename(bare)), 'remote', 'get-url', 'origin').trim()).toBe(bare)
  await app.close()
})

test('rebase interattivo dal menu del commit: squash di due commit e reword', async () => {
  const repo = makeRepo(4)
  const { app, page } = await launch([repo])
  await chooseNextMenuItem(app, 'Interactive Rebase from Here…')
  await page.getByTestId('commit-row').filter({ hasText: 'commit 2' }).click({ button: 'right' })
  const rows = page.getByTestId('rebase-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('commit 4')

  await rows.filter({ hasText: 'commit 3' }).getByTestId('rebase-action').selectOption('squash')
  const last = rows.filter({ hasText: 'commit 4' })
  await last.getByTestId('rebase-action').selectOption('reword')
  await last.getByTestId('rebase-message').fill('quarto, riscritto')
  await page.getByTestId('rebase-start').click()
  await expect(page.getByTestId('rebase-dialog')).toBeHidden()
  await expect.poll(() => git(repo, 'log', '--format=%s').trim().split('\n')).toEqual(['quarto, riscritto', 'commit 2', 'commit 1'])
  expect(git(repo, 'log', '-1', '--format=%B', 'HEAD~1')).toContain('commit 3')
  await expect(page.getByTestId('commit-row').first()).toContainText('quarto, riscritto')
  await app.close()
})
