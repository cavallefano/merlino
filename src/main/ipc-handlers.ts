import { BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions, nativeImage, nativeTheme, shell } from 'electron'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { Channels, type Result } from '../shared/ipc'
import type { CommandLogEntry, GitErrorInfo, PatchMode, Preferences, RepoInfo, WorkingArea } from '../shared/types'
import { AutoFetch } from './auto-fetch'
import { dragFile } from './drag-file'
import { clone, fetch as gitFetch, rebaseRange, runCommand } from './git/branches'
import { checkGit } from './git/check'
import { readCommitDetail } from './git/commit'
import { readGitCommitTemplate } from './git/commit-template'
import { readCommitFileDiff } from './git/diff'
import { finishInfo, readFlowConfig } from './git/flow'
import { readGlobalConfig, setGlobalConfig } from './git/global-config'
import { branchSummary, checkoutPullRequest, fetchPullRequest, readPullRequestChanges, readPullRequestFileDiff } from './git/pull-request'
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
import { addAccount, removeAccount, setRemoteAccount, type TokenStore } from './hosting/accounts'
import { type Fetch, HostingError } from './hosting/http'
import { connect, type Connection, createProvider, type HostingDeps, projectOf, pullRequestRemotes } from './hosting/pull-requests'
import { editorLaunch, startApp, terminalLaunch } from './open-app'
import { setLanguage, t } from './i18n'
import { buildMenu } from './menu'
import { RepoSession } from './repo-session'
import { addRecent, type SettingsStore } from './settings'
import {
  accountId,
  commitTemplates as validateTemplates,
  diffOptions,
  fileRequest,
  gitConfigEntry,
  gitUrl,
  HOSTING_SERVICES,
  int,
  limitedText,
  list,
  MAX_BODY,
  mergeOptions,
  newPullRequest,
  oneOf,
  PR_FILTERS,
  preferences as validatePreferences,
  prNumber,
  pullRequestRefs,
  refName,
  relPath,
  repoCommand,
  revision,
  server,
  sha,
  stashRef,
  str,
  text,
  token,
  withOldPath,
} from './validate'

const MAX_LOG = 500
const MAX_PAGE = 5000
// Icona del drag nativo (macOS la vuole non vuota): un quadrato grigio 16×16
const DRAG_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR4nGPomjzvPyWYYdSAUQNGDRguBgAAche6HxUly5oAAAAASUVORK5CYII=',
)

