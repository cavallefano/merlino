import { shortcuts } from '../../shared/shortcuts'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'

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
  )
}
