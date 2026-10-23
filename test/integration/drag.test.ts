import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dragFile } from '../../src/main/drag-file'
import { fastForward, pushBranch } from '../../src/main/git/branches'
import { GitRunner } from '../../src/main/git/runner'
import { applyFileChanges, stashFiles } from '../../src/main/git/working'
import { git, makeRemotePair, makeRepo } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})
const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}

describe('operazioni del drag & drop', () => {
  it('push di un branch non corrente, anche con un altro nome, con upstream', async () => {
    const { bare, clone: repo } = makeRemotePair()
    git(repo, 'branch', 'feature/a')
    await pushBranch(runnerFor(repo), 'origin', 'feature/a', 'feature/a', () => {})
    await pushBranch(runnerFor(repo), 'origin', 'feature/a', 'altro-nome', () => {})
    expect(git(bare, 'branch', '--list').split('\n').map((l) => l.trim())).toEqual(expect.arrayContaining(['feature/a', 'altro-nome']))
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'feature/a@{u}').trim()).toBe('origin/altro-nome')
  })

  it('fast-forward di un branch non corrente; se non si può, messaggio dedicato', async () => {
    const { clone: repo } = makeRemotePair()
    git(repo, 'branch', 'indietro')
    commitFile(repo, 'n.txt', 'n\n', 'nuovo')
    git(repo, 'push', '-q', 'origin', 'main')
    git(repo, 'switch', '-q', '-c', 'lavoro')
    await fastForward(runnerFor(repo), 'indietro', 'origin/main')
    expect(git(repo, 'log', '-1', '--format=%s', 'indietro').trim()).toBe('nuovo')

    git(repo, 'switch', '-q', 'indietro')
    commitFile(repo, 'l.txt', 'l\n', 'solo locale')
    git(repo, 'switch', '-q', 'lavoro')
    await expect(fastForward(runnerFor(repo), 'indietro', 'origin/main')).rejects.toThrow(/cannot be fast-forwarded to origin\/main/)
  })

  it('stash solo dei file indicati, anche non tracciati', async () => {
    const repo = makeRepo(2)
    writeFileSync(join(repo, 'file1.txt'), 'cambiato 1\n')
    writeFileSync(join(repo, 'file2.txt'), 'cambiato 2\n')
    writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
    await stashFiles(runnerFor(repo), ['file1.txt'], false)
    expect(git(repo, 'status', '--porcelain').split('\n').filter(Boolean)).toEqual([' M file2.txt', '?? nuovo.txt'])
    await stashFiles(runnerFor(repo), ['nuovo.txt'], true)
    expect(git(repo, 'status', '--porcelain').trim()).toBe('M file2.txt')
    expect(git(repo, 'stash', 'list').trim().split('\n')).toHaveLength(2)
  })

  it('applica le modifiche di un solo file da un commit e da uno stash', async () => {
    const repo = makeRepo(1)
    git(repo, 'switch', '-q', '-c', 'altro')
    writeFileSync(join(repo, 'file1.txt'), '1\naltro\n')
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'due file')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()
    git(repo, 'switch', '-q', 'main')
    await applyFileChanges(runnerFor(repo), sha, 'file1.txt')
    expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('1\naltro\n')
    expect(git(repo, 'status', '--porcelain').trim()).toBe('M file1.txt')

    git(repo, 'stash', 'push', '-q')
    await applyFileChanges(runnerFor(repo), git(repo, 'rev-parse', 'stash@{0}').trim(), 'file1.txt')
    expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('1\naltro\n')
    await expect(applyFileChanges(runnerFor(repo), sha, 'file1.txt')).rejects.toThrow()
  })
})

describe('file da trascinare fuori', () => {
  it('modifiche: il file vero; commit: il contenuto di quel commit in una cartella temporanea', () => {
    const repo = makeRepo(1)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(repo, 'file1.txt'), 'dopo\n')
    expect(dragFile('git', repo, { path: 'file1.txt' })).toBe(join(repo, 'file1.txt'))
    const copy = dragFile('git', repo, { path: 'file1.txt', sha: first })
    expect(copy).not.toBe(join(repo, 'file1.txt'))
    expect(copy.endsWith('file1.txt')).toBe(true)
    expect(readFileSync(copy, 'utf8')).toBe('1\n')
    expect(() => dragFile('git', repo, { path: 'manca.txt' })).toThrow()
    expect(() => dragFile('git', repo, { path: 'manca.txt', sha: first })).toThrow()
  })
})
