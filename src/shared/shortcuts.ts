/** Combinazione di tasti. mod = Cmd su macOS, Ctrl su Windows e Linux; ctrl = sempre Ctrl. */
export interface Keys {
  key: string
  mod?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

/** Scorciatoie delle azioni: le esegue il registro nel renderer, la barra dei menu le mostra. */
export const shortcuts: Record<string, Keys> = {
  'palette.open': { key: 'p', mod: true, shift: true },
  'repo.open': { key: 'o', mod: true },
  'repo.refresh': { key: 'r', mod: true },
  'tab.close': { key: 'w', mod: true },
  'tab.next': { key: 'Tab', ctrl: true },
  'tab.prev': { key: 'Tab', ctrl: true, shift: true },
  'output.toggle': { key: 'o', mod: true, shift: true },
  'history.search': { key: 'f', mod: true },
  'working.commit': { key: 'Enter', mod: true },
  'settings.open': { key: ',', mod: true },
}

/** Formato degli acceleratori di Electron, es. CmdOrCtrl+Shift+P. */
export function toAccelerator(k: Keys): string {
  const key = k.key.length === 1 ? k.key.toUpperCase() : k.key
  return [k.mod && 'CmdOrCtrl', k.ctrl && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift', key].filter(Boolean).join('+')
}
