import type { GraphRow } from '../../shared/types'

export const ROW_HEIGHT = 46
export const LANE_WIDTH = 12
/** Oltre queste colonne il grafo viene tagliato. */
export const MAX_LANES = 24
const NODE = 8
const LINE = 1.5
/** Altezza delle curve nei cambi di corsia: il resto del segmento è verticale. */
const CURVE = 14
const COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#22c55e', '#ef4444']

export type NodeKind = 'commit' | 'merge'
type RowAt = (i: number) => GraphRow | undefined

export const laneColor = (lane: number): string => COLORS[lane % COLORS.length] ?? '#888'
const laneX = (lane: number) => 6 + LANE_WIDTH / 2 + lane * LANE_WIDTH

/** Dove finisce il grafo nella riga i: dopo il nodo, i segmenti che arrivano e quelli che partono verso la riga successiva. */
export function graphRight(rowAt: RowAt, i: number): number {
  const row = rowAt(i)
  if (!row) return 0
  let max = row.lane
  for (const e of [...row.up, ...(rowAt(i + 1)?.up ?? [])]) max = Math.max(max, e.from, e.to)
  return laneX(Math.min(max, MAX_LANES - 1)) + LANE_WIDTH / 2
}

/** Disegna le righe da first a last; la riga first è in cima al canvas. */
export function drawGraph(ctx: CanvasRenderingContext2D, rowAt: RowAt, nodeAt: (i: number) => NodeKind | undefined, first: number, last: number): void {
  const y = (i: number) => (i - first) * ROW_HEIGHT + ROW_HEIGHT / 2
  ctx.lineWidth = LINE
  // Anche la riga dopo l'ultima: i suoi segmenti partono dall'ultima riga visibile
  for (let i = first; i <= last + 1; i++) {
    const above = rowAt(i - 1)?.lane
    for (const e of rowAt(i)?.up ?? []) {
      const [x0, x1, y0, y1] = [laneX(e.from), laneX(e.to), y(i - 1), y(i)]
      ctx.strokeStyle = laneColor(Math.max(e.from, e.to))
      ctx.setLineDash(e.dashed ? [3, 3] : [])
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      if (e.from === e.to) {
        ctx.lineTo(x1, y1)
      } else if (e.from === above) {
        // Si apre dal nodo sopra: curva subito sotto il nodo, poi dritta
        ctx.bezierCurveTo(x0, y0 + CURVE / 2, x1, y0 + CURVE / 2, x1, y0 + CURVE)
        ctx.lineTo(x1, y1)
      } else {
        // Confluisce nel nodo di questa riga: dritta, poi curva subito sopra il nodo
        ctx.lineTo(x0, y1 - CURVE)
        ctx.bezierCurveTo(x0, y1 - CURVE / 2, x1, y1 - CURVE / 2, x1, y1)
      }
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  const h = NODE / 2
  for (let i = first; i <= last; i++) {
    const row = rowAt(i)
    const kind = nodeAt(i)
    if (!row || !kind) continue
    const [cx, cy] = [laneX(row.lane), y(i)]
    if (kind === 'merge') {
      // Quadrato vuoto: si cancellano le linee sotto, così si vede lo sfondo della riga (anche se selezionata)
      ctx.clearRect(cx - h, cy - h, NODE, NODE)
      ctx.strokeStyle = laneColor(row.lane)
      ctx.strokeRect(cx - h + LINE / 2, cy - h + LINE / 2, NODE - LINE, NODE - LINE)
    } else {
      ctx.fillStyle = laneColor(row.lane)
      ctx.fillRect(cx - h, cy - h, NODE, NODE)
    }
  }
}
