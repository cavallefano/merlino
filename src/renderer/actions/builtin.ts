import { t } from '../i18n'
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
    { id: 'palette.open', get title() { return t('action.palette.open') }, keys: shortcuts['palette.open'], run: () => { app.paletteOpen = true } },
    { id: 'repo.open', get title() { return t('action.repo.open') }, keys: shortcuts['repo.open'], when: gitOk, run: () => app.pickAndOpen() },
    { id: 'repo.init', get title() { return t('action.repo.init') }, when: gitOk, run: () => app.pickAndInit() },
    { id: 'repo.refresh', get title() { return t('action.repo.refresh') }, keys: shortcuts['repo.refresh'], when: hasRepo, run: () => app.active && useRepoStore(app.active).refresh() },
    { id: 'tab.close', get title() { return t('action.tab.close') }, keys: shortcuts['tab.close'], when: hasRepo, run: () => app.active && app.close(app.active) },
    { id: 'tab.next', get title() { return t('action.tab.next') }, keys: shortcuts['tab.next'], when: manyTabs, run: () => app.cycle(1) },
    { id: 'tab.prev', get title() { return t('action.tab.prev') }, keys: shortcuts['tab.prev'], when: manyTabs, run: () => app.cycle(-1) },
    {
      id: 'repo.openTerminal',
      get title() { return t('action.repo.openTerminal') },
      when: hasRepo,
      run: async () => {
        if (!app.active) return
        const r = await window.api.openInTerminal(app.active)
        if (!r.ok) app.error = r.error.message
      },
    },
    { id: 'settings.open', get title() { return t('action.settings.open') }, keys: shortcuts['settings.open'], run: () => { app.settingsSection ??= 'general' } },
    { id: 'output.toggle', get title() { return t('action.output.toggle') }, keys: shortcuts['output.toggle'], run: () => { app.outputOpen = !app.outputOpen } },
    {
      id: 'layout.toggle',
      get title() { return t('action.layout.toggle') },
      run: () => app.updatePreferences({ panelLayout: app.preferences.panelLayout === 'vertical' ? 'horizontal' : 'vertical' }),
    },
  )
}
