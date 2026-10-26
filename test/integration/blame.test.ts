import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBlame } from '../../src/main/git/blame'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

const commitAll = (repo: string, message: string) => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD').trim()
}

describe('readBlame', () => {
  it('a un commit, dopo una rinomina e sul disco con una riga nuova', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(repo, 'file1.txt'), '1\ndue\n')
    const second = commitAll(repo, 'seconda riga')
    git(repo, 'mv', 'file1.txt', 'città.txt')
    const renamed = commitAll(repo, 'rinomina')

    const b = await readBlame(runner, renamed, 'città.txt', false)
    expect(b.lines).toEqual([
      { sha: first, text: '1' },
      { sha: second, text: 'due' },
    ])
    expect(b.commits[second]).toMatchObject({
      author: 'Test',
      authorEmail: 'test@example.com',
      summary: 'seconda riga',
      previous: { sha: first, path: 'file1.txt' },
    })
    expect(b.commits[first].previous).toBeUndefined()

    writeFileSync(join(repo, 'città.txt'), '1\ndue\ntre\n')
    const local = await readBlame(runner, null, 'città.txt', false)
    const sha = local.lines[2].sha
    expect(sha).toMatch(/^0+$/)
    expect(local.commits[sha].previous).toEqual({ sha: renamed, path: 'città.txt' })
  })

  it('-w: una riga cambiata solo negli spazi resta del commit di prima; file binario', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(repo, 'file1.txt'), '  1\n')
    const spaces = commitAll(repo, 'spazi')
    expect((await readBlame(runner, spaces, 'file1.txt', false)).lines[0].sha).toBe(spaces)
    expect((await readBlame(runner, spaces, 'file1.txt', true)).lines[0].sha).toBe(first)

    writeFileSync(join(repo, 'bin.dat'), Buffer.from([0, 1, 2, 10, 3]))
    const bin = commitAll(repo, 'binario')
    expect(await readBlame(runner, bin, 'bin.dat', false)).toMatchObject({ binary: true, lines: [] })
  })
})
