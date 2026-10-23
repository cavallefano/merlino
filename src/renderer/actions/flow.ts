import { FLOW_TYPES, flowName, flowTypeOf } from '../../shared/flow'
import type { MessageKey } from '../../shared/i18n'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { popup } from './branches'
import { registry } from './builtin'

type Repo = ReturnType<typeof useRepoStore>

/** Il branch corrente, se è di git flow e si può finire. */
export function finishableBranch(repo: Repo): string | null {
  const branch = repo.info?.branch
  const type = branch && repo.flow ? flowTypeOf(branch, repo.flow) : null
  return branch && type && type !== 'support' ? branch : null
}

/** Voce "Finish <Tipo> <nome>…" per un branch di git flow, o null. */
export function finishEntry(repo: Repo, branch: string) {
  const type = repo.flow ? flowTypeOf(branch, repo.flow) : null
  if (!repo.flow || !type || type === 'support') return null
  return { label: t(`flow.finish.${type}` as MessageKey, { name: flowName(branch, repo.flow) }), run: () => repo.openFlow({ kind: 'finish', branch }) }
}

/** Menu del pulsante Git Flow della barra. */
export function flowMenu(repo: Repo) {
  if (!repo.flow) return popup([{ label: t('flow.initialize'), run: () => repo.openFlow({ kind: 'init' }) }])
  const current = finishableBranch(repo)
  const finish = current ? finishEntry(repo, current) : null
  return popup([
    ...FLOW_TYPES.map((type) => ({ label: t(`flow.start.${type}`), run: () => repo.openFlow({ kind: 'start', type }) })),
    ...(finish ? [null, finish] : []),
    null,
    { label: t('flow.settings'), run: () => repo.openFlow({ kind: 'init' }) },
  ])
}

export function registerFlowActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const idle = () => repo()?.busy === null
  registry.register(
    { id: 'flow.init', get title() { return t('action.flow.init') }, when: idle, run: () => repo()?.openFlow({ kind: 'init' }) },
    ...FLOW_TYPES.map((type) => ({
      id: `flow.start.${type}`,
      get title() { return t(`action.flow.start.${type}`) },
      when: idle,
      run: () => repo()?.openFlow({ kind: 'start', type }),
    })),
    {
      id: 'flow.finish',
      get title() { return t('action.flow.finish') },
      when: () => idle() && !!repo() && !!finishableBranch(repo()!),
      run: () => {
        const r = repo()
        const branch = r && finishableBranch(r)
        if (r && branch) r.openFlow({ kind: 'finish', branch })
      },
    },
  )
}
