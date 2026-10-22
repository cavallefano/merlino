import type { DiffOptions, FileDiff, Hunk } from '../../shared/types'
import type { GitRunner } from './runner'

export const DIFF_MAX_CHARS = 5 * 1024 * 1024
export const DIFF_MAX_LINES = 20_000

export interface DiffRequest {
  path: string
  oldPath?: string
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Diff unificato di un solo file. Le righe di un hunk si contano dall'intestazione @@,
 * così "--- x" dentro un hunk è una riga tolta e non un'intestazione.
 */
export function parseFileDiff(out: string, path: string, oldPath?: string): FileDiff {
  const diff: FileDiff = { path, ...(oldPath ? { oldPath } : {}), binary: false, tooLarge: false, hunks: [] }
  let hunk: Hunk | null = null
  let oldNo = 0
  let newNo = 0
  let oldLeft = 0
  let newLeft = 0
  for (const raw of out.split('\n')) {
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const text = raw.slice(1)
      if (raw[0] === ' ') {
        hunk.lines.push({ type: 'context', text, oldNo: oldNo++, newNo: newNo++ })
        oldLeft--
        newLeft--
      } else if (raw[0] === '-') {
        hunk.lines.push({ type: 'del', text, oldNo: oldNo++, newNo: null })
        oldLeft--
      } else if (raw[0] === '+') {
        hunk.lines.push({ type: 'add', text, oldNo: null, newNo: newNo++ })
        newLeft--
      } // "\ No newline at end of file": nessuna riga
      continue
    }
    const m = HUNK.exec(raw)
    if (m) {
      oldNo = Number(m[1])
      oldLeft = m[2] === undefined ? 1 : Number(m[2])
      newNo = Number(m[3])
      newLeft = m[4] === undefined ? 1 : Number(m[4])
      hunk = { header: raw, lines: [] }
      diff.hunks.push(hunk)
    } else if (raw.startsWith('Binary files ') || raw === 'GIT binary patch') {
      diff.binary = true
    }
  }
  return diff
}

/** Oltre i limiti restituisce solo tooLarge, a meno di force. */
export function limitedDiff(out: string, file: DiffRequest, force: boolean): FileDiff {
  if (!force && (out.length > DIFF_MAX_CHARS || countLines(out) > DIFF_MAX_LINES)) {
    return { path: file.path, ...(file.oldPath ? { oldPath: file.oldPath } : {}), binary: false, tooLarge: true, hunks: [] }
  }
  return parseFileDiff(out, file.path, file.oldPath)
}

function countLines(text: string): number {
  let n = 0
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++
  return n
}

export async function readCommitFileDiff(runner: GitRunner, sha: string, file: DiffRequest, options: DiffOptions): Promise<FileDiff> {
  const args = ['show', '--format=', '--no-color', '--no-ext-diff', '--diff-merges=first-parent', '-M', '-U3']
  if (options.ignoreWhitespace) args.push('-w')
  // Con la rinomina servono entrambi i percorsi, altrimenti git vede un file nuovo
  args.push(sha, '--', ...(file.oldPath ? [file.oldPath, file.path] : [file.path]))
  return limitedDiff((await runner.run(args)).stdout, file, options.force)
}
