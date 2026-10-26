import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: blame, albero e contenuto; SHA e percorsi non validi', async () => {
  const repo = makeRepo(1)
  const a = { repo, sha: git(repo, 'rev-parse', 'HEAD').trim() }
  const { app, page } = await launch()
  await page.evaluate((x) => (globalThis as unknown as Win).api.openRepo(x.repo), a)

  const r = await page.evaluate(async (x) => {
    const api = (globalThis as unknown as Win).api
    return {
      blame: await api.blame(x.repo, x.sha, 'file1.txt', false),
      local: await api.blame(x.repo, null, 'file1.txt', true),
      tree: await api.treeList(x.repo, x.sha, ''),
      content: await api.fileContent(x.repo, x.sha, 'file1.txt', false),
      missing: await api.fileContent(x.repo, x.sha, 'manca.txt', false),
      option: await api.blame(x.repo, '--output=/tmp/merlino-x', 'file1.txt', false),
      outside: await api.fileContent(x.repo, x.sha, '../fuori.txt', false),
      dir: await api.treeList(x.repo, x.sha, '/etc'),
    }
  }, a)
  expect(r.blame).toMatchObject({ ok: true, value: { lines: [{ sha: a.sha, text: '1' }] } })
  expect(r.local).toMatchObject({ ok: true, value: { lines: [{ sha: a.sha, text: '1' }] } })
  expect(r.tree).toEqual({ ok: true, value: [{ name: 'file1.txt', path: 'file1.txt', kind: 'file' }] })
  expect(r.content).toEqual({ ok: true, value: { binary: false, tooLarge: false, text: '1\n' } })
  expect(r.missing).toEqual({ ok: true, value: null })
  expect([r.option.ok, r.outside.ok, r.dir.ok]).toEqual([false, false, false])
  await app.close()
})
