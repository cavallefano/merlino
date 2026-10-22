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
  PatchMode,
  RepoInfo,
  StashEntry,
  WorkingArea,
  WorkingStatus,
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
  workingStatus: 'working:status',
  workingDiff: 'working:diff',
  stage: 'working:stage',
  unstage: 'working:unstage',
  discard: 'working:discard',
  stageAll: 'working:stage-all',
  unstageAll: 'working:unstage-all',
  applyPatch: 'working:apply-patch',
  commit: 'working:commit',
  lastCommitMessage: 'working:last-message',
  stashList: 'stash:list',
  stashPush: 'stash:push',
  stashAction: 'stash:action',
  ignorePath: 'working:ignore',
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
  workingStatus(root: string): Promise<Result<WorkingStatus>>
  workingDiff(root: string, file: { path: string; oldPath?: string }, area: WorkingArea, options: DiffOptions): Promise<Result<FileDiff>>
  stage(root: string, paths: string[]): Promise<Result<void>>
  unstage(root: string, files: { path: string; oldPath?: string }[]): Promise<Result<void>>
  discard(root: string, files: { path: string; untracked: boolean }[]): Promise<Result<void>>
  stageAll(root: string): Promise<Result<void>>
  unstageAll(root: string): Promise<Result<void>>
  /** Patch costruita dal renderer con buildPatch sulle righe scelte. */
  applyPatch(root: string, patch: string, mode: PatchMode): Promise<Result<void>>
  commit(root: string, message: string, amend: boolean): Promise<Result<void>>
  lastCommitMessage(root: string): Promise<Result<string>>
  stashList(root: string): Promise<Result<StashEntry[]>>
  stashPush(root: string, message: string, includeUntracked: boolean): Promise<Result<void>>
  stashAction(root: string, action: 'apply' | 'pop' | 'drop', ref: string): Promise<Result<void>>
  ignorePath(root: string, path: string): Promise<Result<void>>
  /** Percorso sul disco di un file o di una cartella trascinati nella finestra. */
  pathForFile(file: File): string
  onRepoChanged(cb: (root: string) => void): () => void
  onCommandLogged(cb: (entry: CommandLogEntry) => void): () => void
  onMenuAction(cb: (actionId: string) => void): () => void
  onOpenPath(cb: (path: string) => void): () => void
}
