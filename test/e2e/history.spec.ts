import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

function repoWithMerge(): string {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'feature/x')
  writeFileSync(join(repo, 'file1.txt'), '1\nmodificato\n')
  git(repo, 'commit', '-q', '-am', 'modifica su feature')
  git(repo, 'switch', '-q', 'main')
  git(repo, 'merge', '-q', '--no-ff', 'feature/x', '-m', 'merge feature')
  git(repo, 'tag', 'v1.0')
  return repo
}

test('storia: grafo, etichette, ricerca e aggiornamento automatico', async () => {
  const repo = repoWithMerge()
  const { app, page } = await launch([repo])
  const rows = page.getByTestId('commit-row')
  await expect(rows).toHaveCount(3)
  await expect(page.getByTestId('working-row')).toContainText('Nessuna modifica')
  // il merge conta i file rispetto al primo genitore: solo file1.txt
  await expect(rows.first().getByTestId('commit-files')).toHaveText('1')
  await expect(rows.filter({ hasText: 'modifica su feature' }).getByTestId('commit-files')).toHaveText('1')
  await expect(rows.first()).toContainText('merge feature')
  await expect(rows.first()).toContainText('main')
  await expect(rows.first()).toContainText('v1.0')
  await expect(page.locator('canvas.graph')).toBeVisible()
  await expect(page.getByTestId('commit-message')).toContainText('merge feature')

  await rows.filter({ hasText: 'modifica su feature' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('modifica su feature')
  await page.getByTestId('commit-list').press('ArrowDown')
  await expect(page.getByTestId('commit-message')).toContainText('commit 1')

  const search = page.getByTestId('history-search')
  await search.fill('message:feature')
  await search.press('Enter')
  await expect(rows).toHaveCount(2)
  await search.press('Escape')
  await expect(rows).toHaveCount(3)

  writeFileSync(join(repo, 'nuovo.txt'), 'x\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'commit dal terminale')
  await expect(rows.first()).toContainText('commit dal terminale')
  await app.close()
})

test('dettaglio: file cambiati, diff unificato e affiancato, copia SHA', async () => {
  const repo = repoWithMerge()
  const { app, page } = await launch([repo])
  await page.getByTestId('commit-row').filter({ hasText: 'modifica su feature' }).click()
  await expect(page.getByTestId('file-row')).toHaveText(/file1\.txt/)
  await expect(page.getByTestId('diff-line-add')).toContainText('modificato')
  await expect(page.getByTestId('diff-line-context')).toContainText('1')

  await page.getByTestId('diff-split').click()
  await expect(page.getByTestId('diff-split-view')).toBeVisible()

  await page.getByTestId('copy-sha').click()
  // writeText è asincrono: si aspetta che gli appunti contengano lo SHA
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(git(repo, 'rev-parse', 'feature/x').trim())
  await app.close()
})
