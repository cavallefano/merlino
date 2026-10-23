import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Api } from '../../src/shared/ipc'
import { git } from '../helpers/repo'
import { demoPulls, demoRepo, fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'
import { chooseNextMenuItem } from './menu'

type Win = { api: Api }

test('git flow: initialize, start di una feature, finish locale dal menu del branch', async () => {
  const repo = demoRepo('git.example.com', (n) => `refs/pull/${n}/head`)
  const { app, page } = await launch([repo.clone], tempUserData())
  await expect(page.getByTestId('commit-row').first()).toBeVisible()

  await chooseNextMenuItem(app, 'Initialize Git Flow…')
  await page.getByTestId('flow-button').click()
  await expect(page.getByTestId('flow-main')).toHaveValue('main')
  await expect(page.getByTestId('flow-develop')).toHaveValue('develop')
  await page.getByTestId('flow-init-save').click()
  // git config esce con 1 finché la chiave non c'è: si riprova
  const developKey = () => {
    try {
      return git(repo.clone, 'config', 'gitflow.branch.develop').trim()
    } catch {
      return ''
    }
  }
  await expect.poll(developKey).toBe('develop')

  await chooseNextMenuItem(app, 'Start Feature…')
  await page.getByTestId('flow-button').click()
  await page.getByTestId('flow-name').fill('search')
  await page.getByTestId('flow-start').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('feature/search')

  writeFileSync(join(repo.clone, 'search.txt'), 'search\n')
  git(repo.clone, 'add', '.')
  git(repo.clone, 'commit', '-q', '-m', 'Add search')
  await page.getByTestId('repo-refresh').click()

  await chooseNextMenuItem(app, 'Finish Feature search…')
  // Sul nome esatto: è il branch corrente, la riga contiene anche HEAD
  await page.getByTestId('branch-item').filter({ has: page.locator('.name', { hasText: /^search$/ }) }).click({ button: 'right' })
  await expect(page.getByTestId('flow-steps')).toContainText('Merge feature/search into develop')
  await page.getByTestId('flow-finish').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('develop')
  expect(git(repo.clone, 'log', '-1', '--format=%s', 'develop').trim()).toBe("Merge branch 'feature/search' into develop")
  expect(git(repo.clone, 'branch', '--list', 'feature/search').trim()).toBe('')
  await app.close()
})

test('git flow: finish via pull request apre la nuova PR verso develop', async () => {
  const repo = demoRepo('git.example.com', (n) => `refs/pull/${n}/head`)
  const server = await fakeHosting(demoPulls(repo))
  const { app, page } = await launch([repo.clone], tempUserData(), { MERLINO_E2E_API: server.url })
  await page.evaluate(() => (globalThis as unknown as Win).api.addAccount('github', 'git.example.com', 'good-token'))
  git(repo.clone, 'config', 'gitflow.branch.master', 'main')
  git(repo.clone, 'config', 'gitflow.branch.develop', 'develop')
  git(repo.clone, 'branch', 'develop', 'main')
  git(repo.clone, 'switch', '-q', '-c', 'feature/export')
  writeFileSync(join(repo.clone, 'export.txt'), 'export\n')
  git(repo.clone, 'add', '.')
  git(repo.clone, 'commit', '-q', '-m', 'Add export')
  await expect(page.getByTestId('commit-row').first()).toBeVisible()
  await page.getByTestId('repo-refresh').click()

  await chooseNextMenuItem(app, 'Finish Feature export…')
  await page.getByTestId('flow-button').click()
  await page.getByTestId('flow-way-pr').check()
  await page.getByTestId('flow-finish').click()
  await expect(page.getByTestId('create-base')).toHaveValue('develop')
  await expect(page.getByTestId('create-head')).toHaveValue('feature/export')
  await app.close()
  await server.close()
})
