import { defineStore, getActivePinia } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import { expandTemplate, GIT_TEMPLATE_ID, splitMessage } from '../../shared/commit-template'
import type { Result } from '../../shared/ipc'
import { buildPatch, lineKey } from '../../shared/patch'
import { useAppStore } from './app'
import type {
  Commit,
  CommitDetail,
  CommitTemplate,
  DiffOptions,
  FileChange,
  FileDiff,
  FlowConfig,
  FlowType,
  GraphRow,
  HistoryPage,
  HistorySummary,
  PatchMode,
  RefsSnapshot,
  RepoCommand,
  RepoInfo,
  StashEntry,
  WorkingArea,
  WorkingFile,
  WorkingStatus,
} from '../../shared/types'

const storeId = (root: string) => `repo:${root}`

/** Dialog di git flow aperto; init può avere un dialog da aprire dopo (prima azione su un repo non inizializzato). */
export type FlowDialog = { kind: 'init'; then?: FlowDialog } | { kind: 'start'; type: FlowType } | { kind: 'finish'; branch: string }
export const PAGE_SIZE = 500

interface WorkingSelection {
  file: WorkingFile
  area: WorkingArea
}

/** Il primo file da mostrare nelle modifiche locali. */
function firstWorking(s: WorkingStatus): WorkingSelection | null {
  for (const area of ['unstaged', 'untracked', 'staged', 'conflicted'] as const) {
    const file = s[area][0]
    if (file) return { file, area }
  }
  return null
}

