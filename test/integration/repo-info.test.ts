import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readRepoInfo } from '../../src/main/git/repo-info'
import { GitRunner } from '../../src/main/git/runner'
import type { CommandLogEntry } from '../../src/shared/types'
import { git, makeRepo } from '../helpers/repo'

const info = (cwd: string) => readRepoInfo(new GitRunner(() => 'git', cwd))

describe('readRepoInfo', () => {
  it('repo con commit', async () => {
    const repo = makeRepo(1)
    expect(await info(repo)).toEqual({
      root: repo,
      name: basename(repo),
      branch: 'main',
      headSha: git(repo, 'rev-parse', 'HEAD').trim(),
    })
  })

  it('da una sottocartella trova la radice', async () => {
    const repo = makeRepo(1)
    mkdirSync(join(repo, 'a', 'b'), { recursive: true })
    expect((await info(join(repo, 'a', 'b'))).root).toBe(repo)
  })

  it('HEAD staccato', async () => {
    const repo = makeRepo(2)
    git(repo, 'checkout', '-q', '--detach', 'HEAD~1')
    const r = await info(repo)
    expect(r.branch).toBeNull()
    expect(r.headSha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('repo senza commit, senza errori nel log', async () => {
    const repo = makeRepo(0)
    const log: CommandLogEntry[] = []
    const r = await readRepoInfo(new GitRunner(() => 'git', repo, (e) => log.push(e)))
    expect(r).toMatchObject({ branch: 'main', headSha: null })
    expect(log.every((e) => e.ok)).toBe(true)
  })

  it('cartella che non è un repo', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-norepo-')))
    await expect(info(dir)).rejects.toThrow(/not a git repository/)
  })
})
