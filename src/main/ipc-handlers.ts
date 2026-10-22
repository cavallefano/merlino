import { type BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { Channels, type Result } from '../shared/ipc'
import type { CommandLogEntry, DiffOptions, GitErrorInfo, RepoInfo } from '../shared/types'
import { checkGit } from './git/check'
import { readCommitDetail } from './git/commit'
import { type DiffRequest, readCommitFileDiff } from './git/diff'
import { readRepoInfo } from './git/repo-info'
import { GitError, GitRunner } from './git/runner'
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
