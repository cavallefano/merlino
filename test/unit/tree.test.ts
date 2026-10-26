import { describe, expect, it } from 'vitest'
import { parseTree } from '../../src/main/git/tree'

describe('parseTree', () => {
  it('cartelle prima, poi file e submodule in ordine alfabetico; il nome è dopo il primo TAB', () => {
    const out = '100644 blob aaa\tsrc/b.txt\x00040000 tree bbb\tsrc/lib\x00160000 commit ccc\tsrc/mod\x00100644 blob ddd\tsrc/A\tx.txt\x00'
    expect(parseTree(out)).toEqual([
      { name: 'lib', path: 'src/lib', kind: 'folder' },
      { name: 'A\tx.txt', path: 'src/A\tx.txt', kind: 'file' },
      { name: 'b.txt', path: 'src/b.txt', kind: 'file' },
      { name: 'mod', path: 'src/mod', kind: 'submodule' },
    ])
    expect(parseTree('')).toEqual([])
  })
})
