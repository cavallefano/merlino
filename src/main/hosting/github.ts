import type {
  Check,
  CheckState,
  CiStatus,
  HostingRepo,
  MergeBlock,
  MergeMethod,
  MergeOptions,
  NewPullRequest,
  PullRequest,
  PullRequestDetail,
  PullRequestFilter,
  TimelineItem,
} from '../../shared/types'
import type { HostingClient } from './http'
import { byTime, ciSummary, type HostingProvider, pathSegments, seconds } from './provider'

// Le parti delle risposte di GitHub che Merlino usa
interface GhUser {
  login: string
}
interface GhRef {
  ref: string
  sha: string
  /** null se il fork è stato cancellato. */
  repo: { full_name: string; owner: GhUser } | null
}
export interface GhPull {
  number: number
  title: string
  body: string | null
  user: GhUser | null
  state: 'open' | 'closed'
  draft?: boolean
  merged_at: string | null
  created_at: string
  updated_at: string
  html_url: string
  head: GhRef
  base: GhRef
  /** Solo nel dettaglio. */
  comments?: number
  review_comments?: number
  mergeable_state?: string
}
interface GhComment {
  id: number
  user: GhUser | null
  body: string | null
  created_at: string
}
interface GhCommit {
  sha: string
  author: GhUser | null
  commit: { message: string; author: { name: string; date: string } | null; committer: { date: string } | null }
}
interface GhRepo {
  default_branch: string
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
  delete_branch_on_merge?: boolean
}
interface GhStatus {
  statuses: { context: string; state: string; target_url: string | null }[]
}
interface GhCheckRuns {
  check_runs: { name: string; status: string; conclusion: string | null; html_url: string | null }[]
}

const STATUS: Record<string, CheckState> = { success: 'passed', failure: 'failed', error: 'failed', pending: 'running' }
// Le altre conclusioni (failure, timed_out, action_required, startup_failure) sono fallimenti
const CONCLUSION: Record<string, CheckState> = { success: 'passed', neutral: 'passed', skipped: 'skipped', stale: 'skipped', cancelled: 'cancelled' }
// mergeable_state: clean, unstable (CI facoltativa fallita), has_hooks e unknown (ancora in calcolo) non bloccano
const BLOCKS: Record<string, MergeBlock> = { dirty: 'conflicts', behind: 'rebase', blocked: 'blocked', draft: 'draft' }

export function fromGitHub(p: GhPull): PullRequest {
  const fork = p.head.repo?.full_name !== p.base.repo?.full_name
  return {
    number: p.number,
    title: p.title,
    body: p.body ?? '',
    author: p.user?.login ?? '',
    state: p.merged_at ? 'merged' : p.state,
    draft: p.draft === true,
    head: { branch: p.head.ref, sha: p.head.sha },
    base: { branch: p.base.ref },
    fork,
    headOwner: fork ? (p.head.repo?.owner.login ?? null) : null,
    createdAt: seconds(p.created_at),
    updatedAt: seconds(p.updated_at),
    comments: p.comments === undefined ? null : p.comments + (p.review_comments ?? 0),
    url: p.html_url,
  }
}

function mergeBlock(p: GhPull): MergeBlock | null {
  if (p.state !== 'open' || p.merged_at) return 'closed'
  if (p.draft) return 'draft'
  return BLOCKS[p.mergeable_state ?? ''] ?? null
}

export class GitHub implements HostingProvider {
  constructor(private readonly c: HostingClient) {}

  async verify(): Promise<string> {
    return (await this.c.request<GhUser>('GET', '/user')).login
  }

  async repo(project: string): Promise<HostingRepo> {
    const r = await this.c.request<GhRepo>('GET', `/repos/${pathSegments(project)}`)
    // Senza permessi di scrittura i campi allow_* mancano: si propongono tutti, il servizio dirà di no
    const methods: MergeMethod[] = []
    if (r.allow_merge_commit !== false) methods.push('merge')
    if (r.allow_squash_merge !== false) methods.push('squash')
    if (r.allow_rebase_merge !== false) methods.push('rebase')
    return { defaultBranch: r.default_branch, methods, squash: null, deleteBranch: r.delete_branch_on_merge === true }
  }

