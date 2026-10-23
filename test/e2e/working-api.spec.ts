import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Api } from '../../src/shared/ipc'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: stato, stage, commit e percorsi non validi', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch()
  await page.evaluate((r) => (globalThis as unknown as Win).api.openRepo(r), repo)

  const status = await page.evaluate((r) => (globalThis as unknown as Win).api.workingStatus(r), repo)
  expect(status).toMatchObject({ ok: true, value: { unstaged: [{ path: 'file1.txt', status: 'M' }] } })

  expect(await page.evaluate((r) => (globalThis as unknown as Win).api.stage(r, ['file1.txt']), repo)).toMatchObject({ ok: true })
  expect(await page.evaluate((r) => (globalThis as unknown as Win).api.commit(r, 'dalla ui', false), repo)).toMatchObject({ ok: true })
  expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe('dalla ui')

  const outside = await page.evaluate((r) => (globalThis as unknown as Win).api.stage(r, ['../fuori.txt']), repo)
  expect(outside.ok).toBe(false)
  const badRef = await page.evaluate((r) => (globalThis as unknown as Win).api.stashAction(r, 'drop', '--all'), repo)
  expect(badRef.ok).toBe(false)
  await app.close()
})
