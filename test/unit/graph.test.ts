import { describe, expect, it } from 'vitest'
import { layoutGraph } from '../../src/main/git/graph'

const c = (sha: string, ...parents: string[]) => ({ sha, parents })

/** Storia casuale ma riproducibile, con i figli prima dei genitori. */
function randomHistory(n: number, seed: number) {
  let s = seed
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const made: { sha: string; parents: string[] }[] = []
  for (let i = 0; i < n; i++) {
    const parents: string[] = []
    if (i > 0 && rand() > 0.03) parents.push(made[Math.max(0, i - 5) + Math.floor(rand() * Math.min(i, 5))].sha)
    if (i > 10 && rand() < 0.2) parents.push(made[Math.floor(rand() * i)].sha)
    made.push({ sha: `c${i}`, parents: [...new Set(parents)] })
  }
  return made.reverse()
}

describe('layoutGraph', () => {
  it('storia lineare: una colonna', () => {
    const { rows, lanes } = layoutGraph([c('C', 'B'), c('B', 'A'), c('A')])
    expect(lanes).toBe(1)
    expect(rows).toEqual([
      { lane: 0, up: [] },
      { lane: 0, up: [{ from: 0, to: 0 }] },
      { lane: 0, up: [{ from: 0, to: 0 }] },
    ])
  })

  it('branch e merge: la linea principale resta a sinistra', () => {
    const { rows, lanes } = layoutGraph([c('M', 'A', 'B'), c('B', 'X'), c('A', 'X'), c('X')])
    expect(lanes).toBe(2)
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0, 0])
    expect(rows[1].up).toEqual([{ from: 0, to: 0 }, { from: 0, to: 1 }])
    expect(rows[3].up).toEqual([{ from: 0, to: 0 }, { from: 1, to: 0 }])
  })

  it('storie senza antenati comuni', () => {
    const { rows } = layoutGraph([c('A2', 'A1'), c('B1'), c('A1')])
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0])
    expect(rows[1].up).toEqual([{ from: 0, to: 0 }])
  })

  it('invarianti su 2000 commit casuali', () => {
    const commits = randomHistory(2000, 42)
    const { rows, lanes } = layoutGraph(commits)
    const hasChild = new Set(commits.flatMap((x) => x.parents))
    rows.forEach((row, r) => {
      expect(row.lane).toBeLessThan(lanes)
      // il nodo ha un segmento in arrivo se e solo se ha figli
      expect(row.up.some((e) => e.to === row.lane)).toBe(hasChild.has(commits[r].sha))
      // tutti i segmenti stanno dentro la larghezza del grafo
      for (const e of row.up) expect(Math.max(e.from, e.to)).toBeLessThan(lanes)
      if (r === 0) return
      const prev = rows[r - 1]
      // ogni segmento parte da una colonna viva nella riga precedente
      for (const e of row.up) expect(e.from === prev.lane || prev.up.some((f) => f.to === e.from)).toBe(true)
      // una corsia che passa nella riga precedente prosegue in questa
      for (const e of prev.up) if (e.to !== prev.lane) expect(row.up.some((f) => f.from === e.to)).toBe(true)
    })
  })
})
