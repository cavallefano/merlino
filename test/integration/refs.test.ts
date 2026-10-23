import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readRefs } from '../../src/main/git/refs'
import { GitRunner } from '../../src/main/git/runner'
import { readStatus } from '../../src/main/git/status'
import { cloneOf, git, makeRemotePair, makeRepo } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})

describe('readRefs', () => {
  it('branch, upstream con avanti/indietro, remote e tag annotati', async () => {
    const { bare, clone } = makeRemotePair()
    writeFileSync(join(clone, 'file1.txt'), 'locale\n')
    git(clone, 'commit', '-q', '-am', 'locale')
    git(clone, 'tag', '-a', 'v1', '-m', 'versione 1')
    const refs = await readRefs(runnerFor(clone))
    expect(refs.branches).toEqual([
      { name: 'main', sha: git(clone, 'rev-parse', 'HEAD').trim(), upstream: 'origin/main', ahead: 1, behind: 0, gone: false, current: true },
    ])
    expect(refs.remotes).toEqual([{ name: 'origin', url: bare, branches: [{ name: 'main', fullName: 'origin/main', sha: git(clone, 'rev-parse', 'origin/main').trim() }] }])
    expect(refs.tags).toEqual([{ name: 'v1', sha: git(clone, 'rev-parse', 'HEAD').trim() }])
  })

  it('repo senza remote', async () => {
    expect((await readRefs(runnerFor(makeRepo(1)))).remotes).toEqual([])
  })
})

describe('GitRunner onProgress e operazioni in corso', () => {
  it('riceve le righe di avanzamento di git fetch --progress', async () => {
    const { bare, clone } = makeRemotePair()
    const other = cloneOf(bare)
    writeFileSync(join(clone, 'grande.txt'), 'x'.repeat(100_000))
    git(clone, 'add', '.')
    git(clone, 'commit', '-q', '-m', 'grande')
    git(clone, 'push', '-q')
    const lines: string[] = []
    await runnerFor(other).run(['fetch', '--progress'], { onProgress: (l) => lines.push(l) })
    expect(lines.length).toBeGreaterThan(0)
  })

  it('stato: merge in corso con conflitto, poi annullato', async () => {
    const repo = makeRepo(1)
    git(repo, 'switch', '-q', '-c', 'altro')
    writeFileSync(join(repo, 'file1.txt'), 'altro\n')
    git(repo, 'commit', '-q', '-am', 'altro')
    git(repo, 'switch', '-q', 'main')
    writeFileSync(join(repo, 'file1.txt'), 'main\n')
    git(repo, 'commit', '-q', '-am', 'main')
    const runner = runnerFor(repo)
    await expect(runner.run(['merge', 'altro'])).rejects.toThrow(/^There are conflicts/)
    expect(await readStatus(runner)).toMatchObject({ operation: 'merge', conflicted: [{ path: 'file1.txt', status: 'U' }] })
    git(repo, 'merge', '--abort')
    expect((await readStatus(runner)).operation).toBeNull()
  })
})
