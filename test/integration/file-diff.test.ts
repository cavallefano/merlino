import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCommitFileDiff } from '../../src/main/git/diff'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

const options = { ignoreWhitespace: false, force: false }
const commitAll = (repo: string, message: string) => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD').trim()
}

describe('readCommitFileDiff', () => {
  it('modifica, rinomina e spazi ignorati', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    writeFileSync(join(repo, 'file1.txt'), '1\ndue\n')
    const sha = commitAll(repo, 'modifica')
    const d = await readCommitFileDiff(runner, sha, { path: 'file1.txt' }, options)
    expect(d.hunks[0].lines).toEqual([
      { type: 'context', text: '1', oldNo: 1, newNo: 1 },
      { type: 'add', text: 'due', oldNo: null, newNo: 2 },
    ])

    git(repo, 'mv', 'file1.txt', 'nuovo.txt')
    const renamed = commitAll(repo, 'rinomina')
    expect(await readCommitFileDiff(runner, renamed, { path: 'nuovo.txt', oldPath: 'file1.txt' }, options)).toMatchObject({
      oldPath: 'file1.txt',
      hunks: [],
    })

    writeFileSync(join(repo, 'nuovo.txt'), '1\n  due\n')
    const spaces = commitAll(repo, 'spazi')
    expect((await readCommitFileDiff(runner, spaces, { path: 'nuovo.txt' }, { ...options, ignoreWhitespace: true })).hunks).toEqual([])
  })

  it('oltre 20.000 righe: tooLarge, poi force', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    writeFileSync(join(repo, 'grande.txt'), Array.from({ length: 20_001 }, (_, i) => `riga ${i}`).join('\n') + '\n')
    const sha = commitAll(repo, 'grande')
    expect(await readCommitFileDiff(runner, sha, { path: 'grande.txt' }, options)).toMatchObject({ tooLarge: true, hunks: [] })
    const forced = await readCommitFileDiff(runner, sha, { path: 'grande.txt' }, { ...options, force: true })
    expect(forced.hunks[0].lines).toHaveLength(20_001)
  })
})
