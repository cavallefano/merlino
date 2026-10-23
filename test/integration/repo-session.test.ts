import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RepoSession } from '../../src/main/repo-session'
import { watchRepo } from '../../src/main/watcher'
import { git, makeRepo } from '../helpers/repo'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('RepoSession', () => {
  it('segnala modifiche ai file e ai ref, e smette dopo dispose', async () => {
    const repo = makeRepo(1)
    const session = new RepoSession(repo, () => 'git', () => {})
    let calls = 0
    await session.start(() => calls++)

    writeFileSync(join(repo, 'nuovo.txt'), 'x')
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 5000 })

    calls = 0
    git(repo, 'switch', '-q', '-c', 'altro')
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 5000 })

    await session.dispose()
    calls = 0
    writeFileSync(join(repo, 'dopo.txt'), 'x')
    await sleep(1000)
    expect(calls).toBe(0)
  })
})

describe('watchRepo', () => {
  it('raggruppa le modifiche ravvicinate (debounce)', async () => {
    const repo = makeRepo(1)
    let calls = 0
    const stop = await watchRepo(repo, () => calls++)
    for (let i = 0; i < 20; i++) writeFileSync(join(repo, `f${i}.txt`), 'x')
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 5000 })
    await sleep(600)
    expect(calls).toBeLessThan(20)
    await stop()
  })
})
