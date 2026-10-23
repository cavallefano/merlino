import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { t } from './i18n'

const MAX_BYTES = 50 * 1024 * 1024

/**
 * Il file da passare a startDrag. Modifiche: il file vero (fuori dall'app Electron consente solo la copia).
 * Commit: il contenuto in quel commit, scritto in una cartella temporanea che resta finché il sistema non la pulisce
 * (serve all'app di destinazione anche dopo il rilascio). Sincrono: il drag nativo deve partire dentro il dragstart.
 */
export function dragFile(gitPath: string, root: string, item: { path: string; sha?: string }): string {
  if (!item.sha) {
    const file = join(root, item.path)
    if (!existsSync(file)) throw new Error(t('error.fileNotInWorkingTree', { path: item.path }))
    return file
  }
  const content = execFileSync(gitPath, ['cat-file', 'blob', `${item.sha}:${item.path}`], {
    cwd: root,
    maxBuffer: MAX_BYTES,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const file = join(mkdtempSync(join(tmpdir(), 'merlino-drag-')), basename(item.path))
  writeFileSync(file, content)
  return file
}
