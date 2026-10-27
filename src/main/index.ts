import { app, BrowserWindow, net, safeStorage, shell } from 'electron'
import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Channels } from '../shared/ipc'
import { pathFromArgv } from './argv'
import { type Crypto, TokenStore } from './hosting/accounts'
import { registerIpc } from './ipc-handlers'
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
// Test E2E: niente portachiavi, che su macOS chiederebbe il permesso con un dialog del sistema
const PLAIN: Crypto = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() }

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Merlino',
    // macOS: la toolbar fa da barra del titolo e i semafori stanno dentro, come in Tower.
    // y centra i semafori nella toolbar alta 52px (AppToolbar.vue): se cambia l'altezza va ritoccata
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 18, y: 19 } } : {}),
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
    const tokens = new TokenStore(join(app.getPath('userData'), 'tokens.json'), hidden ? PLAIN : safeStorage)
    // net.fetch usa la rete di Chromium: proxy e certificati del sistema
    const ipc = registerIpc(() => win, settings, argvPath(process.argv, process.cwd()), { tokens, fetch: (url, init) => net.fetch(url, init) })
    win = createWindow()
    app.on('before-quit', () => void ipc.disposeAll())
  })

  app.on('window-all-closed', () => app.quit())
}
