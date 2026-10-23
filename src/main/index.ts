import { app, BrowserWindow, shell } from 'electron'
import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Channels } from '../shared/ipc'
import { pathFromArgv } from './argv'
import { registerIpc } from './ipc-handlers'
import { buildMenu } from './menu'
import { SettingsStore } from './settings'

if (process.env.MERLINO_USER_DATA) app.setPath('userData', process.env.MERLINO_USER_DATA)

// Gli errori non gestiti finiscono in un file di log e l'app resta aperta
const logFile = join(app.getPath('userData'), 'logs', 'main.log')
function logError(err: unknown): void {
  mkdirSync(dirname(logFile), { recursive: true })
  appendFileSync(logFile, `${new Date().toISOString()} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
}
process.on('uncaughtException', logError)
process.on('unhandledRejection', logError)

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
const argvPath = (argv: string[], cwd: string) => pathFromArgv(argv, cwd, app.getAppPath(), isDir)

let win: BrowserWindow | null = null
/** Test E2E: finestra mai mostrata e app mai in primo piano, così chi usa il computer non perde il focus. */
const hidden = process.env.MERLINO_E2E === '1'

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Merlino',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Nascosta continua a disegnare (grafo, diff) come se fosse visibile
      backgroundThrottling: !hidden,
    },
  })
  w.once('ready-to-show', () => {
    if (!hidden) w.show()
  })
  w.on('closed', () => {
    win = null
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Una cartella trascinata fuori dalla zona di drop farebbe navigare la finestra verso file://
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
    const path = argvPath(argv, cwd)
    if (path) win.webContents.send(Channels.openPath, path)
  })

  void app.whenReady().then(() => {
    // macOS: senza icona nel Dock l'app non si attiva e non ruba il focus
    if (hidden) app.dock?.hide()
    const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
    const ipc = registerIpc(() => win, settings, argvPath(process.argv, process.cwd()))
    buildMenu((id) => win?.webContents.send(Channels.menuAction, id))
    win = createWindow()
    app.on('before-quit', () => void ipc.disposeAll())
  })

  app.on('window-all-closed', () => app.quit())
}
