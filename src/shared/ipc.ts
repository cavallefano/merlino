import type {
  AppSettings,
  BlameResult,
  CiStatus,
  CommandLogEntry,
  Commit,
  CommitDetail,
  CommitTemplate,
  DiffOptions,
  FileContent,
  FileDiff,
  FlowConfig,
  FlowFinishInfo,
  GitCheck,
  GitConfigKey,
  GitErrorInfo,
  HostingAccount,
  HostingRepo,
  HostingService,
  HistoryPage,
  HistorySummary,
  MenuItem,
  MergeOptions,
  NewPullRequest,
  PatchMode,
  Preferences,
  PullRequest,
  PullRequestChanges,
  PullRequestDetail,
  PullRequestFilter,
  PullRequestRemote,
  RefsSnapshot,
  RepoCommand,
  RepoInfo,
  StashEntry,
  TreeEntry,
  WorkingArea,
  WorkingStatus,
} from './types'

export type Result<T> = { ok: true; value: T } | { ok: false; error: GitErrorInfo }

export const Channels = {
  getSettings: 'settings:get',
  updatePreferences: 'settings:update-preferences',
  gitGlobalConfig: 'git:global-config',
  pickApp: 'app:pick-app',
  startDrag: 'app:start-drag',
  saveCommitTemplates: 'settings:save-templates',
  setDefaultTemplate: 'settings:set-default-template',
  gitCommitTemplate: 'repo:git-commit-template',
  openInTerminal: 'repo:open-in-terminal',
  setGitGlobalConfig: 'git:set-global-config',
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
  historyFileCounts: 'history:file-counts',
  commitDetail: 'commit:detail',
  commitFileDiff: 'commit:file-diff',
  blame: 'file:blame',
  treeList: 'file:tree',
  fileContent: 'file:content',
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
  refs: 'repo:refs',
  command: 'repo:command',
  rebaseRange: 'repo:rebase-range',
  clone: 'repo:clone',
  openInEditor: 'repo:open-in-editor',
  contextMenu: 'app:context-menu',
  progress: 'repo:progress',
  addAccount: 'accounts:add',
  removeAccount: 'accounts:remove',
  setRemoteAccount: 'accounts:set-remote',
  prRemotes: 'pr:remotes',
  prRepo: 'pr:repo',
  prList: 'pr:list',
  prDetail: 'pr:detail',
  prChecks: 'pr:checks',
  prChanges: 'pr:changes',
  prFileDiff: 'pr:file-diff',
  prComment: 'pr:comment',
  prMerge: 'pr:merge',
  prSetState: 'pr:set-state',
  prCreate: 'pr:create',
  prCheckout: 'pr:checkout',
  prBranchSummary: 'pr:branch-summary',
  flowConfig: 'flow:config',
  flowFinishInfo: 'flow:finish-info',
  // eventi dal main al renderer
  repoChanged: 'repo:changed',
  fetched: 'repo:fetched',
  commandLogged: 'log:entry',
  menuAction: 'menu:action',
  openPath: 'app:open-path',
} as const

