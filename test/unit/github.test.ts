import { describe, expect, it } from 'vitest'
import { type GhPull, GitHub } from '../../src/main/hosting/github'
import { fakeService, type Route } from '../helpers/hosting'

function github(routes: Route[]) {
  const { client, requests } = fakeService('github', 'github.com', routes)
  return { gh: new GitHub(client), requests }
}

const repo = (owner: string) => ({ full_name: `${owner}/demo-app`, owner: { login: owner } })
const pull = (n: number, extra: Partial<GhPull> = {}): GhPull => ({
  number: n,
  title: `PR ${n}`,
  body: 'Descrizione',
  user: { login: 'ada' },
  state: 'open',
  draft: false,
  merged_at: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  html_url: `https://github.com/acme/demo-app/pull/${n}`,
  head: { ref: 'feature/login', sha: 'a'.repeat(40), repo: repo('acme') },
  base: { ref: 'main', sha: 'b'.repeat(40), repo: repo('acme') },
  ...extra,
})
const closedList = '/repos/acme/demo-app/pulls?state=closed&sort=updated&direction=desc&per_page=100'

describe('GitHub', () => {
  it('lista: closed comprende le unite, separate con merged_at; fork col proprietario', async () => {
    const merged = pull(2, { state: 'closed', merged_at: '2026-10-03T10:00:00Z' })
    const fork = pull(3, { state: 'closed', head: { ref: 'fix', sha: 'c'.repeat(40), repo: repo('grace') } })
    const { gh } = github([['GET', closedList, [merged, fork]]])
    expect((await gh.list('acme/demo-app', 'merged')).map((p) => p.number)).toEqual([2])
    expect(await gh.list('acme/demo-app', 'closed')).toMatchObject([
      { number: 3, state: 'closed', fork: true, headOwner: 'grace', comments: null, updatedAt: Date.parse('2026-10-02T10:00:00Z') / 1000 },
    ])
  })

  it('dettaglio: commenti e commit in ordine di tempo, motivo del blocco, commenti contati', async () => {
    const { gh } = github([
      ['GET', '/repos/acme/demo-app/pulls/1', pull(1, { mergeable_state: 'dirty', comments: 1, review_comments: 2 })],
      ['GET', '/repos/acme/demo-app/issues/1/comments?per_page=100', [{ id: 7, user: { login: 'grace' }, body: 'Fatto?', created_at: '2026-10-01T12:00:00Z' }]],
      [
        'GET',
        '/repos/acme/demo-app/pulls/1/commits?per_page=100',
        [
          { sha: 'c1', author: { login: 'ada' }, commit: { message: 'Primo\n\ncorpo', author: { name: 'Ada', date: '2026-10-01T11:00:00Z' }, committer: { date: '2026-10-01T11:00:00Z' } } },
          { sha: 'c2', author: null, commit: { message: 'Secondo', author: { name: 'Ada', date: '2026-10-01T13:00:00Z' }, committer: { date: '2026-10-01T13:00:00Z' } } },
        ],
      ],
    ])
    const d = await gh.detail('acme/demo-app', 1)
    expect(d).toMatchObject({ baseSha: 'b'.repeat(40), mergeBlock: 'conflicts', comments: 3 })
    expect(d.timeline.map((x) => (x.kind === 'commit' ? x.subject : x.body))).toEqual(['Primo', 'Fatto?', 'Secondo'])
    expect(d.timeline[2]).toMatchObject({ author: 'Ada' })
  })

  it('CI: stati combinati e check run', async () => {
    const sha = 'a'.repeat(40)
    const { gh } = github([
      ['GET', `/repos/acme/demo-app/commits/${sha}/status`, { statuses: [{ context: 'lint', state: 'success', target_url: 'https://ci.example.com/1' }] }],
      [
        'GET',
        `/repos/acme/demo-app/commits/${sha}/check-runs?per_page=100`,
        {
          check_runs: [
            { name: 'test', status: 'completed', conclusion: 'failure', html_url: null },
            { name: 'build', status: 'in_progress', conclusion: null, html_url: null },
            { name: 'docs', status: 'completed', conclusion: 'skipped', html_url: null },
          ],
        },
      ],
    ])
    expect(await gh.checks('acme/demo-app', sha)).toEqual({
      summary: 'failed',
      checks: [
        { name: 'lint', state: 'passed', url: 'https://ci.example.com/1' },
        { name: 'test', state: 'failed', url: null },
        { name: 'build', state: 'running', url: null },
        { name: 'docs', state: 'skipped', url: null },
      ],
    })
  })

  it('merge: metodo, SHA e messaggio; poi cancella il branch, ma non quello di un fork', async () => {
    const options = { method: 'squash' as const, sha: 'a'.repeat(40), message: 'Titolo (#1)\n\nCorpo', squash: false, deleteBranch: true }
    const { gh, requests } = github([
      ['GET', '/repos/acme/demo-app/pulls/1', pull(1)],
      ['PUT', '/repos/acme/demo-app/pulls/1/merge', { merged: true }],
      ['DELETE', '/repos/acme/demo-app/git/refs/heads/feature/login', null],
    ])
    await gh.merge('acme/demo-app', 1, options)
    expect(requests.slice(1)).toEqual([
      { method: 'PUT', path: '/repos/acme/demo-app/pulls/1/merge', body: { merge_method: 'squash', sha: 'a'.repeat(40), commit_title: 'Titolo (#1)', commit_message: 'Corpo' } },
      { method: 'DELETE', path: '/repos/acme/demo-app/git/refs/heads/feature/login', body: undefined },
    ])

    const forked = pull(1, { head: { ref: 'fix', sha: 'a'.repeat(40), repo: repo('grace') } })
    const second = github([
      ['GET', '/repos/acme/demo-app/pulls/1', forked],
      ['PUT', '/repos/acme/demo-app/pulls/1/merge', { merged: true }],
    ])
    await second.gh.merge('acme/demo-app', 1, { ...options, method: 'rebase' })
    expect(second.requests.map((r) => r.method)).toEqual(['GET', 'PUT'])
    expect(second.requests[1]?.body).toEqual({ merge_method: 'rebase', sha: 'a'.repeat(40) })
  })

  it('creazione da un fork: head è proprietario:branch', async () => {
    const { gh, requests } = github([['POST', '/repos/acme/demo-app/pulls', pull(9)]])
    const input = { remote: 'upstream', base: 'main', headRemote: 'origin', head: 'feature/login', title: 'Login', body: '', draft: true }
    expect(await gh.create('acme/demo-app', 'grace/demo-app', input)).toBe(9)
    expect(requests[0]?.body).toEqual({ title: 'Login', body: '', head: 'grace:feature/login', base: 'main', draft: true })
  })

  it('impostazioni del repo: metodi permessi e cancellazione del branch', async () => {
    const { gh } = github([
      ['GET', '/repos/acme/demo-app', { default_branch: 'main', allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: true, delete_branch_on_merge: true }],
    ])
    expect(await gh.repo('acme/demo-app')).toEqual({ defaultBranch: 'main', methods: ['squash', 'rebase'], squash: null, deleteBranch: true })
  })
})
