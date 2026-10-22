import { shortcuts } from '../../shared/shortcuts'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'

/** Azioni delle modifiche locali e degli stash, sul repo della tab attiva. */
export function registerWorkingActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const hasChanges = () => (repo()?.changeCount ?? 0) > 0

  registry.register(
    { id: 'working.show', title: 'Modifiche locali', when: () => app.active !== null, run: () => repo()?.selectWorking() },
    {
      id: 'working.commit',
      title: 'Commit',
      keys: shortcuts['working.commit'],
      when: () => repo()?.view === 'working' && repo()?.canCommit === true,
      run: () => repo()?.commitChanges(),
    },
    {
      id: 'commit.template',
      title: 'Applica un template di commit…',
      when: () => app.active !== null,
      run: async () => {
        const r = repo()
        if (!r) return
        await r.selectWorking()
        r.templatePicker = 'button'
      },
    },
    { id: 'working.stageAll', title: 'Aggiungi tutto allo stage', when: hasChanges, run: () => repo()?.stageEverything() },
    {
      id: 'working.unstageAll',
      title: 'Togli tutto dallo stage',
      when: () => (repo()?.status?.staged.length ?? 0) > 0,
      run: () => repo()?.unstageEverything(),
    },
    { id: 'stash.push', title: 'Stash delle modifiche', when: hasChanges, run: () => repo()?.stashPush('', false) },
    {
      id: 'stash.pop',
      title: "Pop dell'ultimo stash",
      when: () => (repo()?.stashes.length ?? 0) > 0,
      run: () => repo()?.stashAction('pop', 'stash@{0}'),
    },
  )
}
