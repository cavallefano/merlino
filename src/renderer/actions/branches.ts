import { t } from '../i18n'
import type { BranchInfo, Commit, MenuItem, RemoteBranch, RemoteInfo, TagInfo } from '../../shared/types'
import type { DropOperation } from '../drag/drop-actions'
import { type PromptValues, useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'
import { openCreatePullRequest } from './pull-requests'

type Repo = ReturnType<typeof useRepoStore>
/** Voce di un menu contestuale; null è un separatore. */
type Entry = { label: string; run: () => unknown; enabled?: boolean } | null

/** Menu contestuale nativo: esegue la voce scelta. */
export async function popup(entries: Entry[]): Promise<void> {
  const items: MenuItem[] = entries.map((e, i) => (e ? { id: String(i), label: e.label, enabled: e.enabled } : { separator: true }))
  const id = await window.api.contextMenu(items)
  if (id !== null) await entries[Number(id)]?.run()
}

const field = (values: PromptValues | null, key: string) => String(values?.[key] ?? '').trim()

/** Il remote per il primo push e per i tag: origin se c'è, altrimenti il primo. */
function defaultRemote(repo: Repo): string | undefined {
  const remotes = repo.refs?.remotes ?? []
  return (remotes.find((r) => r.name === 'origin') ?? remotes[0])?.name
}

// --- Operazioni con dialog o conferma ---

export async function createBranch(repo: Repo, start: string) {
  const values = await useAppStore().prompt({
    title: t('branch.newTitle'),
    fields: [
      { key: 'name', label: t('common.name') },
      { key: 'checkout', label: t('branch.checkoutNew'), type: 'checkbox', value: true },
    ],
    confirm: t('common.create'),
  })
  const name = field(values, 'name')
  if (name) await repo.git({ kind: 'createBranch', name, start, checkout: values?.checkout === true })
}

export async function createTag(repo: Repo, sha: string) {
  const values = await useAppStore().prompt({
    title: t('tag.newTitle'),
    fields: [
      { key: 'name', label: t('common.name') },
      { key: 'message', label: t('tag.messageLabel') },
    ],
    confirm: t('common.create'),
  })
  const name = field(values, 'name')
  if (name) await repo.git({ kind: 'createTag', name, sha, message: field(values, 'message') })
}

async function renameBranch(repo: Repo, b: BranchInfo) {
  const values = await useAppStore().prompt({
    title: t('branch.renameTitle', { name: b.name }),
    fields: [{ key: 'name', label: t('branch.newName'), value: b.name }],
    confirm: t('branch.rename'),
  })
  const name = field(values, 'name')
  if (name && name !== b.name) await repo.git({ kind: 'renameBranch', from: b.name, to: name })
}

async function setUpstream(repo: Repo, b: BranchInfo) {
  const values = await useAppStore().prompt({
    title: t('branch.upstreamTitle', { name: b.name }),
    fields: [{ key: 'upstream', label: t('branch.upstreamLabel'), value: b.upstream ?? `${defaultRemote(repo) ?? 'origin'}/${b.name}` }],
    confirm: t('branch.setUpstream'),
  })
  if (!values) return
  const upstream = field(values, 'upstream') || null
  if (upstream || b.upstream) await repo.git({ kind: 'setUpstream', branch: b.name, upstream })
}

/** -d; se il branch non è mergiato, -D solo dopo conferma. */
async function deleteBranch(repo: Repo, name: string) {
  const r = await window.api.git(repo.root, { kind: 'deleteBranch', name, force: false })
  if (r.ok || !r.error.stderr.includes('not fully merged')) {
    await repo.run(Promise.resolve(r))
  } else if (window.confirm(t('branch.confirmForceDelete', { name }))) {
    await repo.git({ kind: 'deleteBranch', name, force: true })
  }
}

async function deleteRemoteBranch(repo: Repo, remote: RemoteInfo, b: RemoteBranch) {
  if (window.confirm(t('branch.confirmDeleteRemote', { name: b.fullName }))) {
    await repo.git({ kind: 'deleteRemoteBranch', remote: remote.name, name: b.name })
  }
}

async function reset(repo: Repo, sha: string, mode: 'soft' | 'mixed' | 'hard') {
  if (mode !== 'hard' || window.confirm(t('reset.confirmHard', { sha: sha.slice(0, 7) }))) await repo.git({ kind: 'reset', sha, mode })
}

export async function push(repo: Repo, force: boolean) {
  const remote = defaultRemote(repo)
  if (!remote) {
    repo.error = t('push.noRemote')
    return
  }
  if (!force || window.confirm(t('push.confirmForce'))) await repo.git({ kind: 'push', remote, force })
}

async function addRemote(repo: Repo) {
  const values = await useAppStore().prompt({
    title: t('remote.addTitle'),
    fields: [
      { key: 'name', label: t('common.name'), value: repo.refs?.remotes.length ? '' : 'origin' },
      { key: 'url', label: 'URL' },
    ],
    confirm: t('common.add'),
  })
  const name = field(values, 'name')
  const url = field(values, 'url')
  if (name && url) await repo.git({ kind: 'addRemote', name, url })
}

/** Esegue l'operazione di un rilascio con le stesse funzioni dei menu (dialog, errori, aggiornamento). */
export async function performDrop(repo: Repo, op: DropOperation): Promise<unknown> {
  switch (op.type) {
    case 'git':
      return repo.git(op.command)
    case 'createBranch':
      return createBranch(repo, op.start)
    case 'createTag':
      return createTag(repo, op.sha)
    case 'stage':
      return repo.stage(op.files)
    case 'unstage':
      return repo.unstage(op.files)
    case 'stash':
      return repo.stashAction(op.action, op.ref)
    case 'createPullRequest':
      return openCreatePullRequest(repo, op.branch)
  }
}

// --- Menu contestuali ---

export function branchMenu(repo: Repo, b: BranchInfo) {
  const other = !b.current
  return popup([
    { label: 'Checkout', enabled: other, run: () => repo.git({ kind: 'checkoutBranch', name: b.name }) },
    null,
    { label: t('ctx.mergeIntoCurrent'), enabled: other, run: () => repo.git({ kind: 'merge', ref: b.name, noFf: false }) },
    { label: t('ctx.mergeNoFf'), enabled: other, run: () => repo.git({ kind: 'merge', ref: b.name, noFf: true }) },
    { label: t('ctx.rebaseOnto'), enabled: other, run: () => repo.git({ kind: 'rebase', onto: b.name }) },
    null,
    { label: t('ctx.rename'), run: () => renameBranch(repo, b) },
    { label: t('ctx.setUpstream'), run: () => setUpstream(repo, b) },
    { label: t('ctx.delete'), enabled: other, run: () => deleteBranch(repo, b.name) },
    null,
    { label: t('ctx.createPullRequest', { branch: b.name }), run: () => openCreatePullRequest(repo, b.name) },
  ])
}

export function remoteBranchMenu(repo: Repo, remote: RemoteInfo, b: RemoteBranch) {
  return popup([
    { label: 'Checkout', run: () => repo.git({ kind: 'checkoutRemote', fullName: b.fullName }) },
    { label: t('ctx.mergeIntoCurrent'), run: () => repo.git({ kind: 'merge', ref: b.fullName, noFf: false }) },
    null,
    { label: t('ctx.deleteFromRemote'), run: () => deleteRemoteBranch(repo, remote, b) },
  ])
}

/** Account per le pull request di un remote: Automatico (il primo dello stesso server) o uno scelto. */
async function chooseAccount(repo: Repo, remote: RemoteInfo) {
  const app = useAppStore()
  const s = app.settings
  if (!s) return
  // Stessa chiave di accountKey nel main
  const chosen = s.remoteAccounts[`${repo.root}\n${remote.name}`]
  const set = async (id: string | null) => {
    const r = await window.api.setRemoteAccount(repo.root, remote.name, id)
    if (r.ok) app.settings = r.value
    else repo.error = r.error.message
  }
  const mark = (on: boolean) => (on ? '✓ ' : '')
  await popup([
    { label: mark(!chosen) + t('account.automatic'), run: () => set(null) },
    ...s.accounts.map((a) => ({ label: `${mark(a.id === chosen)}${a.username}@${a.host}`, run: () => set(a.id) })),
    null,
    { label: t('account.manage'), run: () => (app.settingsSection = 'accounts') },
  ])
}

export function remoteMenu(repo: Repo, remote: RemoteInfo) {
  return popup([
    { label: t('ctx.account'), run: () => chooseAccount(repo, remote) },
    null,
    {
      label: t('ctx.remove'),
      run: () => window.confirm(t('remote.confirmRemove', { name: remote.name, url: remote.url })) && repo.git({ kind: 'removeRemote', name: remote.name }),
    },
  ])
}

export function tagMenu(repo: Repo, tag: TagInfo) {
  const pushes = (repo.refs?.remotes ?? []).map((r) => ({
    label: t('ctx.pushTo', { remote: r.name }),
    run: () => repo.git({ kind: 'pushTag', remote: r.name, name: tag.name }),
  }))
  return popup([...pushes, ...(pushes.length ? [null] : []), { label: t('ctx.delete'), run: () => repo.git({ kind: 'deleteTag', name: tag.name }) }])
}

export function commitMenu(repo: Repo, { sha }: Commit) {
  return popup([
    { label: t('ctx.createBranchHere'), run: () => createBranch(repo, sha) },
    { label: t('ctx.createTagHere'), run: () => createTag(repo, sha) },
    null,
    { label: t('ctx.checkoutDetached'), run: () => repo.git({ kind: 'checkoutDetached', sha }) },
    { label: 'Cherry-pick', run: () => repo.git({ kind: 'cherryPick', sha }) },
    { label: 'Revert', run: () => repo.git({ kind: 'revert', sha }) },
    null,
    { label: t('ctx.resetSoft'), run: () => reset(repo, sha, 'soft') },
    { label: t('ctx.resetMixed'), run: () => reset(repo, sha, 'mixed') },
    { label: t('ctx.resetHard'), run: () => reset(repo, sha, 'hard') },
    { label: t('ctx.interactiveRebase'), run: () => repo.openRebase(sha) },
    null,
    { label: t('ctx.copySha'), run: () => navigator.clipboard.writeText(sha) },
  ])
}

/** Azioni di branch, remote e operazioni in corso, sul repo della tab attiva. */
export function registerBranchActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const withRepo = (fn: (r: Repo) => unknown) => () => {
    const r = repo()
    return r && fn(r)
  }
  const idle = () => repo()?.busy === null
  const inOperation = () => !!repo()?.status?.operation
  const step = (s: 'continue' | 'abort') =>
    withRepo((r) => r.status?.operation && r.git({ kind: 'operation', op: r.status.operation, step: s }))

  registry.register(
    { id: 'remote.fetch', title: 'Fetch', when: idle, run: withRepo((r) => r.git({ kind: 'fetch' })) },
    { id: 'remote.pull', title: 'Pull', when: idle, run: withRepo((r) => r.git({ kind: 'pull', mode: 'config' })) },
    { id: 'remote.pullRebase', title: 'Pull (rebase)', when: idle, run: withRepo((r) => r.git({ kind: 'pull', mode: 'rebase' })) },
    { id: 'remote.pullMerge', title: 'Pull (merge)', when: idle, run: withRepo((r) => r.git({ kind: 'pull', mode: 'merge' })) },
    { id: 'remote.push', title: 'Push', when: idle, run: withRepo((r) => push(r, false)) },
    { id: 'remote.forcePush', get title() { return t('action.remote.forcePush') }, when: idle, run: withRepo((r) => push(r, true)) },
    { id: 'remote.add', get title() { return t('action.remote.add') }, when: idle, run: withRepo(addRemote) },
    { id: 'branch.create', get title() { return t('action.branch.create') }, when: idle, run: withRepo((r) => createBranch(r, 'HEAD')) },
    { id: 'repo.clone', get title() { return t('action.repo.clone') }, when: () => app.git?.ok === true, run: () => app.cloneRepo() },
    { id: 'operation.continue', get title() { return t('action.operation.continue') }, when: inOperation, run: step('continue') },
    { id: 'operation.abort', get title() { return t('action.operation.abort') }, when: inOperation, run: step('abort') },
  )
}
