import type { Keys } from '../../shared/shortcuts'

export type { Keys }

export interface Action {
  id: string
  title: string
  keys?: Keys
  /** Se restituisce false, l'azione non compare nella palette e la scorciatoia è ignorata. */
  when?: () => boolean
  run: () => unknown
}

/** La parte di KeyboardEvent che serve, così il registro si testa senza DOM. */
export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const isEnabled = (a: Action): boolean => a.when?.() ?? true

/** Unica fonte di azioni per command palette, menu e scorciatoie. */
export class ActionRegistry {
  private readonly actions = new Map<string, Action>()

  constructor(private readonly isMac: boolean) {}

  register(...list: Action[]): void {
    for (const a of list) this.actions.set(a.id, a)
  }

  enabled(): Action[] {
    return [...this.actions.values()].filter(isEnabled)
  }

  get(id: string): Action | undefined {
    return this.actions.get(id)
  }

  /** true se l'azione esiste e il suo when lo permette: così i pulsanti della toolbar si disattivano come la palette. */
  available(id: string): boolean {
    const action = this.actions.get(id)
    return action !== undefined && isEnabled(action)
  }

  run(id: string): boolean {
    const action = this.actions.get(id)
    if (!action || !isEnabled(action)) return false
    void action.run()
    return true
  }

  match(e: KeyLike): Action | undefined {
    return this.enabled().find((a) => a.keys !== undefined && this.matches(a.keys, e))
  }

  keyLabel(k: Keys): string {
    const key = k.key.length === 1 ? k.key.toUpperCase() : k.key
    if (this.isMac) {
      const symbol = key === 'Enter' ? '↩' : key
      return `${k.ctrl ? '⌃' : ''}${k.alt ? '⌥' : ''}${k.shift ? '⇧' : ''}${k.mod ? '⌘' : ''}${symbol}`
    }
    return [k.mod || k.ctrl ? 'Ctrl' : '', k.alt ? 'Alt' : '', k.shift ? 'Shift' : '', key].filter(Boolean).join('+')
  }

  private matches(k: Keys, e: KeyLike): boolean {
    const meta = this.isMac && !!k.mod
    const ctrl = this.isMac ? !!k.ctrl : !!(k.mod || k.ctrl)
    return (
      e.key.toLowerCase() === k.key.toLowerCase() &&
      e.metaKey === meta &&
      e.ctrlKey === ctrl &&
      e.shiftKey === !!k.shift &&
      e.altKey === !!k.alt
    )
  }
}

/** true se le lettere della ricerca compaiono in text nello stesso ordine (spazi e maiuscole ignorati). */
export function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, '')
  const t = text.toLowerCase()
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i >= q.length
}
