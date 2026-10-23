import { t } from '../i18n'
import { shortcuts } from '../../shared/shortcuts'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'

/** Azioni della storia e del diff, sul repo della tab attiva. */
export function registerHistoryActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const hasCommit = () => !!repo()?.detail

  registry.register(
    {
      id: 'history.search',
      get title() { return t('action.history.search') },
      keys: shortcuts['history.search'],
      when: () => app.active !== null,
      run: () => document.querySelector<HTMLInputElement>('[data-testid="history-search"]')?.focus(),
    },
    { id: 'commit.copySha', get title() { return t('action.commit.copySha') }, when: hasCommit, run: () => navigator.clipboard.writeText(repo()?.detail?.commit.sha ?? '') },
    { id: 'commit.copyMessage', get title() { return t('action.commit.copyMessage') }, when: hasCommit, run: () => navigator.clipboard.writeText(repo()?.detail?.message ?? '') },
    { id: 'diff.toggleSplit', get title() { return t('action.diff.toggleSplit') }, when: hasCommit, run: () => repo()?.toggleSplit() },
    { id: 'diff.toggleWhitespace', get title() { return t('action.diff.toggleWhitespace') }, when: hasCommit, run: () => repo()?.toggleWhitespace() },
  )
}
