import type { HostingService, MergeMethod, PullRequest, PullRequestRemote } from '../../shared/types'

/** La PR corrisponde alla ricerca: titolo, descrizione, autore, branch, o il numero (anche "#42"). */
export function matches(p: PullRequest, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const number = /^#?(\d+)$/.exec(q)?.[1]
  return (number !== undefined && String(p.number) === number) || [p.title, p.body, p.author, p.head.branch, p.base.branch].some((s) => s.toLowerCase().includes(q))
}

/** Remote proposto: quello scelto l'ultima volta, poi origin, poi il primo con un account; senza account il primo su un server. */
export function pickRemote(remotes: PullRequestRemote[], saved: string | null): string | null {
  const withAccount = remotes.filter((r) => r.account)
  const pool = withAccount.length ? withAccount : remotes.filter((r) => r.host)
  return (pool.find((r) => r.name === saved) ?? pool.find((r) => r.name === 'origin') ?? pool[0])?.name ?? null
}

/** Il branch della testa, con il proprietario se la PR viene da un fork. */
export const headLabel = (p: PullRequest): string => (p.fork && p.headOwner ? `${p.headOwner}:${p.head.branch}` : p.head.branch)

/** Remote e branch di un upstream (origin/feature/a); il nome di un remote può contenere "/": vince il più lungo. */
export function splitUpstream(upstream: string | null, remotes: string[]): { remote: string; branch: string } | null {
  if (!upstream) return null
  const remote = remotes.toSorted((a, b) => b.length - a.length).find((r) => upstream.startsWith(`${r}/`))
  return remote ? { remote, branch: upstream.slice(remote.length + 1) } : null
}

/** Il messaggio proposto nel dialog del merge, come lo scriverebbe il servizio; '' se il metodo non crea un commit. */
export function defaultMergeMessage(service: HostingService, method: MergeMethod, squash: boolean, pr: PullRequest): string {
  if (service === 'gitlab') {
    if (squash) return pr.title
    return method === 'ff' ? '' : `Merge branch '${pr.head.branch}' into '${pr.base.branch}'\n\n${pr.title}`
  }
  if (method === 'squash') return `${pr.title} (#${pr.number})${pr.body.trim() ? `\n\n${pr.body.trim()}` : ''}`
  if (method !== 'merge') return ''
  // Stesso repository: il proprietario è quello del repository, dall'URL della PR
  const owner = pr.headOwner ?? new URL(pr.url).pathname.split('/')[1]
  return `Merge pull request #${pr.number} from ${owner}/${pr.head.branch}\n\n${pr.title}`
}
