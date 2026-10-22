import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { ActionRegistry } from './registry'

export const registry = new ActionRegistry(window.api.platform === 'darwin')

/** Azioni di base. Le parti successive aggiungono le proprie con registry.register(). */
export function registerBuiltinActions(): void {
  const app = useAppStore()
  const gitOk = () => app.git?.ok === true
  const hasRepo = () => app.active !== null
  const manyTabs = () => app.tabs.length > 1

  registry.register(
    { id: 'palette.open', title: 'Command palette', keys: { key: 'p', mod: true, shift: true }, run: () => { app.paletteOpen = true } },
    { id: 'repo.open', title: 'Apri repository…', keys: { key: 'o', mod: true }, when: gitOk, run: () => app.pickAndOpen() },
    { id: 'repo.init', title: 'Nuovo repository…', when: gitOk, run: () => app.pickAndInit() },
    { id: 'repo.refresh', title: 'Aggiorna', keys: { key: 'r', mod: true }, when: hasRepo, run: () => app.active && useRepoStore(app.active).refresh() },
    { id: 'tab.close', title: 'Chiudi tab', keys: { key: 'w', mod: true }, when: hasRepo, run: () => app.active && app.close(app.active) },
    { id: 'tab.next', title: 'Tab successiva', keys: { key: 'Tab', ctrl: true }, when: manyTabs, run: () => app.cycle(1) },
    { id: 'tab.prev', title: 'Tab precedente', keys: { key: 'Tab', ctrl: true, shift: true }, when: manyTabs, run: () => app.cycle(-1) },
    { id: 'output.toggle', title: 'Mostra/nascondi output', keys: { key: 'o', mod: true, shift: true }, run: () => { app.outputOpen = !app.outputOpen } },
  )
}
