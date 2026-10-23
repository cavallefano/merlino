import { describe, expect, it } from 'vitest'
import { type DragSource, dropAction, type DropContext, type DropTarget } from '../../src/renderer/drag/drop-actions'
import type { WorkingFile } from '../../src/shared/types'

const ctx: DropContext = {
  currentBranch: 'main',
  remotes: [
    {
      name: 'origin',
      url: 'x',
      branches: [
        { name: 'feature/a', fullName: 'origin/feature/a', sha: 'a1' },
        { name: 'main', fullName: 'origin/main', sha: 'b2' },
      ],
    },
  ],
}
const branch = (name: string): DragSource => ({ kind: 'branch', name })
const remoteBranch = (name: string): DragSource & DropTarget => ({ kind: 'remoteBranch', remote: 'origin', name, fullName: `origin/${name}` })
const commit: DragSource = { kind: 'commit', sha: 'abcdef1234' }
const file = (path: string): WorkingFile => ({ path, status: 'M' })
const act = (s: DragSource, t: DropTarget, alt = false) => dropAction(s, t, alt, ctx)

describe('dropAction', () => {
  it('branch sul corrente: merge; con ⌥ rebase', () => {
    expect(act(branch('feature/a'), { kind: 'branch', name: 'main' })).toEqual({
      label: 'Merge di feature/a in main',
      operation: { type: 'git', command: { kind: 'merge', ref: 'feature/a', noFf: false } },
    })
    expect(act(remoteBranch('feature/a'), { kind: 'branch', name: 'main' }, true)?.operation).toEqual({ type: 'git', command: { kind: 'rebase', onto: 'origin/feature/a' } })
  })

  it('branch remoto su un locale non corrente: fast-forward; con ⌥ upstream', () => {
    expect(act(remoteBranch('feature/a'), { kind: 'branch', name: 'feature/a' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'fastForward', branch: 'feature/a', from: 'origin/feature/a' },
    })
    expect(act(remoteBranch('feature/a'), { kind: 'branch', name: 'feature/a' }, true)?.label).toBe('feature/a segue origin/feature/a')
  })

  it('branch locale su un remote: push; con ⌥ upstream solo se il branch remoto esiste', () => {
    expect(act(branch('feature/a'), { kind: 'remote', name: 'origin' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'pushBranch', remote: 'origin', branch: 'feature/a', remoteBranch: 'feature/a' },
    })
    expect(act(branch('feature/a'), { kind: 'remote', name: 'origin' }, true)?.operation).toEqual({
      type: 'git',
      command: { kind: 'setUpstream', branch: 'feature/a', upstream: 'origin/feature/a' },
    })
    expect(act(branch('nuovo'), { kind: 'remote', name: 'origin' }, true)).toBeNull()
  })

  it('branch locale su un branch remoto: push lì; con ⌥ upstream', () => {
    expect(act(branch('feature/a'), remoteBranch('main'))?.operation).toEqual({
      type: 'git',
      command: { kind: 'pushBranch', remote: 'origin', branch: 'feature/a', remoteBranch: 'main' },
    })
    expect(act(branch('feature/a'), remoteBranch('main'), true)?.label).toBe('feature/a segue origin/main')
  })

  it('intestazioni: nuovo branch da branch, tag o commit; nuovo tag da un commit; stash dei file', () => {
    expect(act({ kind: 'tag', name: 'v1' }, { kind: 'branchesHeader' })).toEqual({ label: 'Nuovo branch da v1…', operation: { type: 'createBranch', start: 'v1' } })
    expect(act(commit, { kind: 'branchesHeader' })?.operation).toEqual({ type: 'createBranch', start: 'abcdef1234' })
    expect(act(commit, { kind: 'tagsHeader' })).toEqual({ label: 'Nuovo tag su abcdef1…', operation: { type: 'createTag', sha: 'abcdef1234' } })
    expect(act({ kind: 'files', area: 'untracked', files: [file('n.txt')] }, { kind: 'stashHeader' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'stashFiles', paths: ['n.txt'], untracked: true },
    })
    expect(act({ kind: 'files', area: 'staged', files: [{ path: 'b', oldPath: 'a', status: 'R' }] }, { kind: 'stashHeader' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'stashFiles', paths: ['a', 'b'], untracked: false },
    })
  })

  it('commit sul corrente o sulle modifiche locali: cherry-pick; con ⌥ revert', () => {
    expect(act(commit, { kind: 'branch', name: 'main' })?.label).toBe('Cherry-pick di abcdef1 in main')
    expect(act(commit, { kind: 'working' }, true)?.operation).toEqual({ type: 'git', command: { kind: 'revert', sha: 'abcdef1234' } })
  })

  it('stash e file di un commit sulle modifiche locali; file fra le sezioni', () => {
    expect(act({ kind: 'stash', ref: 'stash@{0}', sha: 's' }, { kind: 'working' }, true)).toEqual({
      label: 'Pop di stash@{0}',
      operation: { type: 'stash', action: 'pop', ref: 'stash@{0}' },
    })
    expect(act({ kind: 'commitFile', sha: 'abc1234', path: 'src/a.ts' }, { kind: 'working' })?.label).toBe('Applica le modifiche di a.ts')
    expect(act({ kind: 'files', area: 'unstaged', files: [file('a')] }, { kind: 'area', area: 'staged' })?.label).toBe('Stage di a')
    expect(act({ kind: 'files', area: 'staged', files: [file('a'), file('b')] }, { kind: 'area', area: 'unstaged' })?.label).toBe('Unstage di 2 file')
  })

  it('rilasci non ammessi', () => {
    const none: [DragSource, DropTarget][] = [
      [branch('main'), { kind: 'branch', name: 'main' }],
      [branch('feature/a'), { kind: 'branch', name: 'feature/b' }],
      [commit, { kind: 'branch', name: 'feature/a' }],
      [{ kind: 'files', area: 'unstaged', files: [file('a')] }, { kind: 'remote', name: 'origin' }],
      [{ kind: 'files', area: 'unstaged', files: [file('a')] }, { kind: 'area', area: 'unstaged' }],
      [{ kind: 'files', area: 'conflicted', files: [file('a')] }, { kind: 'stashHeader' }],
      [{ kind: 'tag', name: 'v1' }, { kind: 'remote', name: 'origin' }],
      [{ kind: 'stash', ref: 'stash@{0}', sha: 's' }, { kind: 'branch', name: 'main' }],
      [remoteBranch('main'), { kind: 'remote', name: 'origin' }],
    ]
    for (const [s, t] of none) expect(act(s, t)).toBeNull()
    expect(dropAction(commit, { kind: 'branch', name: 'main' }, false, { ...ctx, currentBranch: null })).toBeNull()
  })
})
