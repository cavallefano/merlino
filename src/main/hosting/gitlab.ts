import type {
  Check,
  CheckState,
  CiStatus,
  HostingRepo,
  MergeBlock,
  MergeOptions,
  NewPullRequest,
  PullRequest,
  PullRequestDetail,
  PullRequestFilter,
  TimelineItem,
} from '../../shared/types'
import type { HostingClient } from './http'
import { byTime, ciSummary, type HostingProvider, seconds } from './provider'

// Le parti delle risposte di GitLab che Merlino usa
interface GlUser {
  username: string
}
export interface GlMergeRequest {
  iid: number
  title: string
  description: string | null
  author: GlUser | null
  state: 'opened' | 'closed' | 'locked' | 'merged'
  draft?: boolean
  source_branch: string
  target_branch: string
  sha: string
  source_project_id: number
  target_project_id: number
  created_at: string
  updated_at: string
  web_url: string
  user_notes_count?: number
  /** Solo nel dettaglio. */
  detailed_merge_status?: string
  has_conflicts?: boolean
  diff_refs?: { base_sha: string } | null
}
interface GlNote {
  id: number
  body: string
  author: GlUser | null
  created_at: string
  system: boolean
}
interface GlCommit {
  id: string
  title: string
  author_name: string
  committed_date?: string
  created_at: string
}
interface GlProject {
  id: number
  default_branch: string
  merge_method?: string
  squash_option?: string
  remove_source_branch_after_merge?: boolean
  namespace: { full_path: string }
}
interface GlJob {
  name: string
  status: string
  web_url: string
}

const STATES = { open: 'opened', merged: 'merged', closed: 'closed', all: 'all' } as const
// I job in attesa (created, pending, preparing, scheduled, waiting_for_resource) contano come in corso
const JOBS: Record<string, CheckState> = { success: 'passed', failed: 'failed', canceled: 'cancelled', canceling: 'cancelled', skipped: 'skipped', manual: 'skipped' }
// detailed_merge_status: gli stati non elencati (mergeable, checking, unchecked…) non bloccano
const BLOCKS: Record<string, MergeBlock> = {
  conflict: 'conflicts',
  broken_status: 'conflicts',
  ci_must_pass: 'checks',
  ci_still_running: 'checks',
  external_status_checks: 'checks',
  not_approved: 'approvals',
  requested_changes: 'approvals',
  draft_status: 'draft',
  discussions_not_resolved: 'discussions',
  need_rebase: 'rebase',
  not_open: 'closed',
  blocked_status: 'blocked',
  merge_request_blocked: 'blocked',
  jira_association_missing: 'blocked',
  locked_paths: 'blocked',
  locked_lfs_files: 'blocked',
  security_policy_violations: 'blocked',
  title_regex: 'blocked',
}
const SQUASH: Record<string, HostingRepo['squash']> = { never: 'never', always: 'always', default_on: 'default', default_off: 'optional' }

export function fromGitLab(m: GlMergeRequest): PullRequest {
  return {
    number: m.iid,
    title: m.title,
    body: m.description ?? '',
    author: m.author?.username ?? '',
    state: m.state === 'opened' ? 'open' : m.state === 'merged' ? 'merged' : 'closed',
    draft: m.draft === true,
    head: { branch: m.source_branch, sha: m.sha },
    base: { branch: m.target_branch },
    fork: m.source_project_id !== m.target_project_id,
    headOwner: null,
    createdAt: seconds(m.created_at),
    updatedAt: seconds(m.updated_at),
    comments: m.user_notes_count ?? null,
    url: m.web_url,
  }
}

export class GitLab implements HostingProvider {
  constructor(private readonly c: HostingClient) {}

  /** Il progetto nelle API: percorso codificato (acme%2Fdemo-app) o id numerico. */
  private project(path: string | number): string {
    return `/projects/${encodeURIComponent(path)}`
  }

  async verify(): Promise<string> {
    return (await this.c.request<GlUser>('GET', '/user')).username
  }

  async repo(project: string): Promise<HostingRepo> {
    const p = await this.c.request<GlProject>('GET', this.project(project))
    return {
      defaultBranch: p.default_branch,
      methods: [p.merge_method === 'ff' ? 'ff' : 'merge'],
      squash: SQUASH[p.squash_option ?? ''] ?? 'optional',
      deleteBranch: p.remove_source_branch_after_merge === true,
    }
  }

