import { spawn } from 'node:child_process'
import type { CommandLogEntry, GitErrorInfo } from '../../shared/types'
import { explain } from './errors'

export interface RunOptions {
  /** L'operazione scrive nel repo: va in coda, una sola alla volta per repo. */
  write?: boolean
  /** Exit code considerati successo; default [0]. */
  okCodes?: number[]
  stdin?: string
  env?: Record<string, string>
  /** Ultima riga di avanzamento su stderr (fetch/pull/push con --progress). */
  onProgress?: (line: string) => void
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class GitError extends Error {
  constructor(readonly info: GitErrorInfo) {
    super(info.message)
    this.name = 'GitError'
  }
}

let nextLogId = 1

/** Esegue git in una cartella. Le letture vanno in parallelo, le scritture in coda (niente conflitti su index.lock). */
export class GitRunner {
  private writes: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly gitPath: () => string,
    readonly cwd: string,
    private readonly log: (entry: CommandLogEntry) => void = () => {},
  ) {}

  run(args: string[], opts: RunOptions = {}): Promise<RunResult> {
    if (!opts.write) return this.exec(args, opts)
    const result = this.writes.then(() => this.exec(args, opts))
    this.writes = result.catch(() => undefined)
    return result
  }

  private exec(args: string[], opts: RunOptions): Promise<RunResult> {
    const okCodes = opts.okCodes ?? [0]
    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
      const child = spawn(this.gitPath(), args, {
        cwd: this.cwd,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // senza credenziali fallisce subito invece di restare in attesa
          LC_ALL: 'C', // messaggi sempre in inglese, quindi riconoscibili
          GIT_OPTIONAL_LOCKS: '0', // status non riscrive l'index: niente ciclo col watcher
          GIT_EDITOR: 'true', // nessun editor resta aperto in attesa (merge, --continue, squash)
          ...opts.env,
        },
      })
      const out: Buffer[] = []
      const err: Buffer[] = []
      let done = false
      const finish = (exitCode: number | null, spawnError?: Error) => {
        if (done) return
        done = true
        const stdout = Buffer.concat(out).toString('utf8')
        const errText = spawnError ? spawnError.message : Buffer.concat(err).toString('utf8')
        const ok = exitCode !== null && okCodes.includes(exitCode)
        // Alcuni errori (es. i conflitti di merge) git li scrive su stdout
        const stderr = ok || errText.trim() ? errText : stdout
        this.log({ id: nextLogId++, repo: this.cwd, args, startedAt, durationMs: Date.now() - startedAt, exitCode, ok, stderr })
        if (exitCode !== null && ok) {
          resolve({ stdout, stderr, exitCode })
        } else {
          const message = explain(errText, stdout) ?? `git ${args[0] ?? ''} è fallito (exit ${exitCode})`
          reject(new GitError({ args, exitCode, stderr, message }))
        }
      }
      child.stdout.on('data', (d: Buffer) => out.push(d))
      child.stderr.on('data', (d: Buffer) => {
        err.push(d)
        const lines = d.toString('utf8').split(/[\r\n]+/).filter((l) => l.trim())
        const last = lines[lines.length - 1]
        if (opts.onProgress && last) opts.onProgress(last.trim())
      })
      child.stdin.on('error', () => {}) // EPIPE se il processo esce prima di leggere stdin
      child.on('error', (e) => finish(null, e))
      child.on('close', (code) => finish(code))
      child.stdin.end(opts.stdin ?? '')
    })
  }
}
