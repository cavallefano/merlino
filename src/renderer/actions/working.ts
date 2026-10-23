import { t } from '../i18n'
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
    { id: 'working.show', get title() { return t('action.working.show') }, when: () => app.active !== null, run: () => repo()?.selectWorking() },
    {
      id: 'working.commit',
      title: 'Commit',
      keys: shortcuts['working.commit'],
      when: () => repo()?.view === 'working' && repo()?.canCommit === true,
      run: () => repo()?.commitChanges(),
    },
    {
      id: 'commit.template',
      get title() { return t('action.commit.template') },
      when: () => app.active !== null,
      run: async () => {
        const r = repo()
        if (!r) return
        await r.selectWorking()
        r.templatePicker = 'button'
      },
    },
    { id: 'working.stageAll', get title() { return t('action.working.stageAll') }, when: hasChanges, run: () => repo()?.stageEverything() },
    {
      id: 'working.unstageAll',
      get title() { return t('action.working.unstageAll') },
      when: () => (repo()?.status?.staged.length ?? 0) > 0,
      run: () => repo()?.unstageEverything(),
    },
    { id: 'stash.push', get title() { return t('action.stash.push') }, when: hasChanges, run: () => repo()?.stashPush('', false) },
    {
      id: 'stash.pop',
      get title() { return t('action.stash.pop') },
      when: () => (repo()?.stashes.length ?? 0) > 0,
      run: () => repo()?.stashAction('pop', 'stash@{0}'),
    },
  )
}
