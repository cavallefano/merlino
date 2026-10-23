import { shortcuts } from '../../shared/shortcuts'
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
    { id: 'palette.open', title: 'Command palette', keys: shortcuts['palette.open'], run: () => { app.paletteOpen = true } },
    { id: 'repo.open', title: 'Apri repository…', keys: shortcuts['repo.open'], when: gitOk, run: () => app.pickAndOpen() },
    { id: 'repo.init', title: 'Nuovo repository…', when: gitOk, run: () => app.pickAndInit() },
    { id: 'repo.refresh', title: 'Aggiorna', keys: shortcuts['repo.refresh'], when: hasRepo, run: () => app.active && useRepoStore(app.active).refresh() },
    { id: 'tab.close', title: 'Chiudi tab', keys: shortcuts['tab.close'], when: hasRepo, run: () => app.active && app.close(app.active) },
    { id: 'tab.next', title: 'Tab successiva', keys: shortcuts['tab.next'], when: manyTabs, run: () => app.cycle(1) },
    { id: 'tab.prev', title: 'Tab precedente', keys: shortcuts['tab.prev'], when: manyTabs, run: () => app.cycle(-1) },
    {
      id: 'repo.openTerminal',
      title: 'Apri nel terminale',
      when: hasRepo,
      run: async () => {
        if (!app.active) return
        const r = await window.api.openInTerminal(app.active)
        if (!r.ok) app.error = r.error.message
      },
    },
    { id: 'settings.open', title: 'Impostazioni…', keys: shortcuts['settings.open'], run: () => { app.settingsSection ??= 'general' } },
    { id: 'output.toggle', title: 'Mostra/nascondi output', keys: shortcuts['output.toggle'], run: () => { app.outputOpen = !app.outputOpen } },
  )
}
