import type { GraphEdge, GraphRow } from '../../shared/types'

interface Lane {
  /** Commit atteso in questa colonna. */
  sha: string
  /** Colonna da cui parte il segmento verso la riga successiva. */
  from: number
  /** Aperta da un commit con dashed (la riga delle modifiche locali). */
  dashed: boolean
}

const edge = (from: number, to: number, dashed: boolean): GraphEdge => (dashed ? { from, to, dashed } : { from, to })

/**
 * Colonne del grafo. I commit devono avere i figli prima dei genitori (git log --date-order).
 * Ogni commit prende la colonna di un figlio; il primo genitore prosegue nella stessa colonna.
 * Un commit con dashed apre corsie tratteggiate, a cui i genitori degli altri commit non si uniscono.
 */
export function layoutGraph(commits: { sha: string; parents: string[]; dashed?: boolean }[]): { rows: GraphRow[]; lanes: number } {
  const lanes: (Lane | null)[] = []
  let joins: { from: number; lane: number; dashed: boolean }[] = []
  const rows: GraphRow[] = []
  let width = 0
  const free = () => {
    const i = lanes.indexOf(null)
    return i === -1 ? lanes.length : i
  }

  for (const commit of commits) {
    let k = lanes.findIndex((l) => l?.sha === commit.sha)
    if (k === -1) k = free()
    const target = (j: number) => (lanes[j]?.sha === commit.sha ? k : j)

    const up: GraphEdge[] = []
    lanes.forEach((l, j) => {
      if (l) up.push(edge(l.from, target(j), l.dashed))
    })
    for (const j of joins) up.push(edge(j.from, target(j.lane), j.dashed))
    joins = []

    // Le corsie che aspettavano questo commit finiscono qui, le altre proseguono dritte
    lanes.forEach((l, j) => {
      if (l) lanes[j] = l.sha === commit.sha ? null : { ...l, from: j }
    })

    const dashed = commit.dashed === true
    commit.parents.forEach((parent, i) => {
      const m = lanes.findIndex((l) => l?.sha === parent && !l.dashed)
      if (i === 0 && (m === -1 || m > k)) lanes[k] = { sha: parent, from: k, dashed }
      else if (m !== -1) joins.push({ from: k, lane: m, dashed })
      else lanes[free()] = { sha: parent, from: k, dashed }
    })
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    rows.push({ lane: k, up })
    width = Math.max(width, k + 1, lanes.length)
  }
  return { rows, lanes: width }
}
