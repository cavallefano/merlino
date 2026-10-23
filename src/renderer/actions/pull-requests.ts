import { shortcuts } from '../../shared/shortcuts'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'

type Repo = ReturnType<typeof useRepoStore>

/** Dialog di una nuova pull request dal branch indicato. */
export function openCreatePullRequest(repo: Repo, branch: string): void {
  usePullRequestStore(repo.root).creating = { branch }
}

/** Storia e pull request del repo della tab attiva. */
export function registerPullRequestActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const show = (page: 'history' | 'pullRequests') => () => {
    const r = repo()
    if (r) r.page = page
  }

  registry.register(
    { id: 'view.history', get title() { return t('action.view.history') }, keys: shortcuts['view.history'], when: () => app.active !== null, run: show('history') },
    { id: 'view.pullRequests', get title() { return t('action.view.pullRequests') }, keys: shortcuts['view.pullRequests'], when: () => app.active !== null, run: show('pullRequests') },
    {
      id: 'pr.create',
      get title() { return t('action.pr.create') },
      when: () => app.active !== null && usePullRequestStore(app.active).withAccount.length > 0,
      run: () => {
        const r = repo()
        if (r) openCreatePullRequest(r, r.info?.branch ?? '')
      },
    },
  )
}
