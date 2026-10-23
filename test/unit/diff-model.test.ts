import { describe, expect, it } from 'vitest'
import { escapeHtml, renderSegments, splitRows, wordSegments } from '../../src/renderer/history/diff-model'
import type { DiffLine, Hunk } from '../../src/shared/types'

const ctx = (text: string, n: number): DiffLine => ({ type: 'context', text, oldNo: n, newNo: n })
const del = (text: string, n: number): DiffLine => ({ type: 'del', text, oldNo: n, newNo: null })
const add = (text: string, n: number): DiffLine => ({ type: 'add', text, oldNo: null, newNo: n })

describe('splitRows', () => {
  it('affianca i blocchi tolti/aggiunti e riempie i vuoti', () => {
    const a = ctx('a', 1)
    const d1 = del('vecchio 1', 2)
    const d2 = del('vecchio 2', 3)
    const a1 = add('nuovo 1', 2)
    const tail = ctx('z', 4)
    const hunk: Hunk = { header: '@@', lines: [a, d1, d2, a1, tail] }
    expect(splitRows(hunk)).toEqual([
      { left: a, right: a },
      { left: d1, right: a1 },
      { left: d2, right: null },
      { left: tail, right: tail },
    ])
  })
})

describe('wordSegments', () => {
  it('evidenzia solo le parole cambiate nelle righe accoppiate', () => {
    const d = del('const a = 1', 1)
    const a = add('const a = 2', 1)
    const map = wordSegments({ header: '@@', lines: [d, a] })
    expect(map.get(d)).toEqual([
      { text: 'const a = ', changed: false },
      { text: '1', changed: true },
    ])
    expect(map.get(a)).toEqual([
      { text: 'const a = ', changed: false },
      { text: '2', changed: true },
    ])
  })
})

describe('html', () => {
  it('escape e mark', () => {
    expect(escapeHtml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;')
    expect(renderSegments([{ text: 'x<', changed: false }, { text: 'y', changed: true }])).toBe('x&lt;<mark>y</mark>')
  })
})
