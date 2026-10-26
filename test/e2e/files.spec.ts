import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'
import { chooseNextMenuItem } from './menu'

/** Storia, dal più recente: solo file1, modifica app, aggiunge app, commit 1. */
function repoWithFiles(): string {
  const repo = makeRepo(1)
  mkdirSync(join(repo, 'src'))
  writeFileSync(join(repo, 'src/app.ts'), 'const a = 1\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'aggiunge app')
  writeFileSync(join(repo, 'src/app.ts'), 'const a = 1\nconst b = 2\n')
  writeFileSync(join(repo, 'file1.txt'), '1\nuno\n')
  git(repo, 'commit', '-q', '-am', 'modifica app')
  writeFileSync(join(repo, 'file1.txt'), '1\nuno\ndue\n')
  git(repo, 'commit', '-q', '-am', 'solo file1')
  return repo
}

test('albero dei file: cartelle, contenuto al commit scelto, ritorno alle modifiche', async () => {
  const { app, page } = await launch([repoWithFiles()])
  const rows = page.getByTestId('commit-row')
  await rows.filter({ hasText: 'modifica app' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await page.getByTestId('detail-tree').click()
  const tree = page.getByTestId('tree-row')
  await expect(tree).toHaveText(['src', /file1\.txt/])
  // Il file cambiato nel commit ha la lettera dello stato
  await expect(tree.filter({ hasText: 'file1.txt' }).locator('.status')).toHaveText('M')

  await tree.filter({ hasText: 'src' }).click()
  await tree.filter({ hasText: 'app.ts' }).click()
  const code = page.getByTestId('content-line').locator('code')
  await expect(code).toHaveText(['const a = 1', 'const b = 2'])

  // Cambiando commit restano la cartella aperta e il file scelto
  await rows.filter({ hasText: 'aggiunge app' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('aggiunge app')
  await expect(code).toHaveText(['const a = 1'])
  await expect(tree.filter({ hasText: 'app.ts' })).toHaveClass(/selected/)

  // Nel primo commit src non c'è: il pannello sotto resta vuoto
  await rows.filter({ hasText: 'commit 1' }).click()
  await expect(tree).toHaveText([/file1\.txt/])
  await expect(page.getByTestId('content-line')).toHaveCount(0)

  await page.getByTestId('detail-changes').click()
  await expect(page.getByTestId('file-row')).toHaveText([/file1\.txt/])
  await app.close()
})

test('blame dal menu di un file: blocchi, commit scelto, prima di questo commit, indietro, mostra commit', async () => {
  const repo = repoWithFiles()
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-message')).toContainText('solo file1')
  await chooseNextMenuItem(app, 'Blame')
  await page.getByTestId('file-row').filter({ hasText: 'file1.txt' }).click({ button: 'right' })
  const dialog = page.getByTestId('blame-dialog')
  await expect(dialog.getByTestId('blame-path')).toHaveText('file1.txt')
  await expect(dialog.getByTestId('blame-revision')).toHaveText(git(repo, 'rev-parse', '--short=7', 'HEAD').trim())
  const lines = dialog.getByTestId('blame-line')
  await expect(lines.locator('.text')).toHaveText(['1', 'uno', 'due'])
  // Ogni riga viene da un commit diverso: tre blocchi
  await expect(dialog.locator('.line.first')).toHaveCount(3)

  await lines.nth(1).getByTestId('blame-commit').click()
  await expect(dialog.getByTestId('blame-picked')).toContainText('modifica app')
  await expect(lines.nth(1)).toHaveClass(/picked/)
  // Prima di "modifica app" il file aveva una riga sola
  await dialog.getByTestId('blame-parent').click()
  await expect(lines.locator('.text')).toHaveText(['1'])
  await expect(dialog.getByTestId('blame-revision')).toHaveText(git(repo, 'rev-parse', '--short=7', 'HEAD~2').trim())
  await dialog.getByTestId('blame-back').click()
  await expect(lines.locator('.text')).toHaveText(['1', 'uno', 'due'])

  await lines.nth(1).getByTestId('blame-commit').click()
  await dialog.getByTestId('blame-show-commit').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await app.close()
})

test('storia del file dal menu: ricerca path:, solo i suoi commit, file preselezionato', async () => {
  const { app, page } = await launch([repoWithFiles()])
  await page.getByTestId('commit-row').filter({ hasText: 'modifica app' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await chooseNextMenuItem(app, 'File History')
  await page.getByTestId('file-row').filter({ hasText: 'src/app.ts' }).click({ button: 'right' })
  const search = page.getByTestId('history-search')
  await expect(search).toHaveValue('path:"src/app.ts"')
  const rows = page.getByTestId('commit-row')
  await expect(rows).toHaveText([/modifica app/, /aggiunge app/])
  // Il commit più recente, con il file già selezionato (non file1.txt, che nella lista viene prima)
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await expect(page.locator('[data-testid="file-row"].selected')).toContainText('src/app.ts')
  await search.press('Escape')
  await expect(rows).toHaveCount(4)
  await app.close()
})

test('blame dalle modifiche locali e dall albero: riga non ancora nel commit, pulsante Blame', async () => {
  const repo = repoWithFiles()
  writeFileSync(join(repo, 'file1.txt'), '1\nuno\ndue\ntre\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('page-working').click()
  await chooseNextMenuItem(app, 'Blame')
  await page.getByTestId('working-file').filter({ hasText: 'file1.txt' }).click({ button: 'right' })
  const dialog = page.getByTestId('blame-dialog')
  await expect(dialog.getByTestId('blame-revision')).toHaveText('Local version')
  await expect(dialog.getByTestId('blame-line').last()).toContainText('Not committed yet')
  await dialog.getByTestId('blame-close').click()
  await expect(dialog).toBeHidden()

  await page.getByTestId('page-history').click()
  await page.getByTestId('detail-tree').click()
  await page.getByTestId('tree-row').filter({ hasText: 'file1.txt' }).click()
  await page.getByTestId('file-blame').click()
  await expect(dialog.getByTestId('blame-revision')).toHaveText(git(repo, 'rev-parse', '--short=7', 'HEAD').trim())
  await expect(dialog.getByTestId('blame-line')).toHaveCount(3)
  await app.close()
})
