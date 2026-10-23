import { describe, expect, it } from 'vitest'
import { defaultMergeMessage, headLabel, matches, pickRemote, splitUpstream } from '../../src/renderer/pull-requests/model'
import type { HostingAccount, PullRequestDetail, PullRequestRemote } from '../../src/shared/types'

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
