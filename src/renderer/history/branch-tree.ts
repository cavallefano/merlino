export type TreeRow =
  | { kind: 'folder'; path: string; name: string; depth: number }
  | { kind: 'item'; name: string; label: string; depth: number }

/** Righe di un albero di nomi divisi da "/" (feature/login → cartella feature), senza il contenuto delle cartelle chiuse. */
export function treeRows(names: string[], collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const parts = name.split('/')
    let hidden = false
    for (let depth = 0; depth < parts.length - 1; depth++) {
      const path = parts.slice(0, depth + 1).join('/')
      if (!seen.has(path)) {
        seen.add(path)
        if (!hidden) rows.push({ kind: 'folder', path, name: parts[depth] ?? '', depth })
      }
      if (collapsed.has(path)) hidden = true
    }
    if (!hidden) rows.push({ kind: 'item', name, label: parts[parts.length - 1] ?? name, depth: parts.length - 1 })
  }
  return rows
}
