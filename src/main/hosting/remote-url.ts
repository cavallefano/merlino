/** Server e percorso del progetto dall'URL configurato del remote; null per cartelle locali e URL non riconosciuti. */
export function parseRemoteUrl(url: string): { host: string; path: string } | null {
  let host: string
  let path: string
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return null
    }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(u.protocol) || !u.hostname) return null
    // La porta conta solo per http(s): quella di ssh non è quella delle API
    host = u.protocol.startsWith('http') ? u.host : u.hostname
    path = decodeURIComponent(u.pathname)
  } else {
    // Forma scp di ssh: [utente@]server:percorso (C:\… e C:/… sono cartelle di Windows)
    const scp = /^(?:[^@/]+@)?([^:/\\]+):(?![/\\])(.+)$/.exec(url)
    if (!scp) return null
    host = scp[1]
    path = scp[2]
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  return path.includes('/') ? { host: host.toLowerCase(), path } : null
}
