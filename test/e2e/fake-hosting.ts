import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { cloneOf, git, makeRemotePair } from '../helpers/repo'

/** Una PR del server finto, nel modello comune; il server la presenta come GitHub (/api/v3) o GitLab (/api/v4). */
export interface FakePull {
  number: number
  title: string
  body: string
  author: string
  state: 'open' | 'closed' | 'merged'
  draft?: boolean
  head: string
  headSha: string
  /** Proprietario del fork; assente se la PR è dello stesso repository. */
  fork?: string
  base: string
  baseSha: string
  comments: { author: string; body: string; at: string }[]
  commits: { sha: string; message: string; at: string }[]
  checks: { name: string; state: 'success' | 'failure' | 'pending' | 'queued'; stage?: string }[]
  updatedAt: string
}

export interface FakeHosting {
  url: string
  pulls: FakePull[]
  /** "METODO /percorso" e corpo di ogni richiesta. */
  requests: { line: string; body: Record<string, unknown> }[]
  close(): Promise<void>
}

export const TOKEN = 'good-token'
const USER = 'ada'
type Reply = [status: number, body: unknown]
type Handler = (m: RegExpExecArray, body: Record<string, unknown>, query: URLSearchParams) => Reply
const JOB = { success: 'success', failure: 'failed', pending: 'running', queued: 'pending' } as const

