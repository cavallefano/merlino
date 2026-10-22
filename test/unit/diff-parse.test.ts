import { describe, expect, it } from 'vitest'
import { parseFileDiff } from '../../src/main/git/diff'

const out = [
  'diff --git a/f.txt b/f.txt',
  'index 1111111..2222222 100644',
  '--- a/f.txt',
  '+++ b/f.txt',
  '@@ -1,3 +1,3 @@ intestazione',
  ' a',
  '--- vecchio',
  '+++ nuovo',
  ' c',
  '@@ -10 +10,2 @@',
  '-x',
  '\\ No newline at end of file',
  '+x',
  '+y',
  '',
].join('\n')

describe('parseFileDiff', () => {
  it('hunk, numeri di riga e righe che iniziano con --- o +++', () => {
    const d = parseFileDiff(out, 'f.txt')
    expect(d).toMatchObject({ path: 'f.txt', binary: false, tooLarge: false })
    expect(d.hunks.map((h) => h.header)).toEqual(['@@ -1,3 +1,3 @@ intestazione', '@@ -10 +10,2 @@'])
    expect(d.hunks[0].lines).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: '-- vecchio', oldNo: 2, newNo: null },
      { type: 'add', text: '++ nuovo', oldNo: null, newNo: 2 },
      { type: 'context', text: 'c', oldNo: 3, newNo: 3 },
    ])
    expect(d.hunks[1].lines).toEqual([
      { type: 'del', text: 'x', oldNo: 10, newNo: null },
      { type: 'add', text: 'x', oldNo: null, newNo: 10 },
      { type: 'add', text: 'y', oldNo: null, newNo: 11 },
    ])
  })

  it('file binario', () => {
    const d = parseFileDiff('diff --git a/b.dat b/b.dat\nBinary files a/b.dat and b/b.dat differ\n', 'b.dat')
    expect(d).toMatchObject({ binary: true, hunks: [] })
  })
})
