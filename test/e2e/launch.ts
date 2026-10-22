import '../setup-env'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const tempUserData = (): string => mkdtempSync(join(tmpdir(), 'merlino-ud-'))

/** Avvia Merlino con una cartella dati temporanea. Con MERLINO_EXECUTABLE prova l'app impacchettata invece di out/. */
export async function launch(
  args: string[] = [],
  userData = tempUserData(),
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const executablePath = process.env.MERLINO_EXECUTABLE
  const app = await electron.launch({
    executablePath,
    args: executablePath ? args : ['.', ...args],
    // MERLINO_E2E: finestra nascosta, l'app non va in primo piano mentre si lavora al computer
    env: { ...process.env, MERLINO_USER_DATA: userData, MERLINO_E2E: '1', ...env } as Record<string, string>,
  })
  // Se la finestra non arriva, l'errore riporta cosa ha scritto il processo (avvii bloccati rari, finora senza causa nota)
  let output = ''
  const collect = (d: Buffer) => {
    output = (output + d.toString()).slice(-4000)
  }
  app.process().stdout?.on('data', collect)
  app.process().stderr?.on('data', collect)
  const page = await app.firstWindow().catch((e: Error) => {
    throw new Error(`${e.message}\nOutput di Electron:\n${output || '(vuoto)'}`)
  })
  return { app, page, userData }
}
