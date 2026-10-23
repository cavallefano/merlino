import type { BranchInfo, Commit, MenuItem, RemoteBranch, RemoteInfo, TagInfo } from '../../shared/types'
import { type PromptValues, useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'

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
    title: 'Nuovo branch',
    fields: [
      { key: 'name', label: 'Nome' },
      { key: 'checkout', label: 'Passa al nuovo branch', type: 'checkbox', value: true },
    ],
    confirm: 'Crea',
  })
  const name = field(values, 'name')
  if (name) await repo.git({ kind: 'createBranch', name, start, checkout: values?.checkout === true })
}

async function createTag(repo: Repo, sha: string) {
  const values = await useAppStore().prompt({
    title: 'Nuovo tag',
    fields: [
      { key: 'name', label: 'Nome' },
      { key: 'message', label: 'Messaggio (vuoto per un tag leggero)' },
    ],
    confirm: 'Crea',
  })
  const name = field(values, 'name')
  if (name) await repo.git({ kind: 'createTag', name, sha, message: field(values, 'message') })
}

async function renameBranch(repo: Repo, b: BranchInfo) {
  const values = await useAppStore().prompt({
    title: `Rinomina ${b.name}`,
    fields: [{ key: 'name', label: 'Nuovo nome', value: b.name }],
    confirm: 'Rinomina',
  })
  const name = field(values, 'name')
  if (name && name !== b.name) await repo.git({ kind: 'renameBranch', from: b.name, to: name })
}

