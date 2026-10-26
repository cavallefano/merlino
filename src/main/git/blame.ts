import type { BlameCommit, BlameResult } from '../../shared/types'
import type { GitRunner } from './runner'

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 }

/** Percorso come lo scrive git: tra virgolette in stile C se ha caratteri speciali, con l'UTF-8 in ottale (o diretto, con core.quotePath=false). */
export function unquotePath(s: string): string {
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s
  const body = s.slice(1, -1)
  const bytes: number[] = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      const ch = String.fromCodePoint(body.codePointAt(i) ?? 0)
      bytes.push(...Buffer.from(ch))
      i += ch.length - 1
    } else if (/^[0-7]{3}$/.test(body.slice(i + 1, i + 4))) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8))
      i += 3
    } else {
      const e = body[++i] ?? ''
      bytes.push(ESCAPES[e] ?? e.charCodeAt(0))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** Intestazione di una riga: SHA, riga di origine, riga nel file, righe del gruppo (solo sulla prima). */
const HEADER = /^([0-9a-f]{40,64}) \d+ (\d+)(?: \d+)?$/

/** git blame --porcelain: un'intestazione per riga, i dati del commit la prima volta che compare, poi la riga dopo un TAB. */
export function parseBlame(out: string, path: string): BlameResult {
  const commits: Record<string, BlameCommit> = {}
  const lines: BlameResult['lines'] = []
  let current: BlameCommit | null = null
  let lineNo = 0
  for (const raw of out.split('\n')) {
    if (raw.startsWith('\t')) {
      if (current) lines[lineNo - 1] = { sha: current.sha, text: raw.slice(1) }
      continue
    }
    const header = HEADER.exec(raw)
    if (header) {
      const sha = header[1]
      current = commits[sha] ??= { sha, author: '', authorEmail: '', authorTime: 0, summary: '' }
      lineNo = Number(header[2])
      continue
    }
    if (!current) continue
    const space = raw.indexOf(' ')
    const key = space < 0 ? raw : raw.slice(0, space)
    const value = space < 0 ? '' : raw.slice(space + 1)
    if (key === 'author') current.author = value
    else if (key === 'author-mail') current.authorEmail = value.replace(/^<(.*)>$/, '$1')
    else if (key === 'author-time') current.authorTime = Number(value)
    else if (key === 'summary') current.summary = value
    else if (key === 'previous') {
      const sp = value.indexOf(' ')
      current.previous = { sha: value.slice(0, sp), path: unquotePath(value.slice(sp + 1)) }
    }
  }
  const binary = lines.some((l) => l.text.includes('\0'))
  return { path, binary, commits, lines: binary ? [] : lines }
}

/** Blame di un file a un commit, o del file sul disco con sha null (le righe non ancora nel commit hanno lo SHA di zeri). */
export async function readBlame(runner: GitRunner, sha: string | null, path: string, ignoreWhitespace: boolean): Promise<BlameResult> {
  const args = ['blame', '--porcelain', ...(ignoreWhitespace ? ['-w'] : []), ...(sha ? [sha] : []), '--', path]
  // ponytail: tutto il file in una volta; --incremental a blocchi se servirà su file enormi
  return parseBlame((await runner.run(args)).stdout, path)
}
