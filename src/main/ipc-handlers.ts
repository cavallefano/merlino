import { BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions, nativeTheme, shell } from 'electron'
import { statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { Channels, type Result } from '../shared/ipc'
import type { CommandLogEntry, GitErrorInfo, PatchMode, Preferences, RepoInfo, WorkingArea } from '../shared/types'
import { clone, rebaseRange, runCommand } from './git/branches'
import { checkGit } from './git/check'
import { readCommitDetail } from './git/commit'
import { readCommitFileDiff } from './git/diff'
import { readRefs } from './git/refs'
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
import {
  diffOptions,
  fileRequest,
  gitUrl,
  int,
  list,
  oneOf,
  preferences as validatePreferences,
  relPath,
  repoCommand,
  sha,
  stashRef,
  str,
  text,
  withOldPath,
} from './validate'

const MAX_LOG = 500
const MAX_PAGE = 5000

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

  async function attempt<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
    try {
      return { ok: true, value: await fn() }
    } catch (e) {
      return fail(e)
    }
  }

  /** Effetti delle preferenze nel main: il tema (che segue anche il CSS con prefers-color-scheme). */
  function applyPreferences(p: Preferences): void {
    nativeTheme.themeSource = p.theme
  }
  applyPreferences(settings.get().preferences)

  ipcMain.handle(Channels.getSettings, () => settings.get())
  ipcMain.handle(Channels.updatePreferences, (_e, patch: unknown) =>
    attempt(() => {
      const updated = settings.update({ preferences: validatePreferences(settings.get().preferences, patch) })
      applyPreferences(updated.preferences)
      return updated
    }),
  )
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
  ipcMain.handle(Channels.historyFileCounts, (_e, root: unknown, start: unknown, count: unknown) =>
    withSession(root, (s) => s.history.fileCounts(int(start, 'start', Number.MAX_SAFE_INTEGER), int(count, 'count', MAX_PAGE))),
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
  const progress = (root: string) => (line: string) => send(Channels.progress, { root, line })
  ipcMain.handle(Channels.refs, (_e, root: unknown) => withSession(root, (s) => readRefs(s.runner)))
  ipcMain.handle(Channels.command, (_e, root: unknown, command: unknown) =>
    withSession(root, (s) => runCommand(s.runner, repoCommand(command), progress(s.root))),
  )
  ipcMain.handle(Channels.rebaseRange, (_e, root: unknown, commit: unknown) => withSession(root, (s) => rebaseRange(s.runner, sha(commit))))
  ipcMain.handle(Channels.clone, async (_e, url: unknown, parent: unknown) => {
    try {
      const dir = str(parent, 'cartella')
      if (!isAbsolute(dir) || !isDirectory(dir)) throw new Error(`Cartella non trovata: ${dir}`)
      return { ok: true, value: await clone(gitPath, gitUrl(url), dir, onLog, progress(dir)) }
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(Channels.openInEditor, (_e, root: unknown, path: unknown) =>
    withSession(root, async (s) => {
      const error = await shell.openPath(join(s.root, relPath(path)))
      if (error) throw new Error(error)
    }),
  )
  ipcMain.handle(Channels.contextMenu, (e, items: unknown) => {
    const entries = Array.isArray(items) ? items.slice(0, 60) : []
    return new Promise<string | null>((resolve) => {
      let chosen: string | null = null
      const template: MenuItemConstructorOptions[] = entries.map((raw) => {
        const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
        if (item.separator === true) return { type: 'separator' }
        return { label: String(item.label ?? ''), enabled: item.enabled !== false, click: () => (chosen = String(item.id ?? '')) }
      })
      const window = BrowserWindow.fromWebContents(e.sender) ?? undefined
      // La callback arriva alla chiusura del menu; il clic, se c'è, è già stato gestito
      Menu.buildFromTemplate(template).popup({ window, callback: () => setTimeout(() => resolve(chosen), 0) })
    })
  })
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