async function setUpstream(repo: Repo, b: BranchInfo) {
  const values = await useAppStore().prompt({
    title: `Upstream di ${b.name}`,
    fields: [{ key: 'upstream', label: 'Branch remoto (vuoto per toglierlo)', value: b.upstream ?? `${defaultRemote(repo) ?? 'origin'}/${b.name}` }],
    confirm: 'Imposta',
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
  } else if (window.confirm(`Il branch ${name} non è mergiato: i suoi commit potrebbero andare persi. Eliminarlo comunque?`)) {
    await repo.git({ kind: 'deleteBranch', name, force: true })
  }
}

async function deleteRemoteBranch(repo: Repo, remote: RemoteInfo, b: RemoteBranch) {
  if (window.confirm(`Eliminare ${b.fullName} dal server? Il branch sparisce per tutto il team.`)) {
    await repo.git({ kind: 'deleteRemoteBranch', remote: remote.name, name: b.name })
  }
}

async function reset(repo: Repo, sha: string, mode: 'soft' | 'mixed' | 'hard') {
  const question = `Reset hard a ${sha.slice(0, 7)}: le modifiche locali e i commit successivi spariscono dal branch. Continuare?`
  if (mode !== 'hard' || window.confirm(question)) await repo.git({ kind: 'reset', sha, mode })
}

export async function push(repo: Repo, force: boolean) {
  const remote = defaultRemote(repo)
  if (!remote) {
    repo.error = 'Nessun remote configurato: aggiungine uno con "Aggiungi remote…".'
    return
  }
  const question = 'Push forzato: riscrive la storia del branch sul remote (con --force-with-lease, fallisce se nel frattempo qualcuno ha pushato). Continuare?'
  if (!force || window.confirm(question)) await repo.git({ kind: 'push', remote, force })
}

async function addRemote(repo: Repo) {
  const values = await useAppStore().prompt({
    title: 'Aggiungi remote',
    fields: [
      { key: 'name', label: 'Nome', value: repo.refs?.remotes.length ? '' : 'origin' },
      { key: 'url', label: 'URL' },
    ],
    confirm: 'Aggiungi',
  })
  const name = field(values, 'name')
  const url = field(values, 'url')
  if (name && url) await repo.git({ kind: 'addRemote', name, url })
}

// --- Menu contestuali ---

export function branchMenu(repo: Repo, b: BranchInfo) {
  const other = !b.current
  return popup([
    { label: 'Checkout', enabled: other, run: () => repo.git({ kind: 'checkoutBranch', name: b.name }) },
    null,
    { label: 'Merge nel branch corrente', enabled: other, run: () => repo.git({ kind: 'merge', ref: b.name, noFf: false }) },
    { label: 'Merge senza fast-forward', enabled: other, run: () => repo.git({ kind: 'merge', ref: b.name, noFf: true }) },
    { label: 'Rebase del corrente su questo', enabled: other, run: () => repo.git({ kind: 'rebase', onto: b.name }) },
    null,
    { label: 'Rinomina…', run: () => renameBranch(repo, b) },
    { label: 'Imposta upstream…', run: () => setUpstream(repo, b) },
    { label: 'Elimina', enabled: other, run: () => deleteBranch(repo, b.name) },
  ])
}

export function remoteBranchMenu(repo: Repo, remote: RemoteInfo, b: RemoteBranch) {
  return popup([
    { label: 'Checkout', run: () => repo.git({ kind: 'checkoutRemote', fullName: b.fullName }) },
    { label: 'Merge nel branch corrente', run: () => repo.git({ kind: 'merge', ref: b.fullName, noFf: false }) },
    null,
    { label: 'Elimina dal remote', run: () => deleteRemoteBranch(repo, remote, b) },
  ])
}

export function remoteMenu(repo: Repo, remote: RemoteInfo) {
  return popup([
    {
      label: 'Rimuovi',
      run: () => window.confirm(`Rimuovere il remote ${remote.name} (${remote.url})?`) && repo.git({ kind: 'removeRemote', name: remote.name }),
    },
  ])
}

export function tagMenu(repo: Repo, tag: TagInfo) {
  const pushes = (repo.refs?.remotes ?? []).map((r) => ({
    label: `Push su ${r.name}`,
    run: () => repo.git({ kind: 'pushTag', remote: r.name, name: tag.name }),
  }))
  return popup([...pushes, ...(pushes.length ? [null] : []), { label: 'Elimina', run: () => repo.git({ kind: 'deleteTag', name: tag.name }) }])
}

export function commitMenu(repo: Repo, { sha }: Commit) {
  return popup([
    { label: 'Crea branch qui…', run: () => createBranch(repo, sha) },
    { label: 'Crea tag qui…', run: () => createTag(repo, sha) },
    null,
    { label: 'Checkout (HEAD staccato)', run: () => repo.git({ kind: 'checkoutDetached', sha }) },
    { label: 'Cherry-pick', run: () => repo.git({ kind: 'cherryPick', sha }) },
    { label: 'Revert', run: () => repo.git({ kind: 'revert', sha }) },
    null,
    { label: 'Reset soft qui', run: () => reset(repo, sha, 'soft') },
    { label: 'Reset mixed qui', run: () => reset(repo, sha, 'mixed') },
    { label: 'Reset hard qui…', run: () => reset(repo, sha, 'hard') },
    { label: 'Rebase interattivo da qui…', run: () => repo.openRebase(sha) },
    null,
    { label: 'Copia SHA', run: () => navigator.clipboard.writeText(sha) },
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
    { id: 'remote.forcePush', title: 'Push forzato…', when: idle, run: withRepo((r) => push(r, true)) },
    { id: 'remote.add', title: 'Aggiungi remote…', when: idle, run: withRepo(addRemote) },
    { id: 'branch.create', title: 'Nuovo branch…', when: idle, run: withRepo((r) => createBranch(r, 'HEAD')) },
    { id: 'repo.clone', title: 'Clona repository…', when: () => app.git?.ok === true, run: () => app.cloneRepo() },
    { id: 'operation.continue', title: "Continua l'operazione in corso", when: inOperation, run: step('continue') },
    { id: 'operation.abort', title: "Annulla l'operazione in corso", when: inOperation, run: step('abort') },
  )
}
