import { defineStore, getActivePinia } from 'pinia'
import { reactive, ref, shallowRef } from 'vue'
import type { Commit, CommitDetail, FileChange, FileDiff, GraphRow, HistoryPage, HistorySummary, RepoInfo } from '../../shared/types'

const storeId = (root: string) => `repo:${root}`
export const PAGE_SIZE = 500

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

    const selected = ref<string | null>(null)
    const selectedIndex = ref(-1)
    const detail = shallowRef<CommitDetail | null>(null)
    const selectedFile = shallowRef<FileChange | null>(null)
    const diff = shallowRef<FileDiff | null>(null)
    const diffOptions = reactive({ split: false, ignoreWhitespace: false })
    let detailRequest = 0
    let diffRequest = 0

    async function refresh() {
      const r = await window.api.repoInfo(root)
      if (r.ok) {
        info.value = r.value
        error.value = null
      } else {
        error.value = r.error.message
      }
      await loadHistory()
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
      else if (firstCommit) void select(firstCommit.sha, 0)
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
            }
          }),
        )
      }
      await Promise.all(requests)
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

    async function select(sha: string, index = indexOfLoaded(sha)) {
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
      const r = await window.api.commitFileDiff(root, sha, target, { ignoreWhitespace: diffOptions.ignoreWhitespace, force })
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
      await loadDiff()
    }

    function move(step: 1 | -1) {
      const i = selectedIndex.value + step
      if (selectedIndex.value < 0 || i < 0 || i >= history.value.total) return
      const commit = commitAt(i)
      if (commit) void select(commit.sha, i)
    }

    return {
      root, info, error, refresh,
      history, query, pagesTick, loadHistory, ensureRows, commitAt, rowAt, search, move,
      selected, selectedIndex, detail, selectedFile, diff, diffOptions, select, selectFile, loadDiff, toggleSplit, toggleWhitespace,
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
