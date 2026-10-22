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
      title: 'Cerca nella storia',
      keys: shortcuts['history.search'],
      when: () => app.active !== null,
      run: () => document.querySelector<HTMLInputElement>('[data-testid="history-search"]')?.focus(),
    },
    { id: 'commit.copySha', title: 'Copia SHA del commit', when: hasCommit, run: () => navigator.clipboard.writeText(repo()?.detail?.commit.sha ?? '') },
    { id: 'commit.copyMessage', title: 'Copia messaggio del commit', when: hasCommit, run: () => navigator.clipboard.writeText(repo()?.detail?.message ?? '') },
    { id: 'diff.toggleSplit', title: 'Diff affiancato / unificato', when: hasCommit, run: () => repo()?.toggleSplit() },
    { id: 'diff.toggleWhitespace', title: 'Ignora spazi nel diff', when: hasCommit, run: () => repo()?.toggleWhitespace() },
  )
}
