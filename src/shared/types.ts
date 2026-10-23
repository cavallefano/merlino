import type { Lang } from './i18n'

/** Esito del controllo di git all'avvio. */
export interface GitCheck {
  ok: boolean
  /** Eseguibile usato: "git" o un percorso assoluto. */
  path: string
  /** Versione trovata, es. "2.50.1"; null se git non risponde. */
  version: string | null
  /** Messaggio per l'utente quando ok è false. */
  error: string | null
}

/** Un comando git eseguito, per il pannello di output. */
export interface CommandLogEntry {
  id: number
  /** Cartella in cui è stato eseguito; null per gli errori dell'interfaccia. */
  repo: string | null
  args: string[]
  startedAt: number
  durationMs: number
  /** null se il processo non è partito o è stato terminato da un segnale. */
  exitCode: number | null
  ok: boolean
  stderr: string
  /** Chiamata alle API di un servizio: args è [metodo, URL] ed exitCode lo stato HTTP. */
  http?: boolean
}

export interface GitErrorInfo {
  args: string[]
  exitCode: number | null
  stderr: string
  /** Prima riga utile di stderr, da mostrare all'utente. */
  message: string
  /** Errori dei servizi: 'auth' quando il token non è (più) valido, per proporre di aggiornarlo. */
  code?: 'auth'
}

export interface RepoInfo {
  /** Cartella radice del repo, nel formato di percorso del sistema operativo. */
  root: string
  name: string
  /** Branch corrente; null se HEAD è staccato. */
  branch: string | null
  /** SHA di HEAD; null se il repo non ha ancora commit. */
  headSha: string | null
}

export type ThemePreference = 'system' | 'light' | 'dark'

/** Lista e dettaglio affiancati (horizontal) o la lista sopra il dettaglio (vertical). */
export type PanelLayout = 'horizontal' | 'vertical'
export type DiffAlgorithm = 'default' | 'myers' | 'minimal' | 'patience' | 'histogram'

/** Preferenze dell'app, dalla schermata Impostazioni. */
export interface Preferences {
  /** Lingua dell'interfaccia e dei messaggi. */
  language: Lang
  theme: ThemePreference
  panelLayout: PanelLayout
  /** 0 = fetch automatico spento. */
  autoFetchMinutes: number
  fetchPrune: boolean
  restoreTabs: boolean
  subjectWarn: number
  subjectLimit: number
  /** Colonna della guida nella descrizione; 0 = nessuna. */
  bodyGuide: number
  diffSplit: boolean
  diffIgnoreWhitespace: boolean
  diffContext: number
  diffAlgorithm: DiffAlgorithm
  codeFontSize: number
  tabSize: number
  /** null = app predefinita del sistema. */
  editorApp: string | null
  /** null = terminale predefinito. */
  terminalApp: string | null
  /** null = il dialog del clone non parte da una cartella precisa. */
  cloneFolder: string | null
}

export interface CommitTemplate {
  id: string
  name: string
  subject: string
  body: string
}

/** Chiavi della config globale di git gestite dalla sezione Git delle Impostazioni. */
export type GitConfigKey = 'user.name' | 'user.email' | 'commit.gpgsign' | 'gpg.format' | 'user.signingkey' | 'pull.rebase' | 'init.defaultBranch'

export interface AppSettings {
  gitPath: string
  openRepos: string[]
  activeRepo: string | null
  recentRepos: string[]
  preferences: Preferences
  commitTemplates: CommitTemplate[]
  /** Radice del repo → id del template predefinito. */
  defaultTemplates: Record<string, string>
  /** Account di GitHub e GitLab, senza token (stanno cifrati in tokens.json). */
  accounts: HostingAccount[]
  /** "<radice del repo>\n<remote>" → id dell'account scelto dal menu del remote. */
  remoteAccounts: Record<string, string>
}

export interface CommitRef {
  kind: 'head' | 'branch' | 'remote' | 'tag'
  /** Nome breve: main, origin/main, v1.0 */
  name: string
  /** true per il branch su cui è HEAD (e per HEAD staccato). */
  current: boolean
}

export interface Commit {
  sha: string
  parents: string[]
  author: string
  authorEmail: string
  /** Secondi dall'epoch. */
  authorTime: number
  committer: string
  committerEmail: string
  commitTime: number
  subject: string
  refs: CommitRef[]
}

/** Segmento del grafo dalla riga precedente (colonna from) a questa riga (colonna to). */
export interface GraphEdge {
  from: number
  to: number
  /** Linea tratteggiata dalle modifiche locali a HEAD. */
  dashed?: boolean
}

export interface GraphRow {
  /** Colonna del nodo. */
  lane: number
  up: GraphEdge[]
}

export interface HistorySummary {
  /** Cambia quando cambiano ref, HEAD o ricerca: il renderer scarta le pagine vecchie. */
  version: number
  total: number
  /** Colonne del grafo; 0 durante una ricerca (niente grafo). */
  lanes: number
}

export interface HistoryPage {
  version: number
  commits: Commit[]
  rows: GraphRow[]
}

