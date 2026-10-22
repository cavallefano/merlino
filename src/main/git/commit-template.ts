import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { GitRunner } from './runner'

/** Il commit.template di git (quello del repo vince sul globale); null se non c'è o se il file non si legge. */
export async function readGitCommitTemplate(runner: GitRunner): Promise<{ path: string; text: string } | null> {
  // exit 1: commit.template non impostato
  const out = await runner.run(['config', '--path', '--get', 'commit.template'], { okCodes: [0, 1] })
  const value = out.stdout.trim()
  if (!value) return null
  // Un percorso relativo si intende dalla radice del repo (il runner di una sessione lavora lì)
  const path = isAbsolute(value) ? value : join(runner.cwd, value)
  try {
    return { path, text: await readFile(path, 'utf8') }
  } catch {
    return null
  }
}
