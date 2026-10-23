import { describe, expect, it } from 'vitest'
import { ciGroups, ciProgress, defaultMergeMessage, formatDuration, headLabel, isActive, matches, pickRemote, span, splitUpstream } from '../../src/renderer/pull-requests/model'
import type { Check, CiStatus, HostingAccount, PullRequestDetail, PullRequestRemote } from '../../src/shared/types'

const pr: PullRequestDetail = {
  number: 7,
  title: 'Add login',
  body: 'Adds the form',
  author: 'ada',
  state: 'open',
  draft: false,
  head: { branch: 'feature/login', sha: 'a'.repeat(40) },
  base: { branch: 'main' },
  fork: false,
  headOwner: null,
  createdAt: 0,
  updatedAt: 0,
  comments: null,
  url: 'https://github.com/acme/demo-app/pull/7',
  baseSha: 'b'.repeat(40),
  mergeBlock: null,
  timeline: [],
}
const account: HostingAccount = { id: 'a1', service: 'github', host: 'github.com', username: 'ada' }
const remote = (name: string, withAccount: boolean, host: string | null = 'github.com'): PullRequestRemote => ({ name, host, account: withAccount ? account : null })

describe('pull request nel renderer', () => {
  it('ricerca: titolo, descrizione, autore, branch e numero', () => {
    for (const q of ['login', 'FORM', 'ada', 'feature/', 'main', '#7', '7', '']) expect(matches(pr, q), q).toBe(true)
    for (const q of ['grace', '#8', 'logout']) expect(matches(pr, q), q).toBe(false)
  })

  it('remote proposto: il ricordato, poi origin, poi il primo con un account; senza account il primo con un server', () => {
    const remotes = [remote('fork', true), remote('origin', true), remote('local', false, null)]
    expect(pickRemote(remotes, 'fork')).toBe('fork')
    expect(pickRemote(remotes, 'sparito')).toBe('origin')
    expect(pickRemote([remote('upstream', true), remote('origin', false)], null)).toBe('upstream')
    expect(pickRemote([remote('local', false, null), remote('upstream', false)], null)).toBe('upstream')
    expect(pickRemote([], null)).toBeNull()
  })

  it('messaggio proposto per il merge', () => {
    expect(defaultMergeMessage('github', 'merge', false, pr)).toBe('Merge pull request #7 from acme/feature/login\n\nAdd login')
    expect(defaultMergeMessage('github', 'squash', false, pr)).toBe('Add login (#7)\n\nAdds the form')
    expect(defaultMergeMessage('github', 'rebase', false, pr)).toBe('')
    expect(defaultMergeMessage('github', 'merge', false, { ...pr, fork: true, headOwner: 'grace' })).toBe('Merge pull request #7 from grace/feature/login\n\nAdd login')
    expect(defaultMergeMessage('gitlab', 'merge', false, pr)).toBe("Merge branch 'feature/login' into 'main'\n\nAdd login")
    expect(defaultMergeMessage('gitlab', 'merge', true, pr)).toBe('Add login')
    expect(defaultMergeMessage('gitlab', 'ff', false, pr)).toBe('')
  })

  it('branch della testa e upstream', () => {
    expect(headLabel(pr)).toBe('feature/login')
    expect(headLabel({ ...pr, fork: true, headOwner: 'grace' })).toBe('grace:feature/login')
    expect(splitUpstream('team/origin/feature/a', ['origin', 'team/origin'])).toEqual({ remote: 'team/origin', branch: 'feature/a' })
    expect(splitUpstream('origin/main', ['origin'])).toEqual({ remote: 'origin', branch: 'main' })
    expect(splitUpstream(null, ['origin'])).toBeNull()
  })
})

const job = (name: string, state: Check['state'], group: string | null, startedAt: number | null = null, finishedAt: number | null = null): Check => ({
  name,
  state,
  url: null,
  group,
  startedAt,
  finishedAt,
})
const status = (checks: Check[]): CiStatus => ({ summary: 'running', checks })

describe('avanzamento delle pipeline', () => {
  const checks = [
    job('compile', 'passed', 'build', 100, 160),
    job('lint', 'skipped', 'build'),
    job('unit', 'running', 'test', 200),
    job('api', 'failed', 'test', 210, 260),
    job('e2e', 'queued', 'test'),
    job('deploy', 'queued', 'deploy'),
  ]

  it('conteggi, finiti, gruppo in corso, inizio, attiva', () => {
    expect(ciProgress(status(checks))).toEqual({
      total: 6,
      done: 3,
      counts: { passed: 1, failed: 1, running: 1, queued: 2, skipped: 1, cancelled: 0 },
      current: 'test',
      startedAt: 100,
      active: true,
    })
    // Senza job in corso, il gruppo in corso è il primo in coda
    expect(ciProgress(status([job('a', 'passed', 'build', 1, 2), job('b', 'queued', 'deploy')])).current).toBe('deploy')
    expect(isActive(status([job('a', 'passed', 'build'), job('b', 'failed', 'test')]))).toBe(false)
    expect(isActive(status([job('a', 'failed', 'build'), job('b', 'queued', 'test')]))).toBe(true)
  })

  it('gruppi nell\'ordine dei job, con stato e durata', () => {
    expect(ciGroups(checks, 300).map((g) => [g.name, g.state, `${g.done}/${g.total}`, g.duration])).toEqual([
      ['build', 'passed', '2/2', 60],
      ['test', 'failed', '1/3', 100],
      ['deploy', 'queued', '0/1', null],
    ])
    expect(ciGroups([job('x', 'running', null, 10)], 70)[0]).toMatchObject({ name: null, state: 'running', duration: 60 })
  })

  it('durata di un job e formato', () => {
    expect(span([job('a', 'passed', null, 100, 145)], 999)).toBe(45)
    expect(span([job('a', 'running', null, 100)], 160)).toBe(60)
    expect(span([job('a', 'queued', null)], 160)).toBeNull()
    expect([formatDuration(40.4), formatDuration(360), formatDuration(4320), formatDuration(-5)]).toEqual(['40 s', '6 min', '1 h 12 min', '0 s'])
  })
})
