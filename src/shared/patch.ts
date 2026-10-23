import type { DiffLine, FileDiff } from './types'

/** Chiave di una riga di un diff: "blocco:riga". */
export const lineKey = (hunk: number, line: number): string => `${hunk}:${line}`

/** Le righe cambiate (aggiunte e tolte) di un blocco, o di tutto il diff. */
export function changedKeys(diff: FileDiff, hunk?: number): Set<string> {
  const keys = new Set<string>()
  diff.hunks.forEach((h, i) => {
    if (hunk !== undefined && hunk !== i) return
    h.lines.forEach((l, j) => {
      if (l.type !== 'context') keys.add(lineKey(i, j))
    })
  })
  return keys
}

/**
 * Patch con le sole righe scelte, da applicare con git apply --recount.
 * reverse=false (stage, dal diff index→cartella): le righe tolte non scelte restano come contesto,
 * le aggiunte non scelte spariscono. reverse=true (unstage o scarto, applicata con --reverse): l'opposto.
 */
export function buildPatch(diff: FileDiff, selected: ReadonlySet<string>, reverse: boolean): string | null {
  const hunks: string[] = []
  diff.hunks.forEach((hunk, h) => {
    const lines: string[] = []
    let changes = 0
    const push = (sign: string, line: DiffLine) => {
      lines.push(sign + line.text)
      if (line.noNewline) lines.push('\\ No newline at end of file')
    }
    hunk.lines.forEach((line, l) => {
      if (line.type === 'context') push(' ', line)
      else if (selected.has(lineKey(h, l))) {
        push(line.type === 'add' ? '+' : '-', line)
        changes++
      } else if ((line.type === 'del') !== reverse) push(' ', line)
      // altrimenti la riga non esiste sul lato a cui si applica la patch: si omette
    })
    if (!changes) return
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(hunk.header)
    const count = (signs: string) => lines.filter((x) => signs.includes(x[0] ?? '')).length
    hunks.push(`@@ -${m?.[1] ?? 1},${count(' -')} +${m?.[2] ?? 1},${count(' +')} @@`, ...lines)
  })
  if (!hunks.length) return null
  const from = quote(`a/${diff.oldPath ?? diff.path}`)
  const to = quote(`b/${diff.path}`)
  return `diff --git ${from} ${to}\n--- ${from}\n+++ ${to}\n${hunks.join('\n')}\n`
}

/** Virgolette in stile git per i percorsi con caratteri speciali o non ASCII (byte UTF-8 in ottale). */
function quote(path: string): string {
  if (!/[^\x20-\x7e]|["\\]/.test(path)) return path
  let out = '"'
  for (const byte of new TextEncoder().encode(path)) {
    if (byte === 0x22) out += '\\"'
    else if (byte === 0x5c) out += '\\\\'
    else if (byte === 0x0a) out += '\\n'
    else if (byte === 0x09) out += '\\t'
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(byte)
  }
  return `${out}"`
}