  async list(project: string, filter: PullRequestFilter): Promise<PullRequest[]> {
    const mrs = await this.c.all<GlMergeRequest>(
      `${this.project(project)}/merge_requests?state=${STATES[filter]}&order_by=updated_at&sort=desc&per_page=100`,
      filter === 'open' ? 500 : 100,
    )
    return mrs.map(fromGitLab)
  }

  async detail(project: string, number: number): Promise<PullRequestDetail> {
    const mr = `${this.project(project)}/merge_requests/${number}`
    const [m, notes, commits] = await Promise.all([
      this.c.request<GlMergeRequest>('GET', mr),
      this.c.all<GlNote>(`${mr}/notes?sort=asc&order_by=created_at&per_page=100`, 1000),
      this.c.all<GlCommit>(`${mr}/commits?per_page=100`, 250),
    ])
    const pr = fromGitLab(m)
    // Il gruppo del fork è un'altra chiamata; se quel progetto non è visibile resta sconosciuto
    const headOwner = pr.fork
      ? await this.c.request<GlProject>('GET', this.project(m.source_project_id)).then(
          (p) => p.namespace.full_path,
          () => null,
        )
      : null
    const timeline: TimelineItem[] = [
      // Le note di sistema ("added 1 commit", …) non sono commenti
      ...notes
        .filter((n) => !n.system)
        .map((n): TimelineItem => ({ kind: 'comment', id: String(n.id), author: n.author?.username ?? '', time: seconds(n.created_at), body: n.body })),
      ...commits.map((c): TimelineItem => ({ kind: 'commit', sha: c.id, author: c.author_name, time: seconds(c.committed_date ?? c.created_at), subject: c.title })),
    ]
    const mergeBlock = m.state !== 'opened' ? 'closed' : (BLOCKS[m.detailed_merge_status ?? ''] ?? (m.has_conflicts ? 'conflicts' : null))
    return { ...pr, headOwner, baseSha: m.diff_refs?.base_sha ?? '', mergeBlock, timeline: byTime(timeline) }
  }

  async checks(project: string, sha: string): Promise<CiStatus> {
    const [pipeline] = await this.c.request<{ id: number }[]>('GET', `${this.project(project)}/pipelines?sha=${sha}&per_page=1`)
    if (!pipeline) return { summary: 'none', checks: [] }
    const jobs = await this.c.all<GlJob>(`${this.project(project)}/pipelines/${pipeline.id}/jobs?per_page=100`, 500)
    const checks = jobs.map((j): Check => ({ name: j.name, state: JOBS[j.status] ?? 'running', url: j.web_url }))
    return { summary: ciSummary(checks), checks }
  }

  async comment(project: string, number: number, body: string): Promise<void> {
    await this.c.request('POST', `${this.project(project)}/merge_requests/${number}/notes`, { body })
  }

  async merge(project: string, number: number, o: MergeOptions): Promise<void> {
    // Il metodo lo decide il progetto; il messaggio va allo squash o al merge commit (con il fast-forward a nessuno)
    const message = !o.message.trim() ? {} : o.squash ? { squash_commit_message: o.message } : o.method === 'ff' ? {} : { merge_commit_message: o.message }
    await this.c.request('PUT', `${this.project(project)}/merge_requests/${number}/merge`, {
      sha: o.sha,
      squash: o.squash,
      should_remove_source_branch: o.deleteBranch,
      ...message,
    })
  }

  async setState(project: string, number: number, state: 'open' | 'closed'): Promise<void> {
    await this.c.request('PUT', `${this.project(project)}/merge_requests/${number}`, { state_event: state === 'closed' ? 'close' : 'reopen' })
  }

  async create(project: string, headProject: string, input: NewPullRequest): Promise<number> {
    // Da un fork la merge request si crea sul fork, indicando il progetto di destinazione
    const target = headProject === project ? {} : { target_project_id: (await this.c.request<GlProject>('GET', this.project(project))).id }
    const m = await this.c.request<GlMergeRequest>('POST', `${this.project(headProject)}/merge_requests`, {
      source_branch: input.head,
      target_branch: input.base,
      title: input.draft ? `Draft: ${input.title}` : input.title,
      description: input.body,
      ...target,
    })
    return m.iid
  }

  pullRef(number: number): string {
    return `refs/merge-requests/${number}/head`
  }
}
