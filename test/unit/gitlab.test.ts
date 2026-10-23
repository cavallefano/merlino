import { describe, expect, it } from 'vitest'
import { GitLab, type GlMergeRequest } from '../../src/main/hosting/gitlab'
import { fakeService, type Route } from '../helpers/hosting'

function gitlab(routes: Route[]) {
  const { client, requests } = fakeService('gitlab', 'gitlab.example.com', routes)
  return { gl: new GitLab(client), requests }
}

const P = '/api/v4/projects/acme%2Fdemo-app'
const mr = (iid: number, extra: Partial<GlMergeRequest> = {}): GlMergeRequest => ({
  iid,
  title: `MR ${iid}`,
  description: null,
  author: { username: 'ada' },
  state: 'opened',
  draft: false,
  source_branch: 'feature/login',
  target_branch: 'main',
  sha: 'a'.repeat(40),
  source_project_id: 1,
  target_project_id: 1,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  web_url: `https://gitlab.example.com/acme/demo-app/-/merge_requests/${iid}`,
  user_notes_count: 2,
  ...extra,
})

describe('GitLab', () => {
  it('lista: stato e progetto codificato, anche con i sottogruppi', async () => {
    const { gl } = gitlab([['GET', '/api/v4/projects/acme%2Fbackend%2Fdemo-app/merge_requests?state=merged&order_by=updated_at&sort=desc&per_page=100', [mr(4, { state: 'merged' })]]])
    expect(await gl.list('acme/backend/demo-app', 'merged')).toMatchObject([{ number: 4, state: 'merged', body: '', comments: 2, fork: false }])
  })

  it('dettaglio: note di sistema escluse, base_sha, fork col gruppo, motivo del blocco', async () => {
    const { gl } = gitlab([
      ['GET', `${P}/merge_requests/5`, mr(5, { source_project_id: 2, detailed_merge_status: 'not_approved', diff_refs: { base_sha: 'b'.repeat(40) } })],
      [
        'GET',
        `${P}/merge_requests/5/notes?sort=asc&order_by=created_at&per_page=100`,
        [
          { id: 1, body: 'added 1 commit', author: { username: 'ada' }, created_at: '2026-10-01T11:00:00Z', system: true },
          { id: 2, body: 'Ottimo', author: { username: 'grace' }, created_at: '2026-10-01T12:00:00Z', system: false },
        ],
      ],
      ['GET', `${P}/merge_requests/5/commits?per_page=100`, [{ id: 'c1', title: 'Primo', author_name: 'Ada', created_at: '2026-10-01T10:30:00Z' }]],
      ['GET', '/api/v4/projects/2', { id: 2, default_branch: 'main', namespace: { full_path: 'grace' } }],
    ])
    const d = await gl.detail('acme/demo-app', 5)
    expect(d).toMatchObject({ fork: true, headOwner: 'grace', baseSha: 'b'.repeat(40), mergeBlock: 'approvals' })
    expect(d.timeline.map((x) => x.kind)).toEqual(['commit', 'comment'])
  })

  it('CI: la pipeline dello SHA e i suoi job; senza pipeline nessun check', async () => {
    const sha = 'a'.repeat(40)
    const { gl } = gitlab([
      ['GET', `${P}/pipelines?sha=${sha}&per_page=1`, [{ id: 7 }]],
      [
        'GET',
        `${P}/pipelines/7/jobs?per_page=100`,
        [
          { name: 'lint', status: 'success', web_url: 'https://gitlab.example.com/j/1' },
          { name: 'test', status: 'running', web_url: 'https://gitlab.example.com/j/2' },
          { name: 'deploy', status: 'manual', web_url: 'https://gitlab.example.com/j/3' },
        ],
      ],
      ['GET', `${P}/pipelines?sha=${'c'.repeat(40)}&per_page=1`, []],
    ])
    expect(await gl.checks('acme/demo-app', sha)).toMatchObject({ summary: 'running', checks: [{ state: 'passed' }, { state: 'running' }, { state: 'skipped' }] })
    expect(await gl.checks('acme/demo-app', 'c'.repeat(40))).toEqual({ summary: 'none', checks: [] })
  })

  it('merge: squash col suo messaggio, branch da eliminare, SHA', async () => {
    const { gl, requests } = gitlab([['PUT', `${P}/merge_requests/5/merge`, {}]])
    await gl.merge('acme/demo-app', 5, { method: 'merge', sha: 'a'.repeat(40), message: 'Login', squash: true, deleteBranch: true })
    expect(requests[0]?.body).toEqual({ sha: 'a'.repeat(40), squash: true, should_remove_source_branch: true, squash_commit_message: 'Login' })
  })

  it('chiusura e riapertura con state_event', async () => {
    const { gl, requests } = gitlab([['PUT', `${P}/merge_requests/5`, mr(5)]])
    await gl.setState('acme/demo-app', 5, 'closed')
    await gl.setState('acme/demo-app', 5, 'open')
    expect(requests.map((r) => r.body)).toEqual([{ state_event: 'close' }, { state_event: 'reopen' }])
  })

  it('creazione: bozza col prefisso Draft:, da un fork col progetto di destinazione', async () => {
    const { gl, requests } = gitlab([
      ['GET', P, { id: 1, default_branch: 'main', namespace: { full_path: 'acme' } }],
      ['POST', '/api/v4/projects/grace%2Fdemo-app/merge_requests', mr(8)],
    ])
    const input = { remote: 'upstream', base: 'main', headRemote: 'origin', head: 'feature/login', title: 'Login', body: 'Corpo', draft: true }
    expect(await gl.create('acme/demo-app', 'grace/demo-app', input)).toBe(8)
    expect(requests[1]?.body).toEqual({ source_branch: 'feature/login', target_branch: 'main', title: 'Draft: Login', description: 'Corpo', target_project_id: 1 })
  })

  it('impostazioni del progetto: metodo, squash, cancellazione del branch', async () => {
    const { gl } = gitlab([
      ['GET', P, { id: 1, default_branch: 'develop', merge_method: 'ff', squash_option: 'default_on', remove_source_branch_after_merge: true, namespace: { full_path: 'acme' } }],
    ])
    expect(await gl.repo('acme/demo-app')).toEqual({ defaultBranch: 'develop', methods: ['ff'], squash: 'default', deleteBranch: true })
  })
})
