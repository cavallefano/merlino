import { describe, expect, it } from 'vitest'
import { parseNameStatus, parseNumstat } from '../../src/main/git/commit'

describe('parseNameStatus', () => {
  it('stato, percorso e rinomine (formato -z)', () => {
    expect(parseNameStatus('A\0bin.dat\0M\0f.txt\0R100\0old.txt\0new.txt\0')).toEqual([
      { status: 'A', path: 'bin.dat' },
      { status: 'M', path: 'f.txt' },
      { status: 'R', path: 'new.txt', oldPath: 'old.txt' },
    ])
  })
})

describe('parseNumstat', () => {
  it('righe aggiunte e tolte, binari, rinomine e tab nel nome', () => {
    const map = parseNumstat('-\t-\tbin.dat\0' + '1\t2\tf.txt\0' + '0\t0\t\0old.txt\0new.txt\0' + '3\t0\tcon\ttab.txt\0')
    expect(map.get('bin.dat')).toEqual({ added: null, deleted: null })
    expect(map.get('f.txt')).toEqual({ added: 1, deleted: 2 })
    expect(map.get('new.txt')).toEqual({ added: 0, deleted: 0 })
    expect(map.get('con\ttab.txt')).toEqual({ added: 3, deleted: 0 })
  })
})
