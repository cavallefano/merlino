import { expect, type Page, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git } from '../helpers/repo'
import { demoPulls, demoRepo, fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'
import { chooseNextMenuItem } from './menu'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Impostazioni → Account: token rifiutato, poi collegato; il server segue il servizio; rimozione', async () => {
  const server = await fakeHosting([])
  const { app, page } = await launch([], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByText('Open Repository…')).toBeVisible()
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-accounts').click()
  await page.getByTestId('account-add').click()
  await expect(page.getByTestId('account-host')).toHaveValue('github.com')
  await page.getByTestId('account-service').selectOption('gitlab')
  await expect(page.getByTestId('account-host')).toHaveValue('gitlab.com')
  await page.getByTestId('account-host').fill('gitlab.example.com')
  await page.getByTestId('account-token').fill('wrong')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-error')).toHaveText('The token for gitlab.example.com is not valid or has expired')
  await page.getByTestId('account-token').fill('good-token')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-connected')).toHaveText('Connected as ada (gitlab.example.com)')
  await expect(page.getByTestId('account-row')).toHaveText([/GitLab.*ada@gitlab\.example\.com/])
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('account-remove').click()
  await expect(page.getByTestId('account-row')).toHaveCount(0)
  await app.close()
  await server.close()
})

/** Impostazioni → Account → Aggiungi, con il token del server finto; poi torna al repo. */
async function addAccount(page: Page, host: string, service: 'github' | 'gitlab' = 'github') {
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-accounts').click()
  await page.getByTestId('account-add').click()
  await page.getByTestId('account-service').selectOption(service)
  await page.getByTestId('account-host').fill(host)
  await page.getByTestId('account-token').fill('good-token')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-connected')).toHaveText(`Connected as ada (${host})`)
  await page.keyboard.press('Escape')
}

/** Repo di prova, server finto e Merlino con il repo aperto. */
async function start(host = 'git.example.com', prRef = (n: number) => `refs/pull/${n}/head`) {
  const repo = demoRepo(host, prRef)
  const server = await fakeHosting(demoPulls(repo))
  const { app, page } = await launch([repo.clone], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByTestId('commit-row').first()).toBeVisible()
  return { repo, server, app, page }
}

test('lista: account dalla vista, numero nella sidebar, CI, ricerca e filtro; ⌘1 e ⌘2', async () => {
  const { server, app, page } = await start()
  await page.getByTestId('page-pull-requests').click()
  await expect(page.getByTestId('pr-no-account')).toContainText('No account for git.example.com')
  await page.getByTestId('pr-connect').click()
  await expect(page.getByTestId('account-host')).toHaveValue('git.example.com')
  await page.getByTestId('account-token').fill('good-token')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-connected')).toHaveText('Connected as ada (git.example.com)')
  await page.keyboard.press('Escape')

  await expect(page.getByTestId('pr-row')).toHaveCount(2)
  await expect(page.getByTestId('page-pull-requests')).toContainText('2')
  await expect(page.getByTestId('pr-row').nth(0).getByTestId('pr-ci')).toHaveAttribute('data-state', 'passed')
  await expect(page.getByTestId('pr-row').nth(1).getByTestId('pr-ci')).toHaveAttribute('data-state', 'failed')
  await expect(page.getByTestId('pr-row').nth(1)).toContainText('grace:fix-typo → main')
  await page.getByTestId('pr-search').fill('login')
  await expect(page.getByTestId('pr-row')).toHaveCount(1)
  await page.getByTestId('pr-search').fill('')
  await page.getByTestId('pr-filter').selectOption('merged')
  await expect(page.getByTestId('pr-row')).toHaveText([/Old experiment/])

  await page.keyboard.press(`${mod}+1`)
  await expect(page.getByTestId('history-search')).toBeVisible()
  await page.keyboard.press(`${mod}+2`)
  await expect(page.getByTestId('pr-search')).toBeVisible()
  await app.close()
  await server.close()
})

