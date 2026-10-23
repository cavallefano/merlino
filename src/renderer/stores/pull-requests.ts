import { defineStore, getActivePinia } from 'pinia'
import { computed, ref, shallowRef, triggerRef, watch } from 'vue'
import type { Result } from '../../shared/ipc'
import type {
  CiStatus,
  FileChange,
  FileDiff,
  GitErrorInfo,
  MergeOptions,
  NewPullRequest,
  PullRequest,
  PullRequestChanges,
  PullRequestDetail,
  PullRequestFilter,
  PullRequestRemote,
} from '../../shared/types'
import { isActive, matches, pickRemote } from '../pull-requests/model'
import { useAppStore } from './app'
import { useRepoStore } from './repo'

const storeId = (root: string) => `pull-requests:${root}`
/** Il remote scelto, per repo: una comodità locale, nel localStorage della finestra. */
const remoteKey = (root: string) => `merlino.pullRequestRemote:${root}`
const CI_WORKERS = 4

export type PullRequestTab = 'conversation' | 'commits' | 'changes' | 'checks'

function define(root: string) {
  return defineStore(storeId(root), () => {
    const app = useAppStore()
    const repo = useRepoStore(root)
    const remotes = shallowRef<PullRequestRemote[]>([])
    const remote = ref<string | null>(null)
    const filter = ref<PullRequestFilter>('open')
    const query = ref('')
    const list = shallowRef<PullRequest[] | null>(null)
    /** PR aperte del remote scelto, per la sidebar. */
    const openCount = ref<number | null>(null)
    /** L'ultimo caricamento è fallito: la lista mostrata è quella di prima. */
    const stale = ref(false)
    const error = shallowRef<GitErrorInfo | null>(null)
    const selected = ref<number | null>(null)
    const detail = shallowRef<PullRequestDetail | null>(null)
    const tab = ref<PullRequestTab>('conversation')
    const changes = shallowRef<PullRequestChanges | null>(null)
    const changesError = ref<string | null>(null)
    /** Commit aperto nella scheda Commit; il suo dettaglio è quello dello store del repo (CommitDetail). */
    const commit = ref<string | null>(null)
    const file = shallowRef<FileChange | null>(null)
    const diff = shallowRef<FileDiff | null>(null)
    /** CI per SHA: resta in memoria; si ricontrollano solo quelle in corso. */
    const ci = shallowRef(new Map<string, CiStatus>())
    /** Ora (secondi) per le durate delle pipeline: avanza a ogni controllo, senza un timer suo. */
    const now = ref(Math.floor(Date.now() / 1000))
    /** Un'azione sul server in corso (commento, merge, chiusura). */
    const busy = ref(false)
    const merging = ref(false)
    /** Dialog di una nuova PR aperto, con il branch proposto. */
    const creating = shallowRef<{ branch: string; base?: string; title?: string } | null>(null)
    let listRequest = 0
    let detailRequest = 0
    let diffRequest = 0

    const current = computed(() => remotes.value.find((r) => r.name === remote.value) ?? null)
    const withAccount = computed(() => remotes.value.filter((r) => r.account))
    const visible = computed(() => (list.value ?? []).filter((p) => matches(p, query.value)))

    function clear() {
      list.value = null
      openCount.value = null
      stale.value = false
      error.value = null
      selected.value = null
      detail.value = null
      changes.value = null
    }

    async function loadRemotes() {
      const r = await window.api.prRemotes(root)
      if (!r.ok) return
      remotes.value = r.value
      const name = pickRemote(r.value, localStorage.getItem(remoteKey(root)))
      if (name !== remote.value) {
        remote.value = name
        clear()
      }
    }

    /** Remote e account (cambiano dalle Impostazioni), lista e PR selezionata. */
    async function refresh() {
      await loadRemotes()
      await Promise.all([load(), loadDetail()])
    }

    async function load() {
      const name = remote.value
      if (!name || !current.value?.account) return
      const which = filter.value
      const request = ++listRequest
      const r = await window.api.prList(root, name, which)
      if (request !== listRequest) return
      if (!r.ok) {
        error.value = r.error
        stale.value = list.value !== null
        return
      }
      list.value = r.value
      stale.value = false
      error.value = null
      if (which === 'open') openCount.value = r.value.length
      void loadChecks(r.value.filter((p) => p.state === 'open' && !ci.value.has(p.head.sha)).map((p) => p.head.sha))
    }

    /** CI di più SHA, al massimo CI_WORKERS richieste alla volta. */
    async function loadChecks(shas: string[]) {
      const name = remote.value
      if (!name) return
      const queue = [...new Set(shas)]
      const worker = async () => {
        for (let sha = queue.shift(); sha; sha = queue.shift()) {
          const r = await window.api.prChecks(root, name, sha)
          if (!r.ok || remote.value !== name) continue
          ci.value.set(sha, r.value)
          triggerRef(ci)
          now.value = Math.floor(Date.now() / 1000)
        }
      }
      await Promise.all(Array.from({ length: CI_WORKERS }, worker))
    }

    /** Dalla vista, ogni 30 s: le pipeline con job in corso o in coda, anche se qualcuno è già fallito. */
    const poll = () => {
      now.value = Math.floor(Date.now() / 1000)
      return loadChecks([...ci.value].filter(([, s]) => isActive(s)).map(([sha]) => sha))
    }

    async function select(n: number, next: PullRequestTab = 'conversation') {
      selected.value = n
      detail.value = null
      tab.value = next
      commit.value = null
      changes.value = null
      changesError.value = null
      file.value = null
      diff.value = null
      await loadDetail()
    }

    async function loadDetail() {
      const name = remote.value
      const n = selected.value
      if (!name || n === null) return
      const request = ++detailRequest
      const r = await window.api.prDetail(root, name, n)
      if (request !== detailRequest) return
      if (!r.ok) {
        error.value = r.error
        return
      }
      // Nuovi commit sulla PR: commit e modifiche vanno riletti
      if (detail.value && detail.value.head.sha !== r.value.head.sha) {
        changes.value = null
        changesError.value = null
      }
      detail.value = r.value
      if (!ci.value.has(r.value.head.sha)) void loadChecks([r.value.head.sha])
      if ((tab.value === 'commits' || tab.value === 'changes') && !changes.value) await loadChanges()
    }

    async function setTab(next: PullRequestTab) {
      tab.value = next
      commit.value = null
      if ((next === 'commits' || next === 'changes') && !changes.value) await loadChanges()
    }

    /** Scarica gli oggetti della PR (se mancano) e legge commit e file con git. */
    async function loadChanges() {
      const d = detail.value
      const name = remote.value
      if (!d || !name) return
      changesError.value = null
      const r = await window.api.prChanges(root, name, d.number, { base: d.base.branch, baseSha: d.baseSha, headSha: d.head.sha })
      if (detail.value?.number !== d.number || detail.value.head.sha !== d.head.sha) return
      if (!r.ok) {
        changesError.value = r.error.message
        return
      }
      changes.value = r.value
      await selectFile(r.value.files[0] ?? null)
    }

    async function selectFile(f: FileChange | null) {
      file.value = f
      await loadDiff()
    }

    async function loadDiff(force = false) {
      const d = detail.value
      const f = file.value
      const request = ++diffRequest
      if (!d || !f) {
        diff.value = null
        return
      }
      const target = f.oldPath ? { path: f.path, oldPath: f.oldPath } : { path: f.path }
      const prefs = app.preferences
      const options = { ignoreWhitespace: repo.diffOptions.ignoreWhitespace, force, context: prefs.diffContext, algorithm: prefs.diffAlgorithm }
      const r = await window.api.prFileDiff(root, d.baseSha, d.head.sha, target, options)
      if (request !== diffRequest) return
      if (r.ok) diff.value = r.value
      else changesError.value = r.error.message
    }

    /** Un commit della PR nella scheda Commit; prima servono i suoi oggetti. */
    async function openCommit(sha: string) {
      tab.value = 'commits'
      commit.value = sha
      if (!changes.value) await loadChanges()
      await repo.select(sha)
    }

    /** Un'azione sul server; poi si ricaricano lista e dettaglio, e l'eventuale errore resta visibile. */
    async function act(op: () => Promise<Result<unknown>>): Promise<boolean> {
      busy.value = true
      error.value = null
      const r = await op()
      await Promise.all([load(), loadDetail()])
      busy.value = false
      if (!r.ok) error.value = r.error
      return r.ok
    }

    const target = () => ({ name: remote.value ?? '', n: selected.value ?? 0 })
    const comment = (body: string) => act(() => window.api.prComment(root, target().name, target().n, body))
    const setState = (state: 'open' | 'closed') => act(() => window.api.prSetState(root, target().name, target().n, state))

    /** Dopo il merge anche un fetch del repo. */
    async function merge(options: MergeOptions): Promise<boolean> {
      const ok = await act(() => window.api.prMerge(root, target().name, target().n, options))
      if (ok) await repo.git({ kind: 'fetch' })
      return ok
    }

    async function checkout() {
      const d = detail.value
      if (!d || !remote.value) return
      await repo.run(window.api.prCheckout(root, remote.value, d.number, d.fork ? null : d.head.branch))
    }

    /** push: prima il branch con le modifiche (con upstream), se sul remote manca o è indietro. Poi si apre la nuova PR. */
    async function create(input: NewPullRequest, push: { remote: string; branch: string; remoteBranch: string } | null): Promise<boolean> {
      if (push && !(await repo.git({ kind: 'pushBranch', ...push }))) return false
      const r = await window.api.prCreate(root, input)
      if (!r.ok) {
        error.value = r.error
        return false
      }
      repo.page = 'pullRequests'
      if (remote.value !== input.remote) setRemote(input.remote)
      filter.value = 'open'
      await load()
      await select(r.value)
      return true
    }

    function setRemote(name: string) {
      remote.value = name
      localStorage.setItem(remoteKey(root), name)
      clear()
      void load()
    }

    function setFilter(next: PullRequestFilter) {
      filter.value = next
      list.value = null
      void load()
    }

    // Account nuovi o tolti, o un altro account per un remote: si riparte da lì
    watch(
      () => JSON.stringify([app.settings?.accounts, app.settings?.remoteAccounts]),
      () => void refresh(),
    )
    // "Ignora gli spazi" vale anche per il diff della PR
    watch(
      () => repo.diffOptions.ignoreWhitespace,
      () => void loadDiff(),
    )

    return {
      root, remotes, remote, filter, query, list, openCount, stale, error, selected, detail, tab, changes, changesError, commit, file, diff, ci, now,
      busy, merging, creating, current, withAccount, visible,
      refresh, load, poll, select, loadDetail, setTab, loadChanges, selectFile, loadDiff, openCommit, comment, setState, merge, checkout, create,
      setRemote, setFilter,
    }
  })
}

const definitions = new Map<string, ReturnType<typeof define>>()

/** Uno store per ogni repo aperto, come quello del repo. */
export function usePullRequestStore(root: string) {
  let useStore = definitions.get(root)
  if (!useStore) {
    useStore = define(root)
    definitions.set(root, useStore)
  }
  return useStore()
}

export function disposePullRequestStore(root: string): void {
  const useStore = definitions.get(root)
  if (!useStore) return
  useStore().$dispose()
  delete getActivePinia()?.state.value[storeId(root)]
  definitions.delete(root)
}
