import { describe, expect, it, vi } from 'vitest'
import { ActionRegistry, fuzzy, type KeyLike } from '../../src/renderer/actions/registry'

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
})
const noop = () => {}

describe('ActionRegistry', () => {
  it('mod = Cmd su macOS, Ctrl su Windows e Linux', () => {
    const mac = new ActionRegistry(true)
    const pc = new ActionRegistry(false)
    const action = { id: 'x', title: 'X', keys: { key: 'o', mod: true }, run: noop }
    mac.register(action)
    pc.register(action)
    expect(mac.match(key('o', { metaKey: true }))?.id).toBe('x')
    expect(mac.match(key('o', { ctrlKey: true }))).toBeUndefined()
    expect(pc.match(key('o', { ctrlKey: true }))?.id).toBe('x')
    expect(pc.match(key('o', { metaKey: true }))).toBeUndefined()
  })

  it('i modificatori devono coincidere esattamente', () => {
    const r = new ActionRegistry(true)
    r.register(
      { id: 'open', title: 'Apri', keys: { key: 'o', mod: true }, run: noop },
      { id: 'out', title: 'Output', keys: { key: 'o', mod: true, shift: true }, run: noop },
    )
    expect(r.match(key('O', { metaKey: true, shiftKey: true }))?.id).toBe('out')
    expect(r.match(key('o', { metaKey: true }))?.id).toBe('open')
  })

  it('ctrl esplicito resta Ctrl anche su macOS', () => {
    const r = new ActionRegistry(true)
    r.register({ id: 'next', title: 'Tab successiva', keys: { key: 'Tab', ctrl: true }, run: noop })
    expect(r.match(key('Tab', { ctrlKey: true }))?.id).toBe('next')
  })

  it('when falso: nessun match e run non esegue', () => {
    const r = new ActionRegistry(false)
    const run = vi.fn()
    r.register({ id: 'x', title: 'X', keys: { key: 'w', mod: true }, when: () => false, run })
    expect(r.match(key('w', { ctrlKey: true }))).toBeUndefined()
    expect(r.enabled()).toEqual([])
    expect(r.run('x')).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it("run esegue un'azione abilitata", () => {
    const r = new ActionRegistry(false)
    const run = vi.fn()
    r.register({ id: 'x', title: 'X', run })
    expect(r.run('x')).toBe(true)
    expect(r.run('inesistente')).toBe(false)
    expect(run).toHaveBeenCalledOnce()
  })

  it('keyLabel nel formato di ogni sistema', () => {
    expect(new ActionRegistry(true).keyLabel({ key: 'p', mod: true, shift: true })).toBe('⇧⌘P')
    expect(new ActionRegistry(false).keyLabel({ key: 'p', mod: true, shift: true })).toBe('Ctrl+Shift+P')
    expect(new ActionRegistry(true).keyLabel({ key: 'Tab', ctrl: true })).toBe('⌃Tab')
    expect(new ActionRegistry(true).keyLabel({ key: 'Enter', mod: true })).toBe('⌘↩')
    expect(new ActionRegistry(false).keyLabel({ key: 'Enter', mod: true })).toBe('Ctrl+Enter')
  })
})

describe('fuzzy', () => {
  it('lettere nello stesso ordine, maiuscole e spazi ignorati', () => {
    expect(fuzzy('apr', 'Apri repository…')).toBe(true)
    expect(fuzzy('ar', 'Apri repository…')).toBe(true)
    expect(fuzzy('nuovo rep', 'Nuovo repository…')).toBe(true)
    expect(fuzzy('ra', 'Apri')).toBe(false)
    expect(fuzzy('', 'Qualsiasi')).toBe(true)
  })
})