/** Server HTTP locale che risponde come le API di GitHub e GitLab per il progetto acme/demo-app. */
export async function fakeHosting(pulls: FakePull[]): Promise<FakeHosting> {
  const requests: FakeHosting['requests'] = []
  const now = () => new Date().toISOString()
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  const find = (n: string) => pulls.find((p) => p.number === Number(n))
  const withPull = (n: string, fn: (p: FakePull) => Reply): Reply => {
    const p = find(n)
    return p ? fn(p) : [404, { message: 'Not Found' }]
  }
  const owner = (p: FakePull) => p.fork ?? 'acme'
  const gh = (p: FakePull) => ({
    number: p.number,
    title: p.title,
    body: p.body,
    user: { login: p.author },
    state: p.state === 'open' ? 'open' : 'closed',
    draft: p.draft ?? false,
    merged_at: p.state === 'merged' ? p.updatedAt : null,
    created_at: p.updatedAt,
    updated_at: p.updatedAt,
    html_url: `https://git.example.com/acme/demo-app/pull/${p.number}`,
    head: { ref: p.head, sha: p.headSha, repo: { full_name: `${owner(p)}/demo-app`, owner: { login: owner(p) } } },
    base: { ref: p.base, sha: p.baseSha, repo: { full_name: 'acme/demo-app', owner: { login: 'acme' } } },
    comments: p.comments.length,
    review_comments: 0,
    mergeable_state: 'clean',
  })
  const gl = (p: FakePull) => ({
    iid: p.number,
    title: p.title,
    description: p.body,
    author: { username: p.author },
    state: p.state === 'open' ? 'opened' : p.state,
    draft: p.draft ?? false,
    source_branch: p.head,
    target_branch: p.base,
    sha: p.headSha,
    source_project_id: p.fork ? 2 : 1,
    target_project_id: 1,
    created_at: p.updatedAt,
    updated_at: p.updatedAt,
    web_url: `https://gitlab.example.com/acme/demo-app/-/merge_requests/${p.number}`,
    user_notes_count: p.comments.length,
    detailed_merge_status: 'mergeable',
    diff_refs: { base_sha: p.baseSha },
  })
  const checksOf = (sha: string) => pulls.find((p) => p.headSha === sha)?.checks ?? []
  const GH = '^/api/v3/repos/acme/demo-app'
  const GL = '^/api/v4/projects/(?:acme%2Fdemo-app|1)'
  const routes: [string, RegExp, Handler][] = [
    // GitHub
    ['GET', /^\/api\/v3\/user$/, () => [200, { login: USER }]],
    ['GET', new RegExp(`${GH}$`), () => [200, { default_branch: 'main', allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false, delete_branch_on_merge: false }]],
    [
      'GET',
      new RegExp(`${GH}/pulls$`),
      (_m, _b, q) => {
        const state = q.get('state')
        return [200, pulls.filter((p) => state === 'all' || (state === 'open') === (p.state === 'open')).map(gh)]
      },
    ],
    [
      'POST',
      new RegExp(`${GH}/pulls$`),
      (_m, b) => {
        const [fork, head] = String(b.head).includes(':') ? String(b.head).split(':') : [undefined, String(b.head)]
        const p: FakePull = {
          number: Math.max(0, ...pulls.map((x) => x.number)) + 1,
          title: String(b.title),
          body: String(b.body ?? ''),
          author: USER,
          state: 'open',
          draft: b.draft === true,
          head: head ?? '',
          headSha: '0'.repeat(40),
          ...(fork ? { fork } : {}),
          base: String(b.base),
          baseSha: '0'.repeat(40),
          comments: [],
          commits: [],
          checks: [],
          updatedAt: now(),
        }
        pulls.unshift(p)
        return [201, gh(p)]
      },
    ],
    ['GET', new RegExp(`${GH}/pulls/(\\d+)$`), (m) => withPull(m[1] ?? '', (p) => [200, gh(p)])],
    [
      'PATCH',
      new RegExp(`${GH}/pulls/(\\d+)$`),
      (m, b) =>
        withPull(m[1] ?? '', (p) => {
          p.state = b.state === 'open' ? 'open' : 'closed'
          return [200, gh(p)]
        }),
    ],
    [
      'PUT',
      new RegExp(`${GH}/pulls/(\\d+)/merge$`),
      (m, b) =>
        withPull(m[1] ?? '', (p) => {
          if (b.sha !== p.headSha) return [409, { message: 'Head branch was modified. Review and try the merge again.' }]
          p.state = 'merged'
          return [200, { merged: true }]
        }),
    ],
    [
      'GET',
      new RegExp(`${GH}/pulls/(\\d+)/commits$`),
      (m) =>
        withPull(m[1] ?? '', (p) => [
          200,
          p.commits.map((c) => ({ sha: c.sha, author: { login: p.author }, commit: { message: c.message, author: { name: p.author, date: c.at }, committer: { date: c.at } } })),
        ]),
    ],
    [
      'GET',
      new RegExp(`${GH}/issues/(\\d+)/comments$`),
      (m) => withPull(m[1] ?? '', (p) => [200, p.comments.map((c, i) => ({ id: i + 1, user: { login: c.author }, body: c.body, created_at: c.at }))]),
    ],
    [
      'POST',
      new RegExp(`${GH}/issues/(\\d+)/comments$`),
      (m, b) =>
        withPull(m[1] ?? '', (p) => {
          p.comments.push({ author: USER, body: String(b.body), at: now() })
          return [201, {}]
        }),
    ],
    ['GET', new RegExp(`${GH}/commits/(\\w+)/status$`), (m) => [200, { statuses: checksOf(m[1] ?? '').map((c) => ({ context: c.name, state: c.state === 'queued' ? 'pending' : c.state, target_url: null, created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:02:00Z' })) }]],
    ['GET', new RegExp(`${GH}/commits/(\\w+)/check-runs$`), () => [200, { check_runs: [] }]],
    ['DELETE', new RegExp(`${GH}/git/refs/heads/.+$`), () => [204, null]],
    // GitLab: il progetto acme/demo-app (id 1) e il fork di grace (id 2)
    ['GET', /^\/api\/v4\/user$/, () => [200, { username: USER }]],
    ['GET', new RegExp(`${GL}$`), () => [200, { id: 1, default_branch: 'main', merge_method: 'merge', squash_option: 'default_off', remove_source_branch_after_merge: true, namespace: { full_path: 'acme' } }]],
    ['GET', /^\/api\/v4\/projects\/2$/, () => [200, { id: 2, default_branch: 'main', namespace: { full_path: 'grace' } }]],
    [
      'GET',
      new RegExp(`${GL}/merge_requests$`),
      (_m, _b, q) => [200, pulls.filter((p) => q.get('state') === 'all' || gl(p).state === q.get('state')).map(gl)],
    ],
    ['GET', new RegExp(`${GL}/merge_requests/(\\d+)$`), (m) => withPull(m[1] ?? '', (p) => [200, gl(p)])],
    [
      'GET',
      new RegExp(`${GL}/merge_requests/(\\d+)/notes$`),
      (m) => withPull(m[1] ?? '', (p) => [200, p.comments.map((c, i) => ({ id: i + 1, body: c.body, author: { username: c.author }, created_at: c.at, system: false }))]),
    ],
    [
      'GET',
      new RegExp(`${GL}/merge_requests/(\\d+)/commits$`),
      (m) => withPull(m[1] ?? '', (p) => [200, p.commits.map((c) => ({ id: c.sha, title: c.message.split('\n')[0], author_name: p.author, created_at: c.at }))]),
    ],
    [
      'GET',
      new RegExp(`${GL}/pipelines$`),
      (_m, _b, q) => {
        const p = pulls.find((x) => x.headSha === q.get('sha'))
        return [200, p?.checks.length ? [{ id: p.number }] : []]
      },
    ],
    [
      'GET',
      new RegExp(`${GL}/pipelines/(\\d+)/jobs$`),
      (m) =>
        withPull(m[1] ?? '', (p) => [
          200,
          p.checks
            .map((c, i) => ({
              id: i + 1,
              name: c.name,
              stage: c.stage ?? 'test',
              status: JOB[c.state],
              web_url: 'https://ci.example.com/job',
              // Tempi relativi a ora: i finiti sono durati 2 minuti, quelli in corso girano da 6
              started_at: c.state === 'queued' ? null : minutesAgo(c.state === 'pending' ? 6 : 8),
              finished_at: c.state === 'success' || c.state === 'failure' ? minutesAgo(6) : null,
            }))
            .reverse(),
        ]),
    ],
  ]

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const text = Buffer.concat(chunks).toString()
      const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>
      requests.push({ line: `${req.method} ${url.pathname}`, body })
      const authorized = req.headers.authorization === `Bearer ${TOKEN}` || req.headers['private-token'] === TOKEN
      let reply: Reply = authorized ? [404, { message: 'Not Found' }] : [401, { message: 'Bad credentials' }]
      for (const [method, path, handle] of authorized ? routes : []) {
        const m = path.exec(url.pathname)
        if (m && method === req.method) {
          reply = handle(m, body, url.searchParams)
          break
        }
      }
      res.writeHead(reply[0], { 'content-type': 'application/json' })
      res.end(reply[1] === null ? '' : JSON.stringify(reply[1]))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    pulls,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const rev = (repo: string) => git(repo, 'rev-parse', 'HEAD').trim()

/**
 * Un "server" git (repo bare) con due PR scritte da un altro clone: #1 dello stesso repo (feature/login) e #2 da un
 * fork (su nessun branch). Il clone dell'utente non ha i loro oggetti e il suo origin ha l'URL di un server finto
 * (https://<host>/acme/demo-app.git), riscritto con insteadOf sul repo bare.
 */
export function demoRepo(host: string, prRef: (n: number) => string) {
  const { bare, clone } = makeRemotePair()
  const author = cloneOf(bare)
  const baseSha = rev(author)
  git(author, 'switch', '-q', '-c', 'feature/login')
  commitFile(author, 'login.txt', 'login\n', 'Add the login page')
  git(author, 'push', '-q', 'origin', 'feature/login', `HEAD:${prRef(1)}`)
  const loginSha = rev(author)
  git(author, 'switch', '-q', '--detach', baseSha)
  commitFile(author, 'typo.txt', 'fixed\n', 'Fix a typo')
  git(author, 'push', '-q', 'origin', `HEAD:${prRef(2)}`)
  const forkSha = rev(author)
  const url = `https://${host}/acme/demo-app.git`
  git(clone, 'remote', 'set-url', 'origin', url)
  git(clone, 'config', `url.${bare}.insteadOf`, url)
  return { bare, clone, baseSha, loginSha, forkSha }
}

/** Le PR del repo di prova: #1 aperta con CI superata, #2 da fork con CI fallita, #3 unita. */
export function demoPulls(r: ReturnType<typeof demoRepo>): FakePull[] {
  const at = (hour: number) => new Date(Date.UTC(2026, 9, 20, hour)).toISOString()
  return [
    {
      number: 1,
      title: 'Add the login page',
      body: 'Adds **login** with a form.',
      author: 'ada',
      state: 'open',
      head: 'feature/login',
      headSha: r.loginSha,
      base: 'main',
      baseSha: r.baseSha,
      comments: [{ author: 'grace', body: 'Looks good', at: at(11) }],
      commits: [{ sha: r.loginSha, message: 'Add the login page', at: at(10) }],
      checks: [{ name: 'test', state: 'success' }],
      updatedAt: at(12),
    },
    {
      number: 2,
      title: 'Fix a typo',
      body: '',
      author: 'grace',
      state: 'open',
      head: 'fix-typo',
      headSha: r.forkSha,
      fork: 'grace',
      base: 'main',
      baseSha: r.baseSha,
      comments: [],
      commits: [{ sha: r.forkSha, message: 'Fix a typo', at: at(9) }],
      checks: [{ name: 'test', state: 'failure' }],
      updatedAt: at(11),
    },
    {
      number: 3,
      title: 'Old experiment',
      body: '',
      author: 'ada',
      state: 'merged',
      head: 'old',
      headSha: r.baseSha,
      base: 'main',
      baseSha: r.baseSha,
      comments: [],
      commits: [],
      checks: [],
      updatedAt: at(8),
    },
  ]
}
