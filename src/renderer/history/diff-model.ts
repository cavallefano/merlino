import { diffWordsWithSpace } from 'diff'
import type { DiffLine, Hunk } from '../../shared/types'

export interface SplitRow {
  left: DiffLine | null
  right: DiffLine | null
}

export interface Segment {
  text: string
  changed: boolean
}

/** Righe affiancate: i contesti su entrambi i lati, i blocchi tolti/aggiunti accoppiati riga per riga. */
export function splitRows(hunk: Hunk): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ left: dels[i] ?? null, right: adds[i] ?? null })
    dels = []
    adds = []
  }
  for (const line of hunk.lines) {
    if (line.type === 'del') {
      if (adds.length) flush()
      dels.push(line)
    } else if (line.type === 'add') {
      adds.push(line)
    } else {
      flush()
      rows.push({ left: line, right: line })
    }
  }
  flush()
  return rows
}

const MAX_WORD_DIFF = 500

/** Parole cambiate nelle coppie riga tolta/aggiunta (righe lunghe escluse: il confronto costerebbe troppo). */
export function wordSegments(hunk: Hunk): Map<DiffLine, Segment[]> {
  const map = new Map<DiffLine, Segment[]>()
  for (const { left, right } of splitRows(hunk)) {
    if (!left || !right || left === right || left.text.length > MAX_WORD_DIFF || right.text.length > MAX_WORD_DIFF) continue
    const parts = diffWordsWithSpace(left.text, right.text)
    map.set(left, merge(parts.filter((p) => !p.added).map((p) => ({ text: p.value, changed: !!p.removed }))))
    map.set(right, merge(parts.filter((p) => !p.removed).map((p) => ({ text: p.value, changed: !!p.added }))))
  }
  return map
}

/** Unisce i segmenti vicini con lo stesso stato. */
function merge(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const last = out[out.length - 1]
    if (last && last.changed === s.changed) last.text += s.text
    else out.push({ ...s })
  }
  return out
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)
}

export function renderSegments(segments: Segment[]): string {
  return segments.map((s) => (s.changed ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('')
}
