import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkoutBranch,
  checkoutRemote,
  cherryPick,
  clone,
  createBranch,
  createTag,
  deleteBranch,
  fetch,
  merge,
  operation,
  pull,
  push,
  pushTag,
  rebase,
  rebaseInteractive,
  rebaseRange,
  renameBranch,
  reset,
  revert,
} from '../../src/main/git/branches'
import { readRefs } from '../../src/main/git/refs'
import { GitRunner } from '../../src/main/git/runner'
import { readStatus } from '../../src/main/git/status'
import { cloneOf, git, makeRemotePair, makeRepo } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})
const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const current = async (repo: string) => (await readRefs(runnerFor(repo))).branches.find((b) => b.current)
const subjects = (repo: string) => git(repo, 'log', '--format=%s').trim().split('\n')

describe('branch', () => {
  it('crea, checkout, rinomina ed elimina (normale e forzato)', async () => {
    const repo = makeRepo(1)
    const r = runnerFor(repo)
    await createBranch(r, 'feature/a', 'HEAD', false)
    await checkoutBranch(r, 'feature/a')
    expect((await current(repo))?.name).toBe('feature/a')
    commitFile(repo, 'a.txt', 'a\n', 'su feature')
    await checkoutBranch(r, 'main')
    await expect(deleteBranch(r, 'feature/a', false)).rejects.toThrow(/not fully merged/)
    await renameBranch(r, 'feature/a', 'feature/b')
    await deleteBranch(r, 'feature/b', true)
    expect((await readRefs(r)).branches.map((b) => b.name)).toEqual(['main'])
    await createBranch(r, 'subito', 'HEAD', true)
    expect((await current(repo))?.name).toBe('subito')
  })

  it('checkout di un branch remoto: crea il branch locale che lo segue, poi lo riusa', async () => {
    const { bare, clone: first } = makeRemotePair()
    git(first, 'switch', '-q', '-c', 'feature/remota')
    commitFile(first, 'r.txt', 'r\n', 'remota')
    git(first, 'push', '-q', '-u', 'origin', 'feature/remota')
    const other = cloneOf(bare)
    const r = runnerFor(other)
    await checkoutRemote(r, 'origin/feature/remota')
    expect(await current(other)).toMatchObject({ name: 'feature/remota', upstream: 'origin/feature/remota' })
    await checkoutBranch(r, 'main')
    await checkoutRemote(r, 'origin/feature/remota')
    expect((await current(other))?.name).toBe('feature/remota')
  })
})

describe('remote', () => {
  it('push di un branch nuovo imposta l’upstream; fetch e pull dall’altro clone', async () => {
    const { bare, clone: first } = makeRemotePair()
    const other = cloneOf(bare)
    git(first, 'switch', '-q', '-c', 'nuovo')
    commitFile(first, 'n.txt', 'n\n', 'nuovo')
    await push(runnerFor(first), 'origin', false, () => {})
    expect((await current(first))?.upstream).toBe('origin/nuovo')

    await fetch(runnerFor(other), () => {})
    expect((await readRefs(runnerFor(other))).remotes[0].branches.map((b) => b.name)).toContain('nuovo')

    git(first, 'switch', '-q', 'main')
    commitFile(first, 'm.txt', 'm\n', 'su main')
    git(first, 'push', '-q')
    await pull(runnerFor(other), 'config', () => {})
    expect(subjects(other)[0]).toBe('su main')
  })

  it('push rifiutato, poi push forzato con --force-with-lease', async () => {
    const { bare, clone: a } = makeRemotePair()
    const b = cloneOf(bare)
    commitFile(a, 'a.txt', 'a\n', 'da a')
    git(a, 'push', '-q')
    commitFile(b, 'b.txt', 'b\n', 'da b')
    await fetch(runnerFor(b), () => {})
    await expect(push(runnerFor(b), 'origin', false, () => {})).rejects.toThrow(/^Push rifiutato/)
    await push(runnerFor(b), 'origin', true, () => {})
    expect(git(bare, 'log', '--format=%s', '-1').trim()).toBe('da b')
  })

  it('tag annotato e push del tag; clone in una cartella', async () => {
    const { bare, clone: first } = makeRemotePair()
    const r = runnerFor(first)
    await createTag(r, 'v1.0', 'HEAD', 'prima versione')
    await pushTag(r, 'origin', 'v1.0')
    expect(git(first, 'ls-remote', '--tags', 'origin')).toContain('refs/tags/v1.0')

    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-dest-')))
    const dest = await clone(() => 'git', bare, parent, () => {}, () => {})
    expect(dest).toBe(join(parent, basename(bare)))
    expect(existsSync(join(dest, '.git'))).toBe(true)
  })
})