test('dettaglio: Markdown, check, commento con ⌘↩, commit e modifiche scaricati con git senza ref nuovi', async () => {
  const { repo, server, app, page } = await start()
  await addAccount(page, 'git.example.com')
  await page.keyboard.press(`${mod}+2`)
  await page.getByTestId('pr-row').first().click()
  await expect(page.getByTestId('pr-title')).toContainText('Add the login page')
  await expect(page.getByTestId('pr-state')).toHaveText('Open')
  await expect(page.locator('.markdown strong')).toHaveText('login')
  await expect(page.getByTestId('timeline-comment')).toContainText('Looks good')
  await page.getByTestId('pr-ci-summary').click()
  await expect(page.getByTestId('ci-group')).toContainText('Other checks')
  await page.getByTestId('ci-group-head').click()
  await expect(page.getByTestId('ci-job')).toContainText('test')
  await page.getByTestId('pr-tab-conversation').click()

  await page.getByTestId('pr-comment').fill('Ship it')
  await page.getByTestId('pr-comment').press(`${mod}+Enter`)
  await expect(page.getByTestId('timeline-comment')).toHaveCount(2)
  expect(server.requests.some((r) => r.line === 'POST /api/v3/repos/acme/demo-app/issues/1/comments')).toBe(true)

  await page.getByTestId('pr-tab-commits').click()
  await expect(page.getByTestId('pr-commit')).toHaveText([/Add the login page/])
  await page.getByTestId('pr-commit').click()
  await expect(page.getByTestId('commit-message')).toContainText('Add the login page')
  await page.getByTestId('pr-back').click()
  await page.getByTestId('pr-tab-changes').click()
  await expect(page.getByTestId('pr-file')).toHaveText([/login\.txt/])
  await expect(page.getByTestId('diff-line-add')).toHaveText([/login/])
  expect(git(repo.clone, 'for-each-ref', '--format=%(refname)')).not.toContain('pull')
  await app.close()
  await server.close()
})

test('checkout di una PR da fork (pr/2) e di una dello stesso repository; chiudi e riapri', async () => {
  const { repo, server, app, page } = await start()
  await addAccount(page, 'git.example.com')
  await page.getByTestId('page-pull-requests').click()
  await page.getByTestId('pr-row').nth(1).click()
  await page.getByTestId('pr-checkout').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('pr/2')
  expect(git(repo.clone, 'rev-parse', 'HEAD').trim()).toBe(repo.forkSha)

  await page.getByTestId('pr-row').first().click()
  await page.getByTestId('pr-checkout').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('feature/login')
  expect(git(repo.clone, 'rev-parse', '--abbrev-ref', 'feature/login@{u}').trim()).toBe('origin/feature/login')

  await page.getByTestId('pr-close').click()
  await expect(page.getByTestId('pr-state')).toHaveText('Closed')
  await page.getByTestId('pr-reopen').click()
  await expect(page.getByTestId('pr-state')).toHaveText('Open')
  await app.close()
  await server.close()
})

test('merge: metodi del repo, messaggio proposto, SHA mostrato; poi la PR è unita', async () => {
  const { repo, server, app, page } = await start()
  await addAccount(page, 'git.example.com')
  await page.keyboard.press(`${mod}+2`)
  await page.getByTestId('pr-row').first().click()
  await page.getByTestId('pr-merge').click()
  await expect(page.getByTestId('merge-method').locator('option')).toHaveText(['Merge commit', 'Squash and merge'])
  await expect(page.getByTestId('merge-message')).toHaveValue('Merge pull request #1 from acme/feature/login\n\nAdd the login page')
  await page.getByTestId('merge-method').selectOption('squash')
  await expect(page.getByTestId('merge-message')).toHaveValue('Add the login page (#1)\n\nAdds **login** with a form.')
  await page.getByTestId('merge-confirm').click()
  await expect(page.getByTestId('pr-state')).toHaveText('Merged')
  expect(server.requests.find((r) => r.line === 'PUT /api/v3/repos/acme/demo-app/pulls/1/merge')?.body).toMatchObject({
    merge_method: 'squash',
    sha: repo.loginSha,
    commit_title: 'Add the login page (#1)',
  })
  await expect(page.getByTestId('pr-row')).toHaveCount(1)
  await app.close()
  await server.close()
})