/** API esposta al renderer come window.api: solo operazioni con nome, mai argomenti git liberi. */
export interface Api {
  platform: string
  getSettings(): Promise<AppSettings>
  /** Salva le preferenze (validate nel main) e ne applica gli effetti; restituisce le impostazioni aggiornate. */
  updatePreferences(patch: Partial<Preferences>): Promise<Result<AppSettings>>
  /** Salva la libreria dei template (validata nel main); i predefiniti dei template eliminati se ne vanno. */
  saveCommitTemplates(templates: CommitTemplate[]): Promise<Result<AppSettings>>
  /** Template predefinito di un repo; null lo toglie. */
  setDefaultTemplate(root: string, id: string | null): Promise<Result<AppSettings>>
  /** Il commit.template di git del repo (o globale); null se non c'è. */
  gitCommitTemplate(root: string): Promise<Result<{ path: string; text: string } | null>>
  /** Chiavi della config globale di git gestite dalle Impostazioni; '' = non impostata. */
  gitGlobalConfig(): Promise<Result<Record<GitConfigKey, string>>>
  /** '' toglie la chiave. */
  setGitGlobalConfig(key: GitConfigKey, value: string): Promise<Result<void>>
  checkGit(): Promise<GitCheck>
  setGitPath(path: string): Promise<GitCheck>
  /** Dialog di scelta cartella; null se annullato. */
  pickRepoFolder(defaultPath?: string): Promise<string | null>
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
  /** File cambiati dai commit [start, start + count) della storia caricata, da SHA a numero. */
  historyFileCounts(root: string, start: number, count: number): Promise<Result<Record<string, number>>>
  commitDetail(root: string, sha: string): Promise<Result<CommitDetail>>
  commitFileDiff(root: string, sha: string, file: { path: string; oldPath?: string }, options: DiffOptions): Promise<Result<FileDiff>>
  /** Blame di un file a un commit; sha null: il file sul disco. */
  blame(root: string, sha: string | null, path: string, ignoreWhitespace: boolean): Promise<Result<BlameResult>>
  /** Voci di una cartella a un commit; dir '' è la radice. */
  treeList(root: string, sha: string, dir: string): Promise<Result<TreeEntry[]>>
  /** Contenuto di un file a un commit; null se lì non c'è. */
  fileContent(root: string, sha: string, path: string, force: boolean): Promise<Result<FileContent | null>>
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
  refs(root: string): Promise<Result<RefsSnapshot>>
  /** Operazioni su branch, tag e remote (validate nel main variante per variante). */
  git(root: string, command: RepoCommand): Promise<Result<void>>
  /** Commit dal commit scelto a HEAD, per il rebase interattivo. */
  rebaseRange(root: string, sha: string): Promise<Result<Commit[]>>
  /** Clona url dentro la cartella parent; restituisce la cartella del nuovo repo. */
  clone(url: string, parent: string): Promise<Result<string>>
  /** Apre un file del repo con l'applicazione predefinita del sistema. */
  openInEditor(root: string, path: string): Promise<Result<void>>
  /** Dialog di scelta di un'applicazione (.app su macOS, .exe su Windows); null se annullato. */
  pickApp(): Promise<string | null>
  /** Apre il terminale scelto nelle Impostazioni (o quello predefinito) nella cartella del repo. */
  openInTerminal(root: string): Promise<Result<void>>
  /** Avvia il drag nativo di un file (anche verso altre app); sincrona perché va chiamata dentro il dragstart. */
  startDrag(root: string, item: { path: string; sha?: string }): Result<void>
  /** Menu contestuale nativo; restituisce l'id della voce scelta o null. */
  contextMenu(items: MenuItem[]): Promise<string | null>
  addAccount(service: HostingService, host: string, token: string): Promise<Result<{ settings: AppSettings; account: HostingAccount }>>
  removeAccount(id: string): Promise<Result<AppSettings>>
  /** id null: "Automatico". */
  setRemoteAccount(root: string, remote: string, id: string | null): Promise<Result<AppSettings>>
  prRemotes(root: string): Promise<Result<PullRequestRemote[]>>
  prRepo(root: string, remote: string): Promise<Result<HostingRepo>>
  prList(root: string, remote: string, filter: PullRequestFilter): Promise<Result<PullRequest[]>>
  prDetail(root: string, remote: string, number: number): Promise<Result<PullRequestDetail>>
  prChecks(root: string, remote: string, sha: string): Promise<Result<CiStatus>>
  /** Scarica gli oggetti della PR se mancano, poi commit e file. */
  prChanges(root: string, remote: string, number: number, refs: { base: string; baseSha: string; headSha: string }): Promise<Result<PullRequestChanges>>
  prFileDiff(root: string, baseSha: string, headSha: string, file: { path: string; oldPath?: string }, options: DiffOptions): Promise<Result<FileDiff>>
  prComment(root: string, remote: string, number: number, body: string): Promise<Result<void>>
  prMerge(root: string, remote: string, number: number, options: MergeOptions): Promise<Result<void>>
  prSetState(root: string, remote: string, number: number, state: 'open' | 'closed'): Promise<Result<void>>
  /** Restituisce il numero della nuova PR. */
  prCreate(root: string, input: NewPullRequest): Promise<Result<number>>
  /** branch null: PR da fork (pr/<n>). */
  prCheckout(root: string, remote: string, number: number, branch: string | null): Promise<Result<void>>
  prBranchSummary(root: string, base: string, head: string): Promise<Result<{ count: number; message: string }>>
  /** Configurazione di git flow del repo; null se non è inizializzato. */
  flowConfig(root: string): Promise<Result<FlowConfig | null>>
  /** Destinazioni, tag e remote del Finish di un branch, per il riepilogo del dialog. */
  flowFinishInfo(root: string, branch: string): Promise<Result<FlowFinishInfo>>
  onProgress(cb: (event: { root: string; line: string }) => void): () => void
  /** Percorso sul disco di un file o di una cartella trascinati nella finestra. */
  pathForFile(file: File): string
  onRepoChanged(cb: (root: string) => void): () => void
  /** Dopo ogni fetch (manuale, pull o automatico) di un repo. */
  onFetched(cb: (root: string) => void): () => void
  onCommandLogged(cb: (entry: CommandLogEntry) => void): () => void
  onMenuAction(cb: (actionId: string) => void): () => void
  onOpenPath(cb: (path: string) => void): () => void
}
