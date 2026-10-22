import { describe, expect, it } from 'vitest'
import { parseStatus } from '../../src/main/git/status'

const out = [
  '# branch.oid b3956d586c154a64609ac3a3bc327c24cf8df3a8',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 08fe 08fe a.txt',
  '1 MM N... 100644 100644 100644 08fe 08fe con spazio.txt',
  '2 R. N... 100644 100644 100644 587b 587b R100 new name.txt',
  'old.txt',
  'u UU N... 100644 100644 100644 100644 1111 2222 3333 conflitto.txt',
  '? unt racked.txt',
  '',
].join('\0')

describe('parseStatus', () => {
  it('stage, modificati, non tracciati, conflitti, upstream e avanti/indietro', () => {
    expect(parseStatus(out)).toEqual({
      staged: [
        { path: 'con spazio.txt', status: 'M' },
        { path: 'new name.txt', oldPath: 'old.txt', status: 'R' },
      ],
      unstaged: [
        { path: 'a.txt', status: 'M' },
        { path: 'con spazio.txt', status: 'M' },
      ],
      untracked: [{ path: 'unt racked.txt', status: '?' }],
      conflicted: [{ path: 'conflitto.txt', status: 'U' }],
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
    })
  })
})