test('nuova pull request dal menu del branch: titolo dal commit, push del branch, poi la PR si apre', async () => {
  const { repo, server, app, page } = await start()
  git(repo.clone, 'switch', '-q', '-c', 'feature/search')
  writeFileSync(join(repo.clone, 'search.txt'), 'search\n')
  git(repo.clone, 'add', '.')
  git(repo.clone, 'commit', '-q', '-m', 'Add search\n\nWith filters.')
  git(repo.clone, 'switch', '-q', 'main')
  await addAccount(page, 'git.example.com')
  await expect(page.getByTestId('branch-item').filter({ hasText: /^search$/ })).toBeVisible()

  await chooseNextMenuItem(app, 'Create Pull Request from feature/search…')
  await page.getByTestId('branch-item').filter({ hasText: /^search$/ }).click({ button: 'right' })
  await expect(page.getByTestId('create-base')).toHaveValue('main')
  await expect(page.getByTestId('create-title')).toHaveValue('Add search')
  await expect(page.getByTestId('create-body')).toHaveValue('With filters.')
  await expect(page.getByTestId('create-push')).toContainText('feature/search')
  await page.getByTestId('create-draft').check()
  await page.getByTestId('create-confirm').click()

  await expect(page.getByTestId('pr-title')).toContainText('Add search')
  expect(git(repo.bare, 'branch', '--list', 'feature/search').trim()).toBe('feature/search')
  expect(server.requests.find((r) => r.line === 'POST /api/v3/repos/acme/demo-app/pulls')?.body).toEqual({
    title: 'Add search',
    body: 'With filters.',
    head: 'feature/search',
    base: 'main',
    draft: true,
  })
  await app.close()
  await server.close()
})

test('GitLab: lista, dettaglio con le note e modifiche dalla merge request', async () => {
  const { server, app, page } = await start('gitlab.example.com', (n) => `refs/merge-requests/${n}/head`)
  await addAccount(page, 'gitlab.example.com', 'gitlab')
  await page.getByTestId('page-pull-requests').click()
  await expect(page.getByTestId('pr-row')).toHaveCount(2)
  await expect(page.getByTestId('pr-row').nth(1).getByTestId('pr-ci')).toHaveAttribute('data-state', 'failed')
  await page.getByTestId('pr-row').first().click()
  await expect(page.getByTestId('timeline-comment')).toContainText('Looks good')
  await page.getByTestId('pr-tab-changes').click()
  await expect(page.getByTestId('pr-file')).toHaveText([/login\.txt/])
  await app.close()
  await server.close()
})

test('GitLab: pipeline in corso con 40 job, barra nella lista e controlli per stage con filtro', async () => {
  const repo = demoRepo('gitlab.example.com', (n) => `refs/merge-requests/${n}/head`)
  const pulls = demoPulls(repo)
  // build finito, test in corso, deploy in coda: 15 finiti su 40
  const jobs = (stage: string, n: number, state: (i: number) => 'success' | 'pending' | 'queued') =>
    Array.from({ length: n }, (_, i) => ({ name: `${stage}:${i + 1}`, stage, state: state(i) }))
  pulls[0].checks = [
    ...jobs('build', 4, () => 'success'),
    ...jobs('test', 24, (i) => (i < 11 ? 'success' : i < 14 ? 'pending' : 'queued')),
    ...jobs('deploy', 12, () => 'queued'),
  ]
  const server = await fakeHosting(pulls)
  const { app, page } = await launch([repo.clone], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByTestId('commit-row').first()).toBeVisible()
  await addAccount(page, 'gitlab.example.com', 'gitlab')
  await page.getByTestId('page-pull-requests').click()

  const row = page.getByTestId('pr-row').first()
  await expect(row.getByTestId('ci-progress-text')).toContainText('15/40 · test')
  await expect(row.getByTestId('ci-progress')).toHaveAttribute('title', '15 passed · 3 in progress · 22 queued')
  // La pipeline della #2 è finita: solo l'icona
  await expect(page.getByTestId('pr-row').nth(1).getByTestId('ci-progress')).toHaveCount(0)

  await row.getByTestId('ci-progress').click()
  await expect(page.getByTestId('pr-tab-checks')).toHaveClass(/active/)
  await expect(page.getByTestId('pr-tab-checks')).toContainText('(40)')
  await expect(page.getByTestId('ci-group')).toHaveCount(3)
  // Aperto solo test, che ha job in corso
  await expect(page.getByTestId('ci-job')).toHaveCount(24)
  await page.getByTestId('ci-filter').fill('deploy:1')
  await expect(page.getByTestId('ci-group')).toHaveCount(1)
  await expect(page.getByTestId('ci-job').locator('.name')).toHaveText(['deploy:1', 'deploy:10', 'deploy:11', 'deploy:12'])
  await app.close()
  await server.close()
})
