import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { makeRemotePair } from '../helpers/repo'
import { launch } from './launch'
import { chooseNextMenuItem } from './menu'

type Win = { api: Api }

test('window.api: ref, comandi git validati, menu contestuale', async () => {
  const { clone } = makeRemotePair()
  const { app, page } = await launch()
  await page.evaluate((r) => (globalThis as unknown as Win).api.openRepo(r), clone)

  const created = await page.evaluate(
    (r) => (globalThis as unknown as Win).api.git(r, { kind: 'createBranch', name: 'feature/api', start: 'HEAD', checkout: true }),
    clone,
  )
  expect(created.ok).toBe(true)
  const refs = await page.evaluate((r) => (globalThis as unknown as Win).api.refs(r), clone)
  expect(refs).toMatchObject({ ok: true, value: { remotes: [{ name: 'origin' }] } })
  if (!refs.ok) throw new Error(refs.error.message)
  expect(refs.value.branches.find((b) => b.current)?.name).toBe('feature/api')

  const evil = await page.evaluate(
    (r) => (globalThis as unknown as Win).api.git(r, { kind: 'checkoutBranch', name: '--orphan=x' }),
    clone,
  )
  expect(evil.ok).toBe(false)

  await chooseNextMenuItem(app, 'Seconda')
  const chosen = await page.evaluate(() =>
    (globalThis as unknown as Win).api.contextMenu([
      { id: 'uno', label: 'Prima' },
      { separator: true },
      { id: 'due', label: 'Seconda' },
    ]),
  )
  expect(chosen).toBe('due')
  await app.close()
})
