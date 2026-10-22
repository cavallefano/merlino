import { describe, expect, it } from 'vitest'
import { buildPatch, changedKeys, lineKey } from '../../src/shared/patch'
import type { FileDiff } from '../../src/shared/types'

const diff: FileDiff = {
  path: 'a.txt',
  binary: false,
  tooLarge: false,
  hunks: [
    {
      header: '@@ -1,4 +1,4 @@',
      lines: [
        { type: 'context', text: '1', oldNo: 1, newNo: 1 },
        { type: 'del', text: '2', oldNo: 2, newNo: null },
        { type: 'add', text: 'DUE', oldNo: null, newNo: 2 },
        { type: 'add', text: 'extra', oldNo: null, newNo: 3 },
        { type: 'context', text: '3', oldNo: 3, newNo: 4 },
      ],
    },
  ],
}

const header = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n'

describe('buildPatch', () => {
  it('stage di una sola riga aggiunta: la riga tolta non scelta resta come contesto', () => {
    expect(buildPatch(diff, new Set([lineKey(0, 3)]), false)).toBe(header + '@@ -1,3 +1,4 @@\n 1\n 2\n+extra\n 3\n')
  })

  it('al contrario (unstage/scarto): le aggiunte non scelte restano, le tolte non scelte spariscono', () => {
    expect(buildPatch(diff, new Set([lineKey(0, 1)]), true)).toBe(header + '@@ -1,5 +1,4 @@\n 1\n-2\n DUE\n extra\n 3\n')
  })

  it('nessuna riga cambiata scelta: nessuna patch', () => {
    expect(buildPatch(diff, new Set([lineKey(0, 0)]), false)).toBeNull()
  })

  it('changedKeys: le righe cambiate di un blocco', () => {
    expect([...changedKeys(diff, 0)]).toEqual(['0:1', '0:2', '0:3'])
  })

  it('percorsi con caratteri speciali tra virgolette, come fa git', () => {
    const patch = buildPatch({ ...diff, path: 'caffè "x".txt' }, changedKeys(diff), false)
    expect(patch?.split('\n')[0]).toBe('diff --git "a/caff\\303\\250 \\"x\\".txt" "b/caff\\303\\250 \\"x\\".txt"')
  })

  it('riga senza a capo finale', () => {
    const last: FileDiff = {
      path: 'f',
      binary: false,
      tooLarge: false,
      hunks: [
        {
          header: '@@ -1 +1 @@',
          lines: [
            { type: 'del', text: 'a', oldNo: 1, newNo: null, noNewline: true },
            { type: 'add', text: 'b', oldNo: null, newNo: 1, noNewline: true },
          ],
        },
      ],
    }
    expect(buildPatch(last, changedKeys(last), false)).toBe(
      'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n',
    )
  })
})