describe('integrazione dei cambiamenti', () => {
  it('merge con conflitto: operazione in corso, risoluzione e continua', async () => {
    const repo = makeRepo(1)
    const r = runnerFor(repo)
    git(repo, 'switch', '-q', '-c', 'altro')
    commitFile(repo, 'file1.txt', 'altro\n', 'altro')
    git(repo, 'switch', '-q', 'main')
    commitFile(repo, 'file1.txt', 'main\n', 'main')
    await expect(merge(r, 'altro', true)).rejects.toThrow(/^Ci sono conflitti/)
    expect((await readStatus(r)).operation).toBe('merge')
    writeFileSync(join(repo, 'file1.txt'), 'risolto\n')
    git(repo, 'add', 'file1.txt')
    await operation(r, 'merge', 'continue')
    expect((await readStatus(r)).operation).toBeNull()
    expect(git(repo, 'rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ')).toHaveLength(3)
  })

  it('rebase, cherry-pick, revert e reset hard', async () => {
    const repo = makeRepo(1)
    const r = runnerFor(repo)
    git(repo, 'switch', '-q', '-c', 'lato')
    commitFile(repo, 'lato.txt', 'l\n', 'lato')
    git(repo, 'switch', '-q', 'main')
    commitFile(repo, 'main.txt', 'm\n', 'main 2')
    await checkoutBranch(r, 'lato')
    await rebase(r, 'main')
    expect(subjects(repo)).toEqual(['lato', 'main 2', 'commit 1'])

    await checkoutBranch(r, 'main')
    await cherryPick(r, git(repo, 'rev-parse', 'lato').trim())
    expect(subjects(repo)[0]).toBe('lato')
    await revert(r, 'HEAD')
    expect(subjects(repo)[0]).toBe('Revert "lato"')
    await reset(r, 'HEAD~2', 'hard')
    expect(subjects(repo)).toEqual(['main 2', 'commit 1'])
  })

  it('rebase interattivo: reword, squash, drop e riordino', async () => {
    const repo = makeRepo(4)
    const r = runnerFor(repo)
    const sha = (rev: string) => git(repo, 'rev-parse', rev).trim()
    const [c2, c3, c4] = [sha('HEAD~2'), sha('HEAD~1'), sha('HEAD')]
    expect((await rebaseRange(r, c2)).map((c) => c.subject)).toEqual(['commit 4', 'commit 3', 'commit 2'])
    await rebaseInteractive(r, c2, [
      { sha: c2, action: 'reword', message: 'due rivisto' },
      { sha: c4, action: 'squash' },
      { sha: c3, action: 'drop' },
    ])
    expect(subjects(repo)).toEqual(['due rivisto', 'commit 1'])
    expect(existsSync(join(repo, 'file4.txt'))).toBe(true)
    expect(existsSync(join(repo, 'file3.txt'))).toBe(false)
  })

  it('rebase interattivo: rifiuta intervalli con merge e passi che non corrispondono', async () => {
    const repo = makeRepo(2)
    const r = runnerFor(repo)
    const base = git(repo, 'rev-parse', 'HEAD').trim()
    git(repo, 'switch', '-q', '-c', 'x')
    commitFile(repo, 'x.txt', 'x\n', 'x')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', 'x', '-m', 'merge x')
    await expect(rebaseRange(r, base)).rejects.toThrow(/merge/)

    const linear = makeRepo(3)
    const first = git(linear, 'rev-parse', 'HEAD~1').trim()
    await expect(rebaseInteractive(runnerFor(linear), first, [{ sha: first, action: 'pick' }])).rejects.toThrow(/non corrispondono/)
  })
})
