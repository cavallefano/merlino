import { describe, expect, it } from 'vitest'
import { clamp, readLayout, SIZES } from '../../src/renderer/layout'

const defaults = { sidebar: 220, list: 0.55, listVertical: 0.4, commitFiles: 140, workingFiles: 180, prFiles: 160, dialog: null }

describe('clamp', () => {
  it('tiene il valore fra i limiti', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('con i limiti incrociati vince il minimo', () => {
    expect(clamp(50, 48, 20)).toBe(48)
  })
})

describe('readLayout', () => {
  it('senza dati, con JSON rovinato o non un oggetto dà i predefiniti', () => {
    expect(readLayout(null)).toEqual(defaults)
    expect(readLayout('{rotto')).toEqual(defaults)
    expect(readLayout('42')).toEqual(defaults)
  })

  it('tiene i valori validi e rimette i predefiniti al posto degli altri', () => {
    const saved = { sidebar: 300, list: 0.3, listVertical: 2, commitFiles: '200', workingFiles: 10, dialog: { width: 900, height: 600 } }
    expect(readLayout(JSON.stringify(saved))).toEqual({ ...defaults, sidebar: 300, list: 0.3, dialog: { width: 900, height: 600 } })
  })

  it('scarta un popup troppo piccolo o malformato', () => {
    expect(readLayout(JSON.stringify({ dialog: { width: 100, height: 600 } })).dialog).toBeNull()
    expect(readLayout(JSON.stringify({ dialog: 'grande' })).dialog).toBeNull()
  })

  it('i predefiniti stanno nei limiti', () => {
    for (const s of Object.values(SIZES)) expect(clamp(s.default, s.min, s.max)).toBe(s.default)
  })
})