export type FileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U'

export interface FileChange {
  path: string
  /** Solo per rinomine e copie. */
  oldPath?: string
  status: FileStatus
  /** null per i file binari. */
  added: number | null
  deleted: number | null
}

export interface CommitDetail {
  commit: Commit
  /** Messaggio completo (oggetto e corpo). */
  message: string
  files: FileChange[]
}

export interface DiffLine {
  type: 'context' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
  /** La riga è l'ultima del file e non ha a capo ("\ No newline at end of file"). */
  noNewline?: boolean
}

export interface Hunk {
  /** La riga @@ … @@. */
  header: string
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  oldPath?: string
  binary: boolean
  /** Oltre i limiti: hunks vuoti finché non si chiede force. */
  tooLarge: boolean
  hunks: Hunk[]
}

export interface DiffOptions {
  ignoreWhitespace: boolean
  /** Mostra anche se supera i limiti. */
  force: boolean
  /** Righe di contesto (-U); default 3. */
  context?: number
  /** 'default' o assente: diff.algorithm della config di git. */
  algorithm?: DiffAlgorithm
}

export type WorkingArea = 'staged' | 'unstaged' | 'untracked' | 'conflicted'

export interface WorkingFile {
  path: string
  /** Solo per le rinomine in stage. */
  oldPath?: string
  /** '?' per i non tracciati. */
  status: FileStatus | '?'
}

/** Operazione lasciata a metà (di solito per conflitti). */
export type Operation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

export interface WorkingStatus {
  operation: Operation | null
  staged: WorkingFile[]
  unstaged: WorkingFile[]
  untracked: WorkingFile[]
  conflicted: WorkingFile[]
  upstream: string | null
  ahead: number
  behind: number
}

export interface StashEntry {
  /** stash@{n} */
  ref: string
  sha: string
  time: number
  message: string
}

/** stage: index ← righe scelte; unstage: index → le toglie; discard: le toglie dalla cartella di lavoro. */
export type PatchMode = 'stage' | 'unstage' | 'discard'

export interface BranchInfo {
  name: string
  sha: string
  upstream: string | null
  ahead: number
  behind: number
  /** L'upstream non esiste più sul remote. */
  gone: boolean
  current: boolean
}

export interface RemoteBranch {
  /** Nome senza il remote: main */
  name: string
  /** origin/main */
  fullName: string
  sha: string
}

export interface RemoteInfo {
  name: string
  url: string
  branches: RemoteBranch[]
}

export interface TagInfo {
  name: string
  /** Commit del tag (per i tag annotati, quello a cui punta). */
  sha: string
}

export interface RefsSnapshot {
  branches: BranchInfo[]
  remotes: RemoteInfo[]
  tags: TagInfo[]
}

export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'

export interface RebaseStep {
  sha: string
  action: RebaseAction
  /** Solo per reword. */
  message?: string
}

/** Operazioni su branch, tag e remote: una variante per operazione, mai argomenti git liberi. */
export type RepoCommand =
  | { kind: 'createBranch'; name: string; start: string; checkout: boolean }
  | { kind: 'checkoutBranch'; name: string }
  | { kind: 'checkoutRemote'; fullName: string }
  | { kind: 'checkoutDetached'; sha: string }
  | { kind: 'renameBranch'; from: string; to: string }
  | { kind: 'deleteBranch'; name: string; force: boolean }
  | { kind: 'deleteRemoteBranch'; remote: string; name: string }
  | { kind: 'setUpstream'; branch: string; upstream: string | null }
  | { kind: 'merge'; ref: string; noFf: boolean }
  | { kind: 'rebase'; onto: string }
  | { kind: 'cherryPick'; sha: string }
  | { kind: 'revert'; sha: string }
  | { kind: 'reset'; sha: string; mode: 'soft' | 'mixed' | 'hard' }
  | { kind: 'operation'; op: Operation; step: 'continue' | 'skip' | 'abort' }
  | { kind: 'createTag'; name: string; sha: string; message: string }
  | { kind: 'deleteTag'; name: string }
  | { kind: 'pushTag'; remote: string; name: string }
  | { kind: 'fetch' }
  | { kind: 'pull'; mode: 'config' | 'rebase' | 'merge' }
  | { kind: 'push'; remote: string; force: boolean }
  | { kind: 'addRemote'; name: string; url: string }
  | { kind: 'removeRemote'; name: string }
  | { kind: 'pushBranch'; remote: string; branch: string; remoteBranch: string }
  | { kind: 'fastForward'; branch: string; from: string }
  | { kind: 'stashFiles'; paths: string[]; untracked: boolean }
  | { kind: 'applyFileChanges'; sha: string; path: string }
  | { kind: 'flowInit'; main: string; develop: string; prefixes: Record<FlowType, string>; versionTag: string }
  | { kind: 'flowStart'; type: FlowType; name: string; base: string; checkout: boolean; publish: string | null }
  | { kind: 'flowFinish'; branch: string; update: boolean; tagMessage: string; deleteBranch: boolean; deleteRemote: boolean; push: boolean }
  | { kind: 'rebaseInteractive'; sha: string; steps: RebaseStep[] }