  async list(project: string, filter: PullRequestFilter): Promise<PullRequest[]> {
    // state=closed comprende anche le unite: si separano con merged_at
    const state = filter === 'merged' ? 'closed' : filter
    const pulls = await this.c.all<GhPull>(
      `/repos/${pathSegments(project)}/pulls?state=${state}&sort=updated&direction=desc&per_page=100`,
      filter === 'open' ? 500 : 100,
    )
    return pulls.map(fromGitHub).filter((p) => filter === 'all' || p.state === filter)
  }

  async detail(project: string, number: number): Promise<PullRequestDetail> {
    const repo = `/repos/${pathSegments(project)}`
    const [p, comments, commits] = await Promise.all([
      this.c.request<GhPull>('GET', `${repo}/pulls/${number}`),
      this.c.all<GhComment>(`${repo}/issues/${number}/comments?per_page=100`, 1000),
      this.c.all<GhCommit>(`${repo}/pulls/${number}/commits?per_page=100`, 250),
    ])
    const timeline: TimelineItem[] = [
      ...comments.map((c): TimelineItem => ({ kind: 'comment', id: String(c.id), author: c.user?.login ?? '', time: seconds(c.created_at), body: c.body ?? '' })),
      ...commits.map(
        (c): TimelineItem => ({
          kind: 'commit',
          sha: c.sha,
          author: c.author?.login ?? c.commit.author?.name ?? '',
          time: seconds(c.commit.committer?.date ?? c.commit.author?.date),
          subject: c.commit.message.split('\n')[0] ?? '',
        }),
      ),
    ]
    return { ...fromGitHub(p), baseSha: p.base.sha, mergeBlock: mergeBlock(p), timeline: byTime(timeline) }
  }

  async checks(project: string, sha: string): Promise<CiStatus> {
    const commit = `/repos/${pathSegments(project)}/commits/${sha}`
    const [status, runs] = await Promise.all([
      this.c.request<GhStatus>('GET', `${commit}/status`),
      this.c.request<GhCheckRuns>('GET', `${commit}/check-runs?per_page=100`),
    ])
    const checks: Check[] = [
      ...status.statuses.map((s): Check => ({ name: s.context, state: STATUS[s.state] ?? 'running', url: s.target_url })),
      ...runs.check_runs.map(
        (r): Check => ({ name: r.name, state: r.status !== 'completed' ? 'running' : (CONCLUSION[r.conclusion ?? ''] ?? 'failed'), url: r.html_url }),
      ),
    ]
    return { summary: ciSummary(checks), checks }
  }

  async comment(project: string, number: number, body: string): Promise<void> {
    await this.c.request('POST', `/repos/${pathSegments(project)}/issues/${number}/comments`, { body })
  }

  async merge(project: string, number: number, o: MergeOptions): Promise<void> {
    const repo = `/repos/${pathSegments(project)}`
    const p = await this.c.request<GhPull>('GET', `${repo}/pulls/${number}`)
    const [title = '', ...rest] = o.message.split('\n')
    const message = o.method !== 'rebase' && o.message.trim() ? { commit_title: title, commit_message: rest.join('\n').trim() } : {}
    await this.c.request('PUT', `${repo}/pulls/${number}/merge`, { merge_method: o.method, sha: o.sha, ...message })
    // Il branch di un fork non è di questo repository
    if (o.deleteBranch && p.head.repo?.full_name === p.base.repo?.full_name) {
      await this.c.request('DELETE', `${repo}/git/refs/heads/${pathSegments(p.head.ref)}`)
    }
  }

  async setState(project: string, number: number, state: 'open' | 'closed'): Promise<void> {
    await this.c.request('PATCH', `/repos/${pathSegments(project)}/pulls/${number}`, { state })
  }

  async create(project: string, headProject: string, input: NewPullRequest): Promise<number> {
    // Da un fork head è "proprietario:branch"
    const head = headProject === project ? input.head : `${headProject.split('/')[0]}:${input.head}`
    const p = await this.c.request<GhPull>('POST', `/repos/${pathSegments(project)}/pulls`, {
      title: input.title,
      body: input.body,
      head,
      base: input.base,
      draft: input.draft,
    })
    return p.number
  }

  pullRef(number: number): string {
    return `refs/pull/${number}/head`
  }
}
