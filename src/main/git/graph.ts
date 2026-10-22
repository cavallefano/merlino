import type { GraphEdge, GraphRow } from '../../shared/types'

interface Lane {
  /** Commit atteso in questa colonna. */
  sha: string
  /** Colonna da cui parte il segmento verso la riga successiva. */
  from: number
}

/**
 * Colonne del grafo. I commit devono avere i figli prima dei genitori (git log --date-order).
 * Ogni commit prende la colonna di un figlio; il primo genitore prosegue nella stessa colonna.
 */
export function layoutGraph(commits: { sha: string; parents: string[] }[]): { rows: GraphRow[]; lanes: number } {
  const lanes: (Lane | null)[] = []
  let joins: { from: number; lane: number }[] = []
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
      if (l) up.push({ from: l.from, to: target(j) })
    })
    for (const j of joins) up.push({ from: j.from, to: target(j.lane) })
    joins = []

    // Le corsie che aspettavano questo commit finiscono qui, le altre proseguono dritte
    lanes.forEach((l, j) => {
      if (l) lanes[j] = l.sha === commit.sha ? null : { sha: l.sha, from: j }
    })

    commit.parents.forEach((parent, i) => {
      const m = lanes.findIndex((l) => l?.sha === parent)
      if (i === 0 && (m === -1 || m > k)) lanes[k] = { sha: parent, from: k }
      else if (m !== -1) joins.push({ from: k, lane: m })
      else lanes[free()] = { sha: parent, from: k }
    })
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    rows.push({ lane: k, up })
    width = Math.max(width, k + 1, lanes.length)
  }
  return { rows, lanes: width }
}
