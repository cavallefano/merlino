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