function define(root: string) {
  return defineStore(storeId(root), () => {
    const info = ref<RepoInfo | null>(null)
    const error = ref<string | null>(null)

    // Storia: pagine caricate quando servono, scartate quando cambia la versione.
    // Le pagine non sono reattive (sono tante): pagesTick segnala che ne è arrivata una.
    const history = ref<HistorySummary>({ version: 0, total: 0, lanes: 0 })
    const query = ref('')
    const pagesTick = ref(0)
    let pages = new Map<number, HistoryPage>()
    const loading = new Set<string>()
    // Numero di file cambiati per SHA: arriva dopo le pagine, countsTick fa ridisegnare le righe
    const countsTick = ref(0)
    const fileCounts = new Map<string, number>()

    /** Cosa mostrano i pannelli centrale e destro: la storia o le pull request. */
    const page = ref<'history' | 'pullRequests'>('history')
    const view = ref<'commit' | 'working'>('commit')
    const selected = ref<string | null>(null)
    const selectedIndex = ref(-1)
    const detail = shallowRef<CommitDetail | null>(null)
    const selectedFile = shallowRef<FileChange | null>(null)
    const diff = shallowRef<FileDiff | null>(null)
    const prefs = () => useAppStore().preferences
    const diffOptions = reactive({ split: prefs().diffSplit, ignoreWhitespace: prefs().diffIgnoreWhitespace })
    const diffOptionsFor = (force: boolean): DiffOptions => ({
      ignoreWhitespace: diffOptions.ignoreWhitespace,
      force,
      context: prefs().diffContext,
      algorithm: prefs().diffAlgorithm,
    })
    let detailRequest = 0
    let diffRequest = 0

    // Modifiche locali
    const status = shallowRef<WorkingStatus | null>(null)
    const stashes = shallowRef<StashEntry[]>([])
    const working = shallowRef<WorkingSelection | null>(null)
    /** Popup del diff aperto e cosa mostra; null = chiuso. */
    const diffDialog = ref<'commit' | 'working' | 'pr' | null>(null)
    const workingDiff = shallowRef<FileDiff | null>(null)
    const selectedLines = shallowRef<ReadonlySet<string>>(new Set())
    let anchor: string | null = null
    let workingRequest = 0
    const subject = ref('')
    const body = ref('')
    const amend = ref(false)

    // Template di commit
    const gitTemplate = shallowRef<CommitTemplate | null>(null)
    const templatePicker = ref<'button' | 'slash' | null>(null)
    /** Messaggio inserito dalla precompilazione: finché resta identico, Amend lo sostituisce. */
    let prefilled: string | null = null
    const currentMessage = () => (body.value.trim() ? `${subject.value}\n\n${body.value}` : subject.value)

    /** Il predefinito del repo: quello scelto nelle Impostazioni, altrimenti il commit.template di git. */
    const defaultTemplate = computed(() => {
      const s = useAppStore().settings
      const id = s?.defaultTemplates[root]
      return s?.commitTemplates.find((t) => t.id === id) ?? gitTemplate.value
    })

    async function loadGitTemplate() {
      const r = await window.api.gitCommitTemplate(root)
      gitTemplate.value = r.ok && r.value ? { id: GIT_TEMPLATE_ID, name: 'commit.template (git)', ...splitMessage(r.value.text) } : null
    }

    function applyTemplate(t: CommitTemplate) {
      const filled = expandTemplate(t, info.value?.branch ?? null)
      subject.value = filled.subject
      body.value = filled.body
      prefilled = null
    }

    function prefillTemplate() {
      const t = defaultTemplate.value
      if (!t || amend.value || subject.value.trim() || body.value.trim()) return
      applyTemplate(t)
      prefilled = currentMessage()
    }

    // Branch, tag e remote
    const refs = shallowRef<RefsSnapshot | null>(null)
    /** Comando git in esecuzione (fetch, push…), per disattivare i pulsanti e mostrare l'avanzamento. */
    const busy = ref<RepoCommand['kind'] | null>(null)
    const progress = ref('')
    /** Rebase interattivo da preparare: il commit di partenza e i commit da lì a HEAD (dal più recente). */
    const rebasePlan = shallowRef<{ sha: string; commits: Commit[] } | null>(null)
    /** Configurazione di git flow; null se il repo non è inizializzato. */
    const flow = shallowRef<FlowConfig | null>(null)
    const flowDialog = shallowRef<FlowDialog | null>(null)

    async function loadFlow() {
      const r = await window.api.flowConfig(root)
      if (r.ok) flow.value = r.value
    }

    /** Apre un dialog di git flow; su un repo non inizializzato prima quello di init. */
    function openFlow(dialog: FlowDialog) {
      flowDialog.value = flow.value || dialog.kind === 'init' ? dialog : { kind: 'init', then: dialog }
    }

    const changeCount = computed(() => {
      const s = status.value
      return s ? s.staged.length + s.unstaged.length + s.untracked.length + s.conflicted.length : 0
    })
    const canCommit = computed(() => subject.value.trim() !== '' && (amend.value || (status.value?.staged.length ?? 0) > 0))

    async function refresh() {
      const [r] = await Promise.all([window.api.repoInfo(root), loadStatus(), loadStashes(), loadRefs(), loadHistory(), loadGitTemplate(), loadFlow()])
      if (r.ok) info.value = r.value
      else error.value = r.error.message
      if (view.value === 'working') await loadWorkingDiff()
    }

    async function loadStatus() {
      const r = await window.api.workingStatus(root)
      if (r.ok) status.value = r.value
      else error.value = r.error.message
    }

    async function loadStashes() {
      const r = await window.api.stashList(root)
      if (r.ok) stashes.value = r.value
    }

    async function loadRefs() {
      const r = await window.api.refs(root)
      if (r.ok) refs.value = r.value
    }

    async function loadHistory() {
      const r = await window.api.historyLoad(root, query.value)
      if (!r.ok) {
        error.value = r.error.message
        return
      }
      if (r.value.version === history.value.version) return
      pages = new Map()
      history.value = r.value
      pagesTick.value++
      await ensureRows(0, PAGE_SIZE - 1)
      const firstCommit = commitAt(0)
      if (selected.value) selectedIndex.value = indexOfLoaded(selected.value)
      // Selezione automatica del primo commit: non deve togliere l'utente dalla vista delle modifiche locali
      else if (firstCommit) void select(firstCommit.sha, 0, false)
    }

    async function ensureRows(start: number, end: number) {
      const version = history.value.version
      const requests: Promise<void>[] = []
      for (let p = Math.floor(start / PAGE_SIZE); p <= Math.floor(end / PAGE_SIZE); p++) {
        const key = `${version}:${p}`
        if (p * PAGE_SIZE >= history.value.total || pages.has(p) || loading.has(key)) continue
        loading.add(key)
        requests.push(
          window.api.historyPage(root, p * PAGE_SIZE, PAGE_SIZE).then((r) => {
            loading.delete(key)
            if (r.ok && r.value.version === version && history.value.version === version) {
              pages.set(p, r.value)
              pagesTick.value++
              void loadFileCounts(p)
            }
          }),
        )
      }
      await Promise.all(requests)
    }

    async function loadFileCounts(p: number) {
      const r = await window.api.historyFileCounts(root, p * PAGE_SIZE, PAGE_SIZE)
      if (!r.ok) return
      for (const [sha, n] of Object.entries(r.value)) fileCounts.set(sha, n)
      countsTick.value++
    }

    function fileCountOf(sha: string): number | undefined {
      void countsTick.value
      return fileCounts.get(sha)
    }

    function commitAt(i: number): Commit | undefined {
      void pagesTick.value
      return pages.get(Math.floor(i / PAGE_SIZE))?.commits[i % PAGE_SIZE]
    }

    function rowAt(i: number): GraphRow | undefined {
      void pagesTick.value
      return pages.get(Math.floor(i / PAGE_SIZE))?.rows[i % PAGE_SIZE]
    }

    function indexOfLoaded(sha: string): number {
      for (const [p, page] of pages) {
        const j = page.commits.findIndex((c) => c.sha === sha)
        if (j !== -1) return p * PAGE_SIZE + j
      }
      return -1
    }

    async function select(sha: string, index = indexOfLoaded(sha), show = true) {
      if (show) view.value = 'commit'
      selected.value = sha
      selectedIndex.value = index
      const request = ++detailRequest
      const r = await window.api.commitDetail(root, sha)
      if (request !== detailRequest) return
      if (!r.ok) {
        error.value = r.error.message
        return
      }
      detail.value = r.value
      await selectFile(r.value.files[0] ?? null)
    }

    async function selectFile(file: FileChange | null) {
      selectedFile.value = file
      await loadDiff()
    }

    async function loadDiff(force = false) {
      const file = selectedFile.value
      const sha = selected.value
      const request = ++diffRequest
      if (!file || !sha) {
        diff.value = null
        return
      }
      const target = file.oldPath ? { path: file.path, oldPath: file.oldPath } : { path: file.path }
      const r = await window.api.commitFileDiff(root, sha, target, diffOptionsFor(force))
      if (request !== diffRequest) return
      if (r.ok) diff.value = r.value
      else error.value = r.error.message
    }

    async function search(text: string) {
      query.value = text.trim()
      await loadHistory()
    }

    function toggleSplit() {
      diffOptions.split = !diffOptions.split
    }

    async function toggleWhitespace() {
      diffOptions.ignoreWhitespace = !diffOptions.ignoreWhitespace
      selectedLines.value = new Set()
      await (view.value === 'working' ? loadWorkingDiff() : loadDiff())
    }

    function move(step: 1 | -1) {
      const i = selectedIndex.value + step
      if (selectedIndex.value < 0 || i < 0 || i >= history.value.total) return
      const commit = commitAt(i)
      if (commit) void select(commit.sha, i)
    }

    // --- Modifiche locali ---

    async function selectWorking() {
      view.value = 'working'
      if (!working.value && status.value) working.value = firstWorking(status.value)
      await loadGitTemplate()
      prefillTemplate()
      await loadWorkingDiff()
    }

    async function selectWorkingFile(file: WorkingFile, area: WorkingArea) {
      view.value = 'working'
      working.value = { file, area }
      selectedLines.value = new Set()
      await loadWorkingDiff()
    }

    async function loadWorkingDiff() {
      // Il file può essere uscito dalla sua sezione (es. dopo lo stage): si passa al primo disponibile
      const s = status.value
      const current = working.value
      if (s && (!current || !s[current.area].some((f) => f.path === current.file.path))) {
        working.value = firstWorking(s)
        selectedLines.value = new Set()
      }
      const w = working.value
      const request = ++workingRequest
      if (!w) {
        workingDiff.value = null
        return
      }
      const target = w.file.oldPath ? { path: w.file.path, oldPath: w.file.oldPath } : { path: w.file.path }
      const r = await window.api.workingDiff(root, target, w.area, diffOptionsFor(false))
      if (request !== workingRequest) return
      if (r.ok) workingDiff.value = r.value
      else error.value = r.error.message
    }

    /** Esegue un'operazione, mostra l'eventuale errore e ricarica lo stato da git. */
    async function run(op: Promise<Result<unknown>>): Promise<boolean> {
      error.value = null
      const r = await op
      if (!r.ok) error.value = r.error.message
      await refresh()
      return r.ok
    }

    const pathOnly = (f: WorkingFile) => (f.oldPath ? { path: f.path, oldPath: f.oldPath } : { path: f.path })
    const stage = (files: WorkingFile[]) => run(window.api.stage(root, files.map((f) => f.path)))
    const unstage = (files: WorkingFile[]) => run(window.api.unstage(root, files.map(pathOnly)))
    const discard = (files: WorkingFile[], untracked: boolean) =>
      run(window.api.discard(root, files.map((f) => ({ path: f.path, untracked }))))
    const stageEverything = () => run(window.api.stageAll(root))
    const unstageEverything = () => run(window.api.unstageAll(root))
    const ignore = (file: WorkingFile) => run(window.api.ignorePath(root, file.path))

    async function applyLines(mode: PatchMode, keys: ReadonlySet<string> = selectedLines.value) {
      const current = workingDiff.value
      const patch = current && buildPatch(current, keys, mode !== 'stage')
      if (!patch) return
      selectedLines.value = new Set()
      await run(window.api.applyPatch(root, patch, mode))
    }

    /** Seleziona o deseleziona una riga; con range, tutte le righe cambiate dall'ultima cliccata (stesso blocco). */
    function toggleLine(key: string, range: boolean) {
      const next = new Set(selectedLines.value)
      const [hunk, line] = key.split(':').map(Number)
      const [anchorHunk, anchorLine] = anchor?.split(':').map(Number) ?? []
      const lines = workingDiff.value?.hunks[hunk]?.lines
      if (range && lines && anchorHunk === hunk && anchorLine !== undefined) {
        for (let i = Math.min(anchorLine, line); i <= Math.max(anchorLine, line); i++) {
          if (lines[i] && lines[i].type !== 'context') next.add(lineKey(hunk, i))
        }
      } else if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      anchor = key
      selectedLines.value = next
    }

    function clearSelection() {
      selectedLines.value = new Set()
    }

    async function setAmend(value: boolean) {
      amend.value = value
      // Il template precompilato e non toccato si sostituisce come un composer vuoto
      const untouched = prefilled !== null && currentMessage() === prefilled
      if (!value || (subject.value.trim() && !untouched)) return
      const r = await window.api.lastCommitMessage(root)
      if (!r.ok) return
      const [first = '', ...rest] = r.value.split('\n')
      subject.value = first
      body.value = rest.join('\n').trim()
      prefilled = null
    }

    async function commitChanges() {
      if (!canCommit.value) return
      const message = body.value.trim() ? `${subject.value.trim()}\n\n${body.value.trim()}` : subject.value.trim()
      if (await run(window.api.commit(root, message, amend.value))) {
        subject.value = ''
        body.value = ''
        amend.value = false
        prefilled = null
        prefillTemplate()
      }
    }

    const stashPush = (message: string, untracked: boolean) => run(window.api.stashPush(root, message, untracked))
    const stashAction = (action: 'apply' | 'pop' | 'drop', ref: string) => run(window.api.stashAction(root, action, ref))

    // --- Branch, tag e remote ---

    async function git(command: RepoCommand): Promise<boolean> {
      busy.value = command.kind
      progress.value = ''
      try {
        return await run(window.api.git(root, command))
      } finally {
        busy.value = null
      }
    }

    async function openRebase(sha: string) {
      const r = await window.api.rebaseRange(root, sha)
      if (r.ok) rebasePlan.value = { sha, commits: r.value }
      else error.value = r.error.message
    }

    return {
      root, info, error, refresh,
      history, query, pagesTick, loadHistory, ensureRows, commitAt, rowAt, fileCountOf, search, move,
      page, view, selected, selectedIndex, detail, selectedFile, diff, diffOptions, select, selectFile, loadDiff, toggleSplit, toggleWhitespace,
      status, stashes, working, workingDiff, diffDialog, selectedLines, subject, body, amend, changeCount, canCommit,
      selectWorking, selectWorkingFile, stage, unstage, discard, stageEverything, unstageEverything, ignore,
      applyLines, toggleLine, clearSelection, setAmend, commitChanges, stashPush, stashAction,
      refs, busy, progress, rebasePlan, run, git, openRebase, flow, flowDialog, openFlow,
      gitTemplate, defaultTemplate, templatePicker, applyTemplate, prefillTemplate,
    }
  })
}

const definitions = new Map<string, ReturnType<typeof define>>()

/** Uno store per ogni repo aperto (una tab). */
export function useRepoStore(root: string) {
  let useStore = definitions.get(root)
  if (!useStore) {
    useStore = define(root)
    definitions.set(root, useStore)
  }
  return useStore()
}

export function disposeRepoStore(root: string): void {
  const useStore = definitions.get(root)
  if (!useStore) return
  useStore().$dispose()
  delete getActivePinia()?.state.value[storeId(root)]
  definitions.delete(root)
}
