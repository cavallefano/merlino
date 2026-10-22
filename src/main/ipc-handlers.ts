import { type BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { Channels, type Result } from '../shared/ipc'
import type { CommandLogEntry, DiffOptions, GitErrorInfo, PatchMode, RepoInfo, WorkingArea } from '../shared/types'
import { checkGit } from './git/check'
import { readCommitDetail } from './git/commit'
import { type DiffRequest, readCommitFileDiff } from './git/diff'
import { readRepoInfo } from './git/repo-info'
import { GitError, GitRunner } from './git/runner'
import { readStatus } from './git/status'
import {
  addToGitignore,
  applyPatch,
  commit,
  discardFiles,
  lastCommitMessage,
  readStashes,
  readWorkingDiff,
  stageAll,
  stageFiles,
  stashAction,
  stashPush,
  unstageAll,
  unstageFiles,
} from './git/working'
import { RepoSession } from './repo-session'
import { addRecent, type SettingsStore } from './settings'

const MAX_LOG = 500
const MAX_PAGE = 5000

/** Gli argomenti arrivano dal renderer: si validano qui. */
function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${name} deve essere una stringa non vuota`)
  return value
}

/** Uno SHA che non può essere scambiato per un'opzione di git. */
function sha(value: unknown): string {
  const s = str(value, 'sha')
  if (!/^[0-9a-f]{4,64}$/i.test(s)) throw new TypeError('sha non valido')
  return s
}

function int(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new TypeError(`${name} non valido`)
  return value
}

function fileRequest(value: unknown): DiffRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as { path?: unknown; oldPath?: unknown }
  const path = str(v.path, 'path')
  return v.oldPath === undefined ? { path } : { path, oldPath: str(v.oldPath, 'oldPath') }
}

function diffOptions(value: unknown): DiffOptions {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return { ignoreWhitespace: v.ignoreWhitespace === true, force: v.force === true }
}

const MAX_TEXT = 50 * 1024 * 1024

/** Percorso relativo dentro il repo. */
function relPath(value: unknown): string {
  const p = str(value, 'path')
  if (isAbsolute(p) || p.split(/[\\/]/).includes('..')) throw new TypeError(`percorso non valido: ${p}`)
  return p
}

function list<T>(value: unknown, item: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) throw new TypeError('elenco non valido')
  return value.map(item)
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new TypeError(`${name} non valido`)
  return value
}

function oneOf<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (!options.includes(value as T)) throw new TypeError(`${name} non valido`)
  return value as T
}

function stashRef(value: unknown): string {
  const ref = str(value, 'ref')
  if (!/^stash@\{\d+\}$/.test(ref)) throw new TypeError('stash non valido')
  return ref
}

/** Il file e, per le rinomine, anche il vecchio percorso. */
function withOldPath(value: unknown): string[] {
  const f = fileRequest(value)
  return f.oldPath ? [relPath(f.oldPath), relPath(f.path)] : [relPath(f.path)]
}

function fail(e: unknown): { ok: false; error: GitErrorInfo } {
  if (e instanceof GitError) return { ok: false, error: e.info }
  const message = e instanceof Error ? e.message : String(e)
  return { ok: false, error: { args: [], exitCode: null, stderr: message, message } }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function registerIpc(win: () => BrowserWindow | null, settings: SettingsStore, initialPath: string | null) {
  const sessions = new Map<string, RepoSession>()
  const log: CommandLogEntry[] = []
  let pendingPath = initialPath
  const gitPath = () => settings.get().gitPath
  const send = (channel: string, payload: unknown) => win()?.webContents.send(channel, payload)
  const onLog = (entry: CommandLogEntry) => {
    log.push(entry)
    if (log.length > MAX_LOG) log.shift()
    send(Channels.commandLogged, entry)
  }

  async function open(path: string): Promise<Result<RepoInfo>> {
    try {
      if (!isDirectory(path)) throw new Error(`Cartella non trovata: ${path}`)
      const info = await readRepoInfo(new GitRunner(gitPath, path, onLog))
      if (!sessions.has(info.root)) {
        const session = new RepoSession(info.root, gitPath, onLog)
        sessions.set(info.root, session)
        // Senza watcher il repo funziona lo stesso: si aggiorna al ritorno del focus
        await session.start(() => send(Channels.repoChanged, info.root)).catch((e) => console.error('watcher', info.root, e))
      }
      const s = settings.get()
      settings.update({
        openRepos: s.openRepos.includes(info.root) ? s.openRepos : [...s.openRepos, info.root],
        recentRepos: addRecent(s.recentRepos, info.root),
      })
      return { ok: true, value: info }
    } catch (e) {
      return fail(e)
    }
  }

  async function withSession<T>(root: unknown, fn: (session: RepoSession) => Promise<T> | T): Promise<Result<T>> {
    try {
      const session = sessions.get(str(root, 'root'))
      if (!session) throw new Error('Repository non aperto')
      return { ok: true, value: await fn(session) }
    } catch (e) {
      return fail(e)
    }
  }

  ipcMain.handle(Channels.getSettings, () => settings.get())
  ipcMain.handle(Channels.checkGit, () => checkGit(gitPath()))
  ipcMain.handle(Channels.setGitPath, (_e, path: unknown) => {
    settings.update({ gitPath: str(path, 'path') })
    return checkGit(gitPath())
  })
  ipcMain.handle(Channels.pickRepoFolder, async () => {
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle(Channels.takeInitialPath, () => {
    const path = pendingPath
    pendingPath = null
    return path
  })
  ipcMain.handle(Channels.openRepo, (_e, path: unknown) => open(str(path, 'path')))
  ipcMain.handle(Channels.initRepo, async (_e, p: unknown) => {
    const path = str(p, 'path')
    try {
      await new GitRunner(gitPath, path, onLog).run(['init'], { write: true })
    } catch (e) {
      return fail(e)
    }
    return open(path)
  })
  ipcMain.handle(Channels.closeRepo, async (_e, r: unknown) => {
    const root = str(r, 'root')
    await sessions.get(root)?.dispose()
    sessions.delete(root)
    const s = settings.get()
    settings.update({
      openRepos: s.openRepos.filter((x) => x !== root),
      activeRepo: s.activeRepo === root ? null : s.activeRepo,
    })
  })
  ipcMain.handle(Channels.setActiveRepo, (_e, r: unknown) => {
    settings.update({ activeRepo: r === null ? null : str(r, 'root') })
  })
  ipcMain.handle(Channels.repoInfo, (_e, root: unknown) => withSession(root, (s) => readRepoInfo(s.runner)))
  ipcMain.handle(Channels.getCommandLog, () => log)
  ipcMain.handle(Channels.historyLoad, (_e, root: unknown, query: unknown) =>
    withSession(root, (s) => s.history.load(typeof query === 'string' ? query.slice(0, 1000) : '')),
  )
  ipcMain.handle(Channels.historyPage, (_e, root: unknown, start: unknown, count: unknown) =>
    withSession(root, (s) => s.history.page(int(start, 'start', Number.MAX_SAFE_INTEGER), int(count, 'count', MAX_PAGE))),
  )
  ipcMain.handle(Channels.commitDetail, (_e, root: unknown, commit: unknown) =>
    withSession(root, (s) => readCommitDetail(s.runner, sha(commit))),
  )
  ipcMain.handle(Channels.workingStatus, (_e, root: unknown) => withSession(root, (s) => readStatus(s.runner)))
  ipcMain.handle(Channels.workingDiff, (_e, root: unknown, file: unknown, area: unknown, options: unknown) =>
    withSession(root, (s) => {
      const f = fileRequest(file)
      withOldPath(f)
      const where = oneOf<WorkingArea>(area, ['staged', 'unstaged', 'untracked', 'conflicted'], 'area')
      return readWorkingDiff(s.runner, f, where, diffOptions(options))
    }),
  )
  ipcMain.handle(Channels.stage, (_e, root: unknown, paths: unknown) => withSession(root, (s) => stageFiles(s.runner, list(paths, relPath))))
  ipcMain.handle(Channels.unstage, (_e, root: unknown, files: unknown) =>
    withSession(root, (s) => unstageFiles(s.runner, list(files, withOldPath).flat())),
  )
  ipcMain.handle(Channels.discard, (_e, root: unknown, files: unknown) =>
    withSession(root, (s) => {
      const items = list(files, (v) => {
        const f = (typeof v === 'object' && v !== null ? v : {}) as { path?: unknown; untracked?: unknown }
        return { path: relPath(f.path), untracked: f.untracked === true }
      })
      const tracked = items.filter((f) => !f.untracked).map((f) => f.path)
      const untracked = items.filter((f) => f.untracked).map((f) => f.path)
      return discardFiles(s.runner, tracked, untracked)
    }),
  )
  ipcMain.handle(Channels.stageAll, (_e, root: unknown) => withSession(root, (s) => stageAll(s.runner)))
  ipcMain.handle(Channels.unstageAll, (_e, root: unknown) => withSession(root, (s) => unstageAll(s.runner)))
  ipcMain.handle(Channels.applyPatch, (_e, root: unknown, patch: unknown, mode: unknown) =>
    withSession(root, (s) => applyPatch(s.runner, text(patch, 'patch'), oneOf<PatchMode>(mode, ['stage', 'unstage', 'discard'], 'mode'))),
  )
  ipcMain.handle(Channels.commit, (_e, root: unknown, message: unknown, amend: unknown) =>
    withSession(root, (s) => {
      const m = text(message, 'message')
      if (!m.trim()) throw new TypeError('Il messaggio di commit è vuoto')
      return commit(s.runner, m, amend === true)
    }),
  )
  ipcMain.handle(Channels.lastCommitMessage, (_e, root: unknown) => withSession(root, (s) => lastCommitMessage(s.runner)))
  ipcMain.handle(Channels.stashList, (_e, root: unknown) => withSession(root, (s) => readStashes(s.runner)))
  ipcMain.handle(Channels.stashPush, (_e, root: unknown, message: unknown, untracked: unknown) =>
    withSession(root, (s) => stashPush(s.runner, text(message, 'message').trim(), untracked === true)),
  )
  ipcMain.handle(Channels.stashAction, (_e, root: unknown, action: unknown, ref: unknown) =>
    withSession(root, (s) => stashAction(s.runner, oneOf(action, ['apply', 'pop', 'drop'] as const, 'action'), stashRef(ref))),
  )
  ipcMain.handle(Channels.ignorePath, (_e, root: unknown, path: unknown) =>
    withSession(root, (s) => addToGitignore(s.root, relPath(path))),
  )
  ipcMain.handle(Channels.commitFileDiff, (_e, root: unknown, commit: unknown, file: unknown, options: unknown) =>
    withSession(root, (s) => readCommitFileDiff(s.runner, sha(commit), fileRequest(file), diffOptions(options))),
  )

  return {
    async disposeAll(): Promise<void> {
      await Promise.all([...sessions.values()].map((s) => s.dispose()))
      sessions.clear()
    },
  }
}
