import { describe, expect, it } from 'vitest'
import { parseDecoration, parseLog } from '../../src/main/git/log'

const record = (...fields: string[]) => fields.join('\0')

describe('parseLog', () => {
  it('legge i 10 campi di ogni commit, con NUL finale', () => {
    const out =
      [
        record('aaa', 'bbb ccc', 'Ann', 'ann@x', '100', 'Bob', 'bob@x', '200', 'merge, feat', 'HEAD -> refs/heads/main, tag: refs/tags/v1'),
        record('bbb', '', 'Ann', 'ann@x', '50', 'Ann', 'ann@x', '50', 'primo', ''),
      ].join('\0') + '\0'
    const [merge, root] = parseLog(out)
    expect(merge).toEqual({
      sha: 'aaa',
      parents: ['bbb', 'ccc'],
      author: 'Ann',
      authorEmail: 'ann@x',
      authorTime: 100,
      committer: 'Bob',
      committerEmail: 'bob@x',
      commitTime: 200,
      subject: 'merge, feat',
      refs: [
        { kind: 'branch', name: 'main', current: true },
        { kind: 'tag', name: 'v1', current: false },
      ],
    })
    expect(root.parents).toEqual([])
    expect(root.refs).toEqual([])
    expect(parseLog('')).toEqual([])
  })
})

describe('parseDecoration', () => {
  it('distingue branch, remote, tag e HEAD staccato; nasconde origin/HEAD', () => {
    expect(parseDecoration('refs/remotes/origin/main, refs/remotes/origin/HEAD, refs/heads/feature/x')).toEqual([
      { kind: 'remote', name: 'origin/main', current: false },
      { kind: 'branch', name: 'feature/x', current: false },
    ])
    expect(parseDecoration('HEAD')).toEqual([{ kind: 'head', name: 'HEAD', current: true }])
  })
})
