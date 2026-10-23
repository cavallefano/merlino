import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { git } from '../helpers/repo'
import { demoPulls, demoRepo, fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'

type Win = { api: Api }

test('window.api: account, remote, lista e modifiche di una PR con il server finto; il token non arriva al renderer', async () => {
  const repo = demoRepo('git.example.com', (n) => `refs/pull/${n}/head`)
  const server = await fakeHosting(demoPulls(repo))
  const { app, page } = await launch([], tempUserData(), { MERLINO_E2E_API: server.url })
  await page.evaluate((r) => (globalThis as unknown as Win).api.openRepo(r), repo.clone)

  const bad = await page.evaluate(() => (globalThis as unknown as Win).api.addAccount('github', 'git.example.com', 'wrong'))
  expect(bad).toMatchObject({ ok: false, error: { code: 'auth' } })
  const added = await page.evaluate(() => (globalThis as unknown as Win).api.addAccount('github', 'git.example.com', 'good-token'))
  expect(added).toMatchObject({ ok: true, value: { account: { username: 'ada', host: 'git.example.com', service: 'github' } } })

  const remotes = await page.evaluate((r) => (globalThis as unknown as Win).api.prRemotes(r), repo.clone)
  expect(remotes).toMatchObject({ ok: true, value: [{ name: 'origin', host: 'git.example.com', account: { username: 'ada' } }] })
  const list = await page.evaluate((r) => (globalThis as unknown as Win).api.prList(r, 'origin', 'open'), repo.clone)
  expect(list.ok && list.value.map((p) => p.number)).toEqual([1, 2])

  const refs = git(repo.clone, 'for-each-ref')
  const changes = await page.evaluate(
    ({ r, base, head }) => (globalThis as unknown as Win).api.prChanges(r, 'origin', 1, { base: 'main', baseSha: base, headSha: head }),
    { r: repo.clone, base: repo.baseSha, head: repo.loginSha },
  )
  expect(changes).toMatchObject({ ok: true, value: { commits: [{ subject: 'Add the login page' }], files: [{ path: 'login.txt', status: 'A' }] } })
  expect(git(repo.clone, 'for-each-ref')).toBe(refs)

  const evil = await page.evaluate((r) => (globalThis as unknown as Win).api.prList(r, '--upload-pack=x', 'open'), repo.clone)
  expect(evil.ok).toBe(false)
  expect(JSON.stringify(await page.evaluate(() => (globalThis as unknown as Win).api.getSettings()))).not.toContain('good-token')
  await app.close()
  await server.close()
})
