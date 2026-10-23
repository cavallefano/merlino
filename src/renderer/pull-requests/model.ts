import type { Check, CheckState, CiStatus, HostingService, MergeMethod, PullRequest, PullRequestRemote } from '../../shared/types'

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

export type StateCounts = Record<CheckState, number>

export interface CiProgressInfo {
  total: number
  /** Job finiti: superati, falliti, saltati, annullati. */
  done: number
  counts: StateCounts
  /** Il primo gruppo con un job in corso, o in coda se nessuno gira. */
  current: string | null
  /** Inizio del primo job; null se nessuno è partito. */
  startedAt: number | null
  /** Ha job in corso o in coda. */
  active: boolean
}

export interface CiGroup {
  /** Stage o workflow; null per gli altri controlli. */
  name: string | null
  checks: Check[]
  counts: StateCounts
  total: number
  done: number
  state: 'failed' | 'running' | 'queued' | 'passed'
  /** Secondi; null se nessun job del gruppo è partito. */
  duration: number | null
}

const STATES: CheckState[] = ['passed', 'failed', 'running', 'queued', 'skipped', 'cancelled']

export function countStates(checks: Check[]): StateCounts {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as StateCounts
  for (const c of checks) counts[c.state]++
  return counts
}

/** La pipeline ha ancora job in corso o in coda (anche se qualcuno è già fallito). */
export const isActive = (status: CiStatus): boolean => status.checks.some((c) => c.state === 'running' || c.state === 'queued')

const starts = (checks: Check[]) => checks.flatMap((c) => (c.startedAt === null ? [] : [c.startedAt]))

export function ciProgress(status: CiStatus): CiProgressInfo {
  const counts = countStates(status.checks)
  const first = starts(status.checks)
  const current = status.checks.find((c) => c.state === 'running') ?? status.checks.find((c) => c.state === 'queued')
  return {
    total: status.checks.length,
    done: status.checks.length - counts.running - counts.queued,
    counts,
    current: current?.group ?? null,
    startedAt: first.length ? Math.min(...first) : null,
    active: counts.running + counts.queued > 0,
  }
}

/** Dall'inizio del primo job alla fine dell'ultimo, o fino a now se uno partito non è finito; null se nessuno è partito. */
export function span(checks: Check[], now: number): number | null {
  const first = starts(checks)
  if (!first.length) return null
  const open = checks.some((c) => c.startedAt !== null && c.finishedAt === null)
  const end = open ? now : Math.max(...checks.flatMap((c) => (c.finishedAt === null ? [] : [c.finishedAt])))
  return Math.max(0, end - Math.min(...first))
}

/** I job divisi per gruppo, nell'ordine in cui arrivano (quello della pipeline). */
export function ciGroups(checks: Check[], now: number): CiGroup[] {
  const groups = new Map<string | null, Check[]>()
  for (const c of checks) {
    let list = groups.get(c.group)
    if (!list) groups.set(c.group, (list = []))
    list.push(c)
  }
  return [...groups].map(([name, list]) => {
    const counts = countStates(list)
    const state = counts.failed ? 'failed' : counts.running ? 'running' : counts.queued ? 'queued' : 'passed'
    return { name, checks: list, counts, total: list.length, done: list.length - counts.running - counts.queued, state, duration: span(list, now) }
  })
}

/** "40 s", "6 min", "1 h 12 min": gli stessi simboli in inglese e in italiano. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
