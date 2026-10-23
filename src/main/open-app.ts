import { spawn } from 'node:child_process'

/** Un'app esterna da avviare; wait: aspetta l'uscita (open su macOS esce subito, con l'esito). */
export interface Launch {
  command: string
  args: string[]
  cwd?: string
  wait: boolean
}

export function editorLaunch(platform: NodeJS.Platform, app: string, file: string): Launch {
  return platform === 'darwin' ? { command: 'open', args: ['-a', app, file], wait: true } : { command: app, args: [file], wait: false }
}

export function terminalLaunch(platform: NodeJS.Platform, app: string | null, root: string): Launch {
  if (platform === 'darwin') return { command: 'open', args: ['-a', app ?? 'Terminal', root], wait: true }
  if (platform === 'win32') {
    return app ? { command: app, args: [], cwd: root, wait: false } : { command: 'cmd.exe', args: ['/c', 'start', 'cmd.exe'], cwd: root, wait: false }
  }
  return { command: app ?? 'x-terminal-emulator', args: [], cwd: root, wait: false }
}

/** Avvia senza shell; rifiuta se il processo non parte (o, con wait, se esce con errore). */
export function startApp(l: Launch): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(l.command, l.args, { cwd: l.cwd, detached: !l.wait, stdio: 'ignore' })
    child.once('error', reject)
    if (l.wait) {
      child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Impossibile aprire con ${l.args[1] ?? l.command} (exit ${code})`))))
    } else {
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    }
  })
}
