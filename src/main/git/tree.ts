import type { FileContent, TreeEntry } from '../../shared/types'
import { DIFF_MAX_CHARS, DIFF_MAX_LINES } from './diff'
import type { GitRunner } from './runner'

const KINDS: Record<string, TreeEntry['kind']> = { tree: 'folder', blob: 'file', commit: 'submodule' }

/** git ls-tree -z [-l]: "<modo> <tipo> <oggetto>[ <dimensione>]\t<percorso>\0". */
function records(out: string) {
  return out
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf('\t')
      const [, type = '', object = '', size = '-'] = record.slice(0, tab).split(/ +/)
      return { type, object, size, path: record.slice(tab + 1) }
    })
}

/** Le voci di una cartella: prima le cartelle, poi file e submodule, in ordine alfabetico. */
export function parseTree(out: string): TreeEntry[] {
  return records(out)
    .map((r): TreeEntry => ({ name: r.path.slice(r.path.lastIndexOf('/') + 1), path: r.path, kind: KINDS[r.type] ?? 'file' }))
    .sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name))
}

/** Le voci di una cartella a un commit, dir '' per la radice; una cartella che lì non c'è non ha voci. */
export async function readTree(runner: GitRunner, sha: string, dir: string): Promise<TreeEntry[]> {
  return parseTree((await runner.run(['ls-tree', '-z', sha, ...(dir ? ['--', `${dir}/`] : [])])).stdout)
}

/** Il contenuto di un file a un commit; null se lì non c'è. Binario e troppo grande come nel diff. */
export async function readFileContent(runner: GitRunner, sha: string, path: string, force: boolean): Promise<FileContent | null> {
  const [entry] = records((await runner.run(['ls-tree', '-z', '-l', sha, '--', path])).stdout)
  if (!entry || entry.path !== path || entry.type === 'tree') return null
  if (entry.type === 'commit') return { binary: false, tooLarge: false, text: `Subproject commit ${entry.object}` }
  if (!force && Number(entry.size) > DIFF_MAX_CHARS) return { binary: false, tooLarge: true, text: '' }
  const text = (await runner.run(['cat-file', 'blob', entry.object])).stdout
  if (text.slice(0, 8000).includes('\0')) return { binary: true, tooLarge: false, text: '' }
  if (!force && text.split('\n').length > DIFF_MAX_LINES) return { binary: false, tooLarge: true, text: '' }
  return { binary: false, tooLarge: false, text }
}