export type MenuItem = { id: string; label: string; enabled?: boolean } | { separator: true }

export type HostingService = 'github' | 'gitlab'

/** Account di GitHub o GitLab; il token sta cifrato in tokens.json, mai qui. */
export interface HostingAccount {
  id: string
  service: HostingService
  /** Server, es. github.com o gitlab.example.com:8443 */
  host: string
  username: string
}

/** Un remote del repo e l'account che Merlino usa per le sue pull request. */
export interface PullRequestRemote {
  name: string
  /** null se l'URL non è di un server (cartella locale, file://). */
  host: string | null
  account: HostingAccount | null
}

export type PullRequestState = 'open' | 'merged' | 'closed'
export type PullRequestFilter = PullRequestState | 'all'

export interface PullRequest {
  number: number
  title: string
  body: string
  author: string
  state: PullRequestState
  draft: boolean
  head: { branch: string; sha: string }
  base: { branch: string }
  /** La PR viene da un altro repository. */
  fork: boolean
  /** Proprietario del fork (utente o gruppo); null se non è un fork o non è noto. */
  headOwner: string | null
  /** Secondi dall'epoch, come i commit. */
  createdAt: number
  updatedAt: number
  /** null se il servizio non lo dice nella lista (GitHub). */
  comments: number | null
  url: string
}

export type TimelineItem =
  | { kind: 'comment'; id: string; author: string; time: number; body: string }
  | { kind: 'commit'; sha: string; author: string; time: number; subject: string }

/** Perché il servizio non permette il merge. */
export type MergeBlock = 'conflicts' | 'checks' | 'approvals' | 'draft' | 'discussions' | 'rebase' | 'blocked' | 'closed'

export interface PullRequestDetail extends PullRequest {
  /** Inizio della PR: GitHub base.sha, GitLab diff_refs.base_sha ('' se il servizio non lo dà ancora). */
  baseSha: string
  mergeBlock: MergeBlock | null
  /** Commenti e commit in ordine di tempo. */
  timeline: TimelineItem[]
}

export type MergeMethod = 'merge' | 'squash' | 'rebase' | 'ff'

/** Impostazioni del repository sul server che servono a Merlino. */
export interface HostingRepo {
  defaultBranch: string
  /** GitHub: fra merge, squash e rebase; GitLab: quello del progetto (merge o ff). */
  methods: MergeMethod[]
  /** Squash di GitLab; null su GitHub, dove è un metodo. */
  squash: 'never' | 'optional' | 'default' | 'always' | null
  deleteBranch: boolean
}

export type CheckState = 'passed' | 'failed' | 'running' | 'queued' | 'skipped' | 'cancelled'

export interface Check {
  name: string
  state: CheckState
  url: string | null
  /** Stage (GitLab) o workflow (GitHub); null per gli altri controlli. */
  group: string | null
  /** Secondi dall'epoch; null se il job non è partito o non è finito. */
  startedAt: number | null
  finishedAt: number | null
}

export interface CiStatus {
  summary: 'passed' | 'failed' | 'running' | 'none'
  checks: Check[]
}

export interface MergeOptions {
  method: MergeMethod
  /** Testa mostrata all'utente: se nel frattempo è cambiata, il servizio rifiuta. */
  sha: string
  /** '' = messaggio predefinito del servizio. */
  message: string
  /** Squash di GitLab (su GitHub è il metodo). */
  squash: boolean
  deleteBranch: boolean
}

export interface NewPullRequest {
  /** Remote di destinazione. */
  remote: string
  base: string
  /** Remote del branch con le modifiche: lo stesso o un fork sullo stesso server. */
  headRemote: string
  head: string
  title: string
  body: string
  draft: boolean
}

/** Commit e file di una PR, letti con git dopo averne scaricato gli oggetti. */
export interface PullRequestChanges {
  commits: Commit[]
  files: FileChange[]
}

export type FlowType = 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support'

/** Configurazione di git flow, nelle chiavi gitflow.* di git-flow-avh. */
export interface FlowConfig {
  /** Branch di produzione (gitflow.branch.master). */
  main: string
  develop: string
  prefixes: Record<FlowType, string>
  /** Prefisso dei tag di versione, es. "v"; può essere vuoto. */
  versionTag: string
  /** Branch → la base da cui è partito (gitflow.branch.<branch>.base). */
  bases: Record<string, string>
}

/** Cosa farà il Finish di un branch, per il riepilogo del dialog. */
export interface FlowFinishInfo {
  branch: string
  type: Exclude<FlowType, 'support'>
  /** Nome o versione, senza prefisso. */
  name: string
  /** Destinazioni in ordine; merged: contengono già il branch; upstream: es. origin/main. */
  targets: { branch: string; merged: boolean; upstream: string | null; remote: string | null }[]
  /** Tag di release e hotfix; exists: c'è già. */
  tag: { name: string; exists: boolean } | null
  /** Remote su cui c'è anche il branch; null se è solo locale. */
  remote: string | null
}
