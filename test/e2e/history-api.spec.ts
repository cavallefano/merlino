import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: storia, dettaglio, diff e SHA non validi', async () => {
  const repo = makeRepo(2)
  const sha = git(repo, 'rev-parse', 'HEAD').trim()
  const a = { repo, sha }
  const { app, page } = await launch()

  await page.evaluate((x) => (globalThis as unknown as Win).api.openRepo(x.repo), a)
  const summary = await page.evaluate((x) => (globalThis as unknown as Win).api.historyLoad(x.repo, ''), a)
  expect(summary).toMatchObject({ ok: true, value: { total: 2, lanes: 1 } })

  const history = await page.evaluate((x) => (globalThis as unknown as Win).api.historyPage(x.repo, 0, 10), a)
  if (!history.ok) throw new Error(history.error.message)
  expect(history.value.commits.map((c) => c.subject)).toEqual(['commit 2', 'commit 1'])

  const counts = await page.evaluate((x) => (globalThis as unknown as Win).api.historyFileCounts(x.repo, 0, 10), a)
  expect(counts).toMatchObject({ ok: true, value: { [history.value.commits[0].sha]: 1, [history.value.commits[1].sha]: 1 } })
  const badCount = await page.evaluate((x) => (globalThis as unknown as Win).api.historyFileCounts(x.repo, -1, 10), a)
  expect(badCount.ok).toBe(false)

  const detail = await page.evaluate((x) => (globalThis as unknown as Win).api.commitDetail(x.repo, x.sha), a)
  expect(detail).toMatchObject({ ok: true, value: { files: [{ path: 'file2.txt', status: 'A' }] } })

  const diff = await page.evaluate(
    (x) => (globalThis as unknown as Win).api.commitFileDiff(x.repo, x.sha, { path: 'file2.txt' }, { ignoreWhitespace: false, force: false }),
    a,
  )
  expect(diff).toMatchObject({ ok: true, value: { hunks: [{ lines: [{ type: 'add', text: '2' }] }] } })

  const bad = await page.evaluate((x) => (globalThis as unknown as Win).api.commitDetail(x.repo, '--output=/tmp/merlino-x'), a)
  expect(bad.ok).toBe(false)
  await app.close()
})
