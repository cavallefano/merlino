import { reactive, watch } from 'vue'

/**
 * Misure dei pannelli: una comodità dell'interfaccia, non un'impostazione, quindi nel localStorage.
 * Il layout orizzontale o verticale invece è la preferenza panelLayout.
 */
export interface Layout {
  /** Larghezza della sidebar, px. */
  sidebar: number
  /** Frazione della lista (commit o PR) accanto al dettaglio. */
  list: number
  /** Frazione della lista sopra il dettaglio. */
  listVertical: number
  /** Altezza della lista dei file, px: dettaglio del commit, modifiche locali, dettaglio della PR. */
  commitFiles: number
  workingFiles: number
  prFiles: number
  /** Misura del popup del diff; null = l'85% della finestra. */
  dialog: { width: number; height: number } | null
}

export type LayoutSize = Exclude<keyof Layout, 'dialog'>

/** Predefiniti e valori ammessi nel localStorage; i limiti al trascinamento dipendono dalla finestra e li applica il divisore. */
export const SIZES: Record<LayoutSize, { min: number; max: number; default: number }> = {
  sidebar: { min: 160, max: 400, default: 220 },
  list: { min: 0.05, max: 0.95, default: 0.55 },
  listVertical: { min: 0.05, max: 0.95, default: 0.4 },
  commitFiles: { min: 48, max: 4000, default: 140 },
  workingFiles: { min: 48, max: 4000, default: 180 },
  prFiles: { min: 48, max: 4000, default: 160 },
}

export const DIALOG_MIN = { width: 480, height: 300 }

const KEY = 'merlino.layout'

/** value fra min e max; se i limiti si incrociano vince min, così un pannello non sparisce. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && v >= min && v <= max

/** Il layout salvato; i valori mancanti, non numerici o fuori dai limiti tornano ai predefiniti. */
export function readLayout(text: string | null): Layout {
  let saved: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(text ?? '{}')
    if (parsed && typeof parsed === 'object') saved = parsed as Record<string, unknown>
  } catch {
    // JSON rovinato: valori predefiniti
  }
  const layout = { dialog: null } as Layout
  for (const key of Object.keys(SIZES) as LayoutSize[]) {
    const { min, max, default: fallback } = SIZES[key]
    const v = saved[key]
    layout[key] = inRange(v, min, max) ? v : fallback
  }
  const d = saved.dialog
  if (d && typeof d === 'object') {
    const { width, height } = d as Record<string, unknown>
    if (inRange(width, DIALOG_MIN.width, 10_000) && inRange(height, DIALOG_MIN.height, 10_000)) layout.dialog = { width, height }
  }
  return layout
}

/** Il localStorage può mancare o rifiutare la scrittura: allora le misure restano solo in memoria. */
function storage<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

let state: Layout | null = null

/** Il layout dell'app, condiviso da tutte le schede; ogni modifica si salva subito. */
export function useLayout(): Layout {
  if (!state) {
    const s = reactive(readLayout(storage(() => localStorage.getItem(KEY))))
    watch(s, () => storage(() => localStorage.setItem(KEY, JSON.stringify(s))))
    state = s
  }
  return state
}
