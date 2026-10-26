const PREFIX = /^(author|path|message|contents):(.*)$/s

/**
 * Ricerca dell'utente → opzioni di git log. Prefissi: author:, path:, message:, contents:.
 * Il testo senza prefisso cerca nel messaggio; i valori tra virgolette possono contenere spazi.
 */
export function searchArgs(query: string): { args: string[]; paths: string[] } {
  const args: string[] = []
  const paths: string[] = []
  for (const token of query.match(/(?:\w+:)?(?:"[^"]*"|\S+)/g) ?? []) {
    const m = PREFIX.exec(token)
    const key = m ? m[1] : 'message'
    const value = unquote(m ? m[2] : token)
    if (!value) continue
    if (key === 'path') paths.push(value)
    else if (key === 'author') args.push(`--author=${value}`)
    else if (key === 'contents') args.push(`-S${value}`)
    else args.push(`--grep=${value}`)
  }
  // Tutte le condizioni in AND, maiuscole ignorate, testo letterale (non regex)
  if (args.length) args.push('--all-match', '-i', '-F')
  return { args, paths }
}

const unquote = (s: string) => s.replace(/^"(.*)"$/s, '$1')

/** Il file rientra in un filtro path: (lo stesso percorso o un file dentro la cartella). */
export function matchesPath(path: string, filters: string[]): boolean {
  return filters.some((f) => path === f || path.startsWith(f.endsWith('/') ? f : `${f}/`))
}
