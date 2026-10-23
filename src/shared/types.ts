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
}

export interface GitErrorInfo {
  args: string[]
  exitCode: number | null
  stderr: string
  /** Prima riga utile di stderr, da mostrare all'utente. */
  message: string
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

export interface AppSettings {
  gitPath: string
  openRepos: string[]
  activeRepo: string | null
  recentRepos: string[]
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
  | { kind: 'rebaseInteractive'; sha: string; steps: RebaseStep[] }

export type MenuItem = { id: string; label: string; enabled?: boolean } | { separator: true }
