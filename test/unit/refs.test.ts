import { describe, expect, it } from 'vitest'
import { parseRefs } from '../../src/main/git/refs'
import { treeRows } from '../../src/renderer/history/branch-tree'

const row = (...f: string[]) => f.join('\0')

describe('parseRefs', () => {
  it('branch con upstream, remote (anche con / nel nome), tag annotati e leggeri', () => {
    const out = [
      row('refs/heads/feature/x', 'aaa', '', 'origin/feature/x', 'ahead 2, behind 1', ''),
      row('refs/heads/main', 'bbb', '', 'origin/main', '', '*'),
      row('refs/heads/vecchio', 'ccc', '', 'origin/vecchio', 'gone', ''),
      row('refs/remotes/origin/HEAD', 'bbb', '', '', '', ''),
      row('refs/remotes/origin/main', 'bbb', '', '', '', ''),
      row('refs/remotes/team/a/feature', 'ddd', '', '', '', ''),
      row('refs/tags/v1', 'tagobj', 'bbb', '', '', ''),
      row('refs/tags/leggero', 'ccc', '', '', '', ''),
      '',
    ].join('\n')
    const config = 'remote.origin.url git@host:x.git\nremote.team/a.url /srv/team\n'
    expect(parseRefs(out, config)).toEqual({
      branches: [
        { name: 'feature/x', sha: 'aaa', upstream: 'origin/feature/x', ahead: 2, behind: 1, gone: false, current: false },
        { name: 'main', sha: 'bbb', upstream: 'origin/main', ahead: 0, behind: 0, gone: false, current: true },
        { name: 'vecchio', sha: 'ccc', upstream: 'origin/vecchio', ahead: 0, behind: 0, gone: true, current: false },
      ],
      remotes: [
        { name: 'origin', url: 'git@host:x.git', branches: [{ name: 'main', fullName: 'origin/main', sha: 'bbb' }] },
        { name: 'team/a', url: '/srv/team', branches: [{ name: 'feature', fullName: 'team/a/feature', sha: 'ddd' }] },
      ],
      tags: [
        { name: 'v1', sha: 'bbb' },
        { name: 'leggero', sha: 'ccc' },
      ],
    })
  })
})

describe('treeRows', () => {
  const names = ['develop', 'feature/a', 'feature/b', 'fix/deep/x', 'main']

  it('cartelle dai nomi con /', () => {
    expect(treeRows(names, new Set())).toEqual([
      { kind: 'item', name: 'develop', label: 'develop', depth: 0 },
      { kind: 'folder', path: 'feature', name: 'feature', depth: 0 },
      { kind: 'item', name: 'feature/a', label: 'a', depth: 1 },
      { kind: 'item', name: 'feature/b', label: 'b', depth: 1 },
      { kind: 'folder', path: 'fix', name: 'fix', depth: 0 },
      { kind: 'folder', path: 'fix/deep', name: 'deep', depth: 1 },
      { kind: 'item', name: 'fix/deep/x', label: 'x', depth: 2 },
      { kind: 'item', name: 'main', label: 'main', depth: 0 },
    ])
  })

  it('le cartelle chiuse nascondono il contenuto', () => {
    expect(treeRows(names, new Set(['feature', 'fix'])).map((r) => (r.kind === 'folder' ? `${r.path}/` : r.name))).toEqual([
      'develop',
      'feature/',
      'fix/',
      'main',
    ])
  })
})
