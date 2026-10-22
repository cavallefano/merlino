import type { GraphRow } from '../../shared/types'

export const ROW_HEIGHT = 24
export const LANE_WIDTH = 14
/** Oltre queste colonne il grafo viene tagliato. */
export const MAX_LANES = 24
const COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#22c55e', '#ef4444']

export const laneColor = (lane: number): string => COLORS[lane % COLORS.length] ?? '#888'
const x = (lane: number) => 4 + LANE_WIDTH / 2 + lane * LANE_WIDTH

/** Disegna le righe da first a last; la riga first è in cima al canvas. */
export function drawGraph(
  ctx: CanvasRenderingContext2D,
  rowAt: (i: number) => GraphRow | undefined,
  first: number,
  last: number,
): void {
  const y = (i: number) => (i - first) * ROW_HEIGHT + ROW_HEIGHT / 2
  ctx.lineWidth = 2
  // Anche la riga dopo l'ultima: i suoi segmenti partono dall'ultima riga visibile
  for (let i = first; i <= last + 1; i++) {
    for (const e of rowAt(i)?.up ?? []) {
      ctx.strokeStyle = laneColor(Math.max(e.from, e.to))
      ctx.beginPath()
      ctx.moveTo(x(e.from), y(i - 1))
      if (e.from === e.to) ctx.lineTo(x(e.to), y(i))
      else ctx.bezierCurveTo(x(e.from), y(i) - ROW_HEIGHT / 2, x(e.to), y(i - 1) + ROW_HEIGHT / 2, x(e.to), y(i))
      ctx.stroke()
    }
  }
  for (let i = first; i <= last; i++) {
    const row = rowAt(i)
    if (!row) continue
    ctx.fillStyle = laneColor(row.lane)
    ctx.beginPath()
    ctx.arc(x(row.lane), y(i), 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
