import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: controllo git, apertura repo e log dei comandi', async () => {
  const repo = makeRepo(1)
  const { app, page } = await launch()

  const check = await page.evaluate(() => (globalThis as unknown as Win).api.checkGit())
  expect(check.ok).toBe(true)

  const opened = await page.evaluate((p) => (globalThis as unknown as Win).api.openRepo(p), repo)
  expect(opened).toMatchObject({ ok: true, value: { root: repo, branch: 'main' } })

  const missing = await page.evaluate(() => (globalThis as unknown as Win).api.openRepo('/percorso/inesistente'))
  expect(missing.ok).toBe(false)

  const log = await page.evaluate(() => (globalThis as unknown as Win).api.getCommandLog())
  expect(log.some((e) => e.args.join(' ') === 'rev-parse --show-toplevel')).toBe(true)

  const settings = await page.evaluate(() => (globalThis as unknown as Win).api.getSettings())
  expect(settings.openRepos).toEqual([repo])
  expect(settings.recentRepos).toEqual([repo])

  await app.close()
})
