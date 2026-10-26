import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

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
