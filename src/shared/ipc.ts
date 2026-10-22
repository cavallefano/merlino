import type {
  AppSettings,
  CommandLogEntry,
  CommitDetail,
  DiffOptions,
  FileDiff,
  GitCheck,
  GitErrorInfo,
  HistoryPage,
  HistorySummary,
  RepoInfo,
} from './types'

export type Result<T> = { ok: true; value: T } | { ok: false; error: GitErrorInfo }

export const Channels = {
  getSettings: 'settings:get',
  checkGit: 'git:check',
  setGitPath: 'git:set-path',
  pickRepoFolder: 'repo:pick-folder',
  takeInitialPath: 'app:take-initial-path',
  openRepo: 'repo:open',
  initRepo: 'repo:init',
  closeRepo: 'repo:close',
  setActiveRepo: 'repo:set-active',
  repoInfo: 'repo:info',
  getCommandLog: 'log:get',
  historyLoad: 'history:load',
  historyPage: 'history:page',
  commitDetail: 'commit:detail',
  commitFileDiff: 'commit:file-diff',
  // eventi dal main al renderer
  repoChanged: 'repo:changed',
  commandLogged: 'log:entry',
  menuAction: 'menu:action',
  openPath: 'app:open-path',
} as const

/** API esposta al renderer come window.api: solo operazioni con nome, mai argomenti git liberi. */
export interface Api {
  platform: string
  getSettings(): Promise<AppSettings>
  checkGit(): Promise<GitCheck>
  setGitPath(path: string): Promise<GitCheck>
  /** Dialog di scelta cartella; null se annullato. */
  pickRepoFolder(): Promise<string | null>
  /** Cartella passata da riga di comando all'avvio; la restituisce una volta sola. */
  takeInitialPath(): Promise<string | null>
  openRepo(path: string): Promise<Result<RepoInfo>>
  initRepo(path: string): Promise<Result<RepoInfo>>
  closeRepo(root: string): Promise<void>
  setActiveRepo(root: string | null): Promise<void>
  repoInfo(root: string): Promise<Result<RepoInfo>>
  getCommandLog(): Promise<CommandLogEntry[]>
  /** Carica (o riusa) la storia; version cambia quando cambiano ref, HEAD o ricerca. */
  historyLoad(root: string, query: string): Promise<Result<HistorySummary>>
  historyPage(root: string, start: number, count: number): Promise<Result<HistoryPage>>
  commitDetail(root: string, sha: string): Promise<Result<CommitDetail>>
  commitFileDiff(root: string, sha: string, file: { path: string; oldPath?: string }, options: DiffOptions): Promise<Result<FileDiff>>
  /** Percorso sul disco di un file o di una cartella trascinati nella finestra. */
  pathForFile(file: File): string
  onRepoChanged(cb: (root: string) => void): () => void
  onCommandLogged(cb: (entry: CommandLogEntry) => void): () => void
  onMenuAction(cb: (actionId: string) => void): () => void
  onOpenPath(cb: (path: string) => void): () => void
}