function fail(e: unknown): { ok: false; error: GitErrorInfo } {
  if (e instanceof GitError) return { ok: false, error: e.info }
  const message = e instanceof Error ? e.message : String(e)
  // Il renderer propone "Aggiorna token…"
  const code = e instanceof HostingError && e.kind === 'auth' ? { code: 'auth' as const } : {}
  return { ok: false, error: { args: [], exitCode: null, stderr: message, message, ...code } }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function registerIpc(
  win: () => BrowserWindow | null,
  settings: SettingsStore,
  initialPath: string | null,
  hosting: { tokens: TokenStore; fetch: Fetch },
) {
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
  // Per la config globale: una cartella qualsiasi va bene, e le scritture vanno in coda fra loro
  const globalRunner = new GitRunner(gitPath, homedir(), onLog)

  async function open(path: string): Promise<Result<RepoInfo>> {
    try {
      if (!isDirectory(path)) throw new Error(t('error.folderNotFound', { path }))
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
      if (!session) throw new Error(t('error.repoNotOpen'))
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

  // In silenzio: nessun avanzamento al renderer, gli errori (es. credenziali) restano nel log dei comandi
  const autoFetch = new AutoFetch(() => {
    const prune = settings.get().preferences.fetchPrune
    for (const s of sessions.values()) gitFetch(s.runner, () => {}, prune).then(() => send(Channels.fetched, s.root), () => {})
  })

  /** Effetti delle preferenze nel main: il tema (che segue anche il CSS con prefers-color-scheme) e il fetch automatico. */
  function applyPreferences(p: Preferences): void {
    nativeTheme.themeSource = p.theme
    autoFetch.schedule(p.autoFetchMinutes)
    // La barra dei menu si ricostruisce nella lingua scelta (costa poco, e le preferenze cambiano di rado)
    setLanguage(p.language)
    buildMenu((id) => send(Channels.menuAction, id))
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
  ipcMain.handle(Channels.pickRepoFolder, async (_e, defaultPath: unknown) => {
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      ...(typeof defaultPath === 'string' && isAbsolute(defaultPath) ? { defaultPath } : {}),
    }
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle(Channels.saveCommitTemplates, (_e, value: unknown) =>
    attempt(() => {
      const commitTemplates = validateTemplates(value)
      const ids = new Set(commitTemplates.map((x) => x.id))
      // I predefiniti dei template eliminati se ne vanno con loro
      const defaultTemplates = Object.fromEntries(Object.entries(settings.get().defaultTemplates).filter(([, id]) => ids.has(id)))
      return settings.update({ commitTemplates, defaultTemplates })
    }),
  )
  ipcMain.handle(Channels.setDefaultTemplate, (_e, root: unknown, id: unknown) =>
    attempt(() => {
      const repo = str(root, 'root')
      const { commitTemplates, defaultTemplates } = settings.get()
      if (id === null) {
        delete defaultTemplates[repo]
      } else {
        const templateId = str(id, 'id')
        if (!commitTemplates.some((x) => x.id === templateId)) throw new TypeError(t('error.templateNotFound'))
        defaultTemplates[repo] = templateId
      }
      return settings.update({ defaultTemplates })
    }),
  )
  ipcMain.handle(Channels.gitCommitTemplate, (_e, root: unknown) => withSession(root, (s) => readGitCommitTemplate(s.runner)))
  ipcMain.handle(Channels.gitGlobalConfig, () => attempt(() => readGlobalConfig(globalRunner)))
  ipcMain.handle(Channels.setGitGlobalConfig, (_e, key: unknown, value: unknown) =>
    attempt(() => {
      const [k, v] = gitConfigEntry(key, value)
      return setGlobalConfig(globalRunner, k, v)
    }),
  )
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
      if (!m.trim()) throw new TypeError(t('error.emptyCommitMessage'))
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
    withSession(root, async (s) => {
      const c = repoCommand(command)
      await runCommand(s.runner, c, progress(s.root), settings.get().preferences.fetchPrune)
      // Dopo un fetch le pull request possono essere cambiate
      if (c.kind === 'fetch' || c.kind === 'pull') send(Channels.fetched, s.root)
    }),
  )
  ipcMain.handle(Channels.rebaseRange, (_e, root: unknown, commit: unknown) => withSession(root, (s) => rebaseRange(s.runner, sha(commit))))
  ipcMain.handle(Channels.clone, async (_e, url: unknown, parent: unknown) => {
    try {
      const dir = str(parent, t('field.folder'))
      if (!isAbsolute(dir) || !isDirectory(dir)) throw new Error(t('error.folderNotFound', { path: dir }))
      return { ok: true, value: await clone(gitPath, gitUrl(url), dir, onLog, progress(dir)) }
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(Channels.openInEditor, (_e, root: unknown, path: unknown) =>
    withSession(root, async (s) => {
      const file = join(s.root, relPath(path))
      const editor = settings.get().preferences.editorApp
      if (editor) return startApp(editorLaunch(process.platform, editor, file))
      const error = await shell.openPath(file)
      if (error) throw new Error(error)
    }),
  )
  ipcMain.handle(Channels.openInTerminal, (_e, root: unknown) =>
    withSession(root, (s) => startApp(terminalLaunch(process.platform, settings.get().preferences.terminalApp, s.root))),
  )
  ipcMain.on(Channels.startDrag, (e, root: unknown, item: unknown) => {
    try {
      const session = sessions.get(str(root, 'root'))
      if (!session) throw new Error(t('error.repoNotOpen'))
      const v = (typeof item === 'object' && item !== null ? item : {}) as { path?: unknown; sha?: unknown }
      const target = v.sha === undefined ? { path: relPath(v.path) } : { path: relPath(v.path), sha: sha(v.sha) }
      e.sender.startDrag({ file: dragFile(gitPath(), session.root, target), icon: DRAG_ICON })
      e.returnValue = { ok: true, value: undefined }
    } catch (err) {
      e.returnValue = fail(err)
    }
  })
  ipcMain.handle(Channels.pickApp, async () => {
    const options: Electron.OpenDialogOptions =
      process.platform === 'darwin'
        ? { defaultPath: '/Applications', properties: ['openFile'], filters: [{ name: t('dialog.applications'), extensions: ['app'] }] }
        : process.platform === 'win32'
          ? { properties: ['openFile'], filters: [{ name: t('dialog.programs'), extensions: ['exe'] }] }
          : { properties: ['openFile'] }
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
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

  // --- Account e pull request: il token resta qui, il renderer passa solo root, remote, numeri, SHA e testi ---
  const deps: HostingDeps = { settings, tokens: hosting.tokens, fetch: hosting.fetch, log: onLog }
  /** Un'operazione sul servizio del remote, con il repo aperto. */
  const onRemote = <T>(root: unknown, remote: unknown, fn: (c: Connection, s: RepoSession) => Promise<T>) =>
    withSession(root, async (s) => fn(await connect(deps, s.runner, refName(remote)), s))

  ipcMain.handle(Channels.addAccount, (_e, service: unknown, host: unknown, secret: unknown) =>
    attempt(() => {
      const draft = { service: oneOf(service, HOSTING_SERVICES, 'service'), host: server(host) }
      const value = token(secret)
      return addAccount(settings, hosting.tokens, draft, value, () => createProvider(deps, { ...draft, username: '' }, value, null).verify())
    }),
  )
  ipcMain.handle(Channels.removeAccount, (_e, id: unknown) => attempt(() => removeAccount(settings, hosting.tokens, accountId(id))))
  ipcMain.handle(Channels.setRemoteAccount, (_e, root: unknown, remote: unknown, id: unknown) =>
    attempt(() => setRemoteAccount(settings, str(root, 'root'), refName(remote), id === null ? null : accountId(id))),
  )
  ipcMain.handle(Channels.prRemotes, (_e, root: unknown) => withSession(root, (s) => pullRequestRemotes(deps, s.runner)))
  ipcMain.handle(Channels.prRepo, (_e, root: unknown, remote: unknown) => onRemote(root, remote, (c) => c.provider.repo(c.project)))
  ipcMain.handle(Channels.prList, (_e, root: unknown, remote: unknown, filter: unknown) =>
    onRemote(root, remote, (c) => c.provider.list(c.project, oneOf(filter, PR_FILTERS, 'filter'))),
  )
  ipcMain.handle(Channels.prDetail, (_e, root: unknown, remote: unknown, n: unknown) => onRemote(root, remote, (c) => c.provider.detail(c.project, prNumber(n))))
  ipcMain.handle(Channels.prChecks, (_e, root: unknown, remote: unknown, commit: unknown) =>
    onRemote(root, remote, (c) => c.provider.checks(c.project, sha(commit))),
  )
  ipcMain.handle(Channels.prChanges, (_e, root: unknown, remote: unknown, n: unknown, refs: unknown) =>
    onRemote(root, remote, async (c, s) => {
      const { base, baseSha, headSha } = pullRequestRefs(refs)
      await fetchPullRequest(s.runner, c.remote, c.provider.pullRef(prNumber(n)), base, baseSha, headSha)
      return readPullRequestChanges(s.runner, baseSha, headSha)
    }),
  )
  ipcMain.handle(Channels.prFileDiff, (_e, root: unknown, base: unknown, head: unknown, file: unknown, options: unknown) =>
    withSession(root, (s) => readPullRequestFileDiff(s.runner, sha(base), sha(head), fileRequest(file), diffOptions(options))),
  )
  ipcMain.handle(Channels.prComment, (_e, root: unknown, remote: unknown, n: unknown, body: unknown) =>
    onRemote(root, remote, (c) => c.provider.comment(c.project, prNumber(n), limitedText(body, t('field.comment'), MAX_BODY, true))),
  )
  ipcMain.handle(Channels.prMerge, (_e, root: unknown, remote: unknown, n: unknown, options: unknown) =>
    onRemote(root, remote, (c) => c.provider.merge(c.project, prNumber(n), mergeOptions(options))),
  )
  ipcMain.handle(Channels.prSetState, (_e, root: unknown, remote: unknown, n: unknown, state: unknown) =>
    onRemote(root, remote, (c) => c.provider.setState(c.project, prNumber(n), oneOf(state, ['open', 'closed'] as const, 'state'))),
  )
  ipcMain.handle(Channels.prCreate, (_e, root: unknown, input: unknown) =>
    withSession(root, async (s) => {
      const pr = newPullRequest(input)
      const c = await connect(deps, s.runner, pr.remote)
      const head = await projectOf(s.runner, pr.headRemote)
      if (head.host !== c.host) throw new Error(t('hosting.differentServer'))
      return c.provider.create(c.project, head.path, pr)
    }),
  )
  ipcMain.handle(Channels.prCheckout, (_e, root: unknown, remote: unknown, n: unknown, branch: unknown) =>
    onRemote(root, remote, (c, s) => {
      const number = prNumber(n)
      return checkoutPullRequest(s.runner, c.remote, c.provider.pullRef(number), number, branch === null ? null : refName(branch))
    }),
  )
  ipcMain.handle(Channels.prBranchSummary, (_e, root: unknown, base: unknown, head: unknown) =>
    withSession(root, (s) => branchSummary(s.runner, revision(base), revision(head))),
  )

  // --- Git flow ---
  ipcMain.handle(Channels.flowConfig, (_e, root: unknown) => withSession(root, (s) => readFlowConfig(s.runner)))
  ipcMain.handle(Channels.flowFinishInfo, (_e, root: unknown, branch: unknown) => withSession(root, (s) => finishInfo(s.runner, refName(branch))))

  return {
    async disposeAll(): Promise<void> {
      autoFetch.stop()
      await Promise.all([...sessions.values()].map((s) => s.dispose()))
      sessions.clear()
    },
  }
}
