import type { Check, CiStatus, HostingRepo, MergeOptions, NewPullRequest, PullRequest, PullRequestDetail, PullRequestFilter, TimelineItem } from '../../shared/types'

/** Le operazioni di un servizio (GitHub, GitLab) su un progetto; project è il percorso, es. acme/demo-app. */
export interface HostingProvider {
  /** Nome utente del token. */
  verify(): Promise<string>
  repo(project: string): Promise<HostingRepo>
  list(project: string, filter: PullRequestFilter): Promise<PullRequest[]>
  detail(project: string, number: number): Promise<PullRequestDetail>
  checks(project: string, sha: string): Promise<CiStatus>
  comment(project: string, number: number, body: string): Promise<void>
  merge(project: string, number: number, options: MergeOptions): Promise<void>
  setState(project: string, number: number, state: 'open' | 'closed'): Promise<void>
  /** headProject: il progetto del branch con le modifiche (un fork, o lo stesso). Restituisce il numero della nuova PR. */
  create(project: string, headProject: string, input: NewPullRequest): Promise<number>
  /** Ref della PR sul remote di destinazione. */
  pullRef(number: number): string
}

/** Fallito se un job è fallito, in corso se uno è in corso o in coda, superato se ce ne sono, altrimenti nessuno. */
export function ciSummary(checks: Check[]): CiStatus['summary'] {
  if (checks.some((c) => c.state === 'failed')) return 'failed'
  if (checks.some((c) => c.state === 'running' || c.state === 'queued')) return 'running'
  return checks.length ? 'passed' : 'none'
}

/** Commenti e commit in ordine di tempo (a parità, l'ordine di arrivo). */
export const byTime = (items: TimelineItem[]): TimelineItem[] => items.toSorted((a, b) => a.time - b.time)

/** Secondi dall'epoch da una data ISO, come i commit. */
export const seconds = (iso: string | null | undefined): number => (iso ? Math.floor(Date.parse(iso) / 1000) : 0)

/** Come seconds, ma null se la data manca (job non partito o non finito). */
export const optionalSeconds = (iso: string | null | undefined): number | null => (iso ? seconds(iso) : null)

/** Segmenti di un percorso codificati uno per uno: gli "/" restano. */
export const pathSegments = (path: string): string => path.split('/').map(encodeURIComponent).join('/')
