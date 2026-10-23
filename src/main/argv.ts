import { resolve } from 'node:path'

/** Cartella passata da riga di comando (`merlino <cartella>`), ignorando i flag e il percorso dell'app stessa. */
export function pathFromArgv(
  argv: string[],
  cwd: string,
  appPath: string,
  isDir: (p: string) => boolean,
): string | null {
  for (const arg of argv.slice(1).reverse()) {
    if (arg.startsWith('-')) continue
    const path = resolve(cwd, arg)
    if (path !== resolve(appPath) && isDir(path)) return path
  }
  return null
}
