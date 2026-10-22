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
    env: { ...process.env, MERLINO_USER_DATA: userData, ...env } as Record<string, string>,
  })
  return { app, page: await app.firstWindow(), userData }
}
