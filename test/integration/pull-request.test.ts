import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { branchSummary, checkoutPullRequest, fetchPullRequest, readPullRequestChanges, readPullRequestFileDiff } from '../../src/main/git/pull-request'
import { readRemotes } from '../../src/main/git/refs'
import { GitRunner } from '../../src/main/git/runner'
import { cloneOf, git, makeRemotePair } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})
const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const rev = (repo: string, ref = 'HEAD') => git(repo, 'rev-parse', ref).trim()
const options = { ignoreWhitespace: false, force: false }

/**
 * Un "server" (repo bare) e il clone dell'utente, fatto prima delle PR (non ne ha gli oggetti).
 * PR #1 dello stesso repo: refs/pull/1/head = feature/login. PR #2 da fork: refs/merge-requests/2/head, su nessun branch.
 * Dopo l'apertura delle PR main va avanti di un commit.
 */
function server() {
  const { bare, clone: user } = makeRemotePair()
  const author = cloneOf(bare)
  const base = rev(author)
  git(author, 'switch', '-q', '-c', 'feature/login')
  commitFile(author, 'login.txt', 'login\n', 'Aggiunge il login')
  commitFile(author, 'file1.txt', '1\nmodificato\n', 'Cambia file1')
  git(author, 'push', '-q', 'origin', 'feature/login', 'HEAD:refs/pull/1/head')
  git(author, 'switch', '-q', '--detach', base)
  commitFile(author, 'fork.txt', 'fork\n', 'Dal fork')
  git(author, 'push', '-q', 'origin', 'HEAD:refs/merge-requests/2/head')
  git(author, 'switch', '-q', 'main')
  commitFile(author, 'altro.txt', 'altro\n', 'Su main')
  git(author, 'push', '-q', 'origin', 'main')
  return { bare, user, author, base, login: rev(bare, 'refs/pull/1/head'), fork: rev(bare, 'refs/merge-requests/2/head'), main: rev(bare, 'main') }
}

describe('pull request con git', () => {
  it('scarica gli oggetti senza creare ref; commit e file dal punto di partenza alla testa', async () => {
    const s = server()
    const r = runnerFor(s.user)
    const refs = git(s.user, 'for-each-ref')
    // baseSha è la punta attuale di main: i file restano quelli della PR (diff dal merge-base)
    await fetchPullRequest(r, 'origin', 'refs/pull/1/head', 'main', s.main, s.login)
    expect(git(s.user, 'for-each-ref')).toBe(refs)
    const changes = await readPullRequestChanges(r, s.main, s.login)
    expect(changes.commits.map((c) => c.subject)).toEqual(['Cambia file1', 'Aggiunge il login'])
    expect(changes.files.map((f) => [f.status, f.path, f.added])).toEqual([
      ['M', 'file1.txt', 1],
      ['A', 'login.txt', 1],
    ])
    const diff = await readPullRequestFileDiff(r, s.main, s.login, { path: 'file1.txt' }, options)
    expect(diff.hunks[0]?.lines.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(['modificato'])

    // Con gli oggetti già presenti non serve la rete, anche col server irraggiungibile
    git(s.user, 'remote', 'set-url', 'origin', join(s.bare, 'manca'))
    await expect(fetchPullRequest(r, 'origin', 'refs/pull/1/head', 'main', s.main, s.login)).resolves.toBeUndefined()
  })

  it('checkout: stesso repo con un branch che segue il remote; da fork pr/<n>, aggiornato solo in fast-forward', async () => {
    const s = server()
    const r = runnerFor(s.user)
    await checkoutPullRequest(r, 'origin', 'refs/pull/1/head', 1, 'feature/login')
    expect(git(s.user, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('feature/login')
    expect(git(s.user, 'rev-parse', '--abbrev-ref', 'feature/login@{u}').trim()).toBe('origin/feature/login')

    await checkoutPullRequest(r, 'origin', 'refs/merge-requests/2/head', 2, null)
    expect(git(s.user, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('pr/2')
    expect(rev(s.user)).toBe(s.fork)
    expect(git(s.user, 'for-each-ref', '--format=%(upstream)', 'refs/heads/pr/2').trim()).toBe('')

    // L'autore aggiunge un commit: un nuovo checkout aggiorna pr/2 anche se è il branch corrente
    git(s.author, 'switch', '-q', '--detach', s.fork)
    commitFile(s.author, 'fork2.txt', 'f\n', 'Ancora dal fork')
    git(s.author, 'push', '-q', 'origin', 'HEAD:refs/merge-requests/2/head')
    await checkoutPullRequest(r, 'origin', 'refs/merge-requests/2/head', 2, null)
    expect(rev(s.user)).toBe(rev(s.author))

    // Con commit locali su pr/2 l'aggiornamento non è un fast-forward: messaggio dedicato
    commitFile(s.user, 'locale.txt', 'l\n', 'Locale')
    git(s.user, 'switch', '-q', 'main')
    commitFile(s.author, 'fork3.txt', 'f\n', 'Terzo dal fork')
    git(s.author, 'push', '-q', 'origin', 'HEAD:refs/merge-requests/2/head')
    await expect(checkoutPullRequest(r, 'origin', 'refs/merge-requests/2/head', 2, null)).rejects.toThrow(/pr\/2 cannot be fast-forwarded/)
  })

  it('riepilogo del branch per titolo e descrizione proposti', async () => {
    const { clone } = makeRemotePair()
    git(clone, 'switch', '-q', '-c', 'feature/uno')
    commitFile(clone, 'a.txt', 'a\n', 'Titolo\n\nCorpo del commit')
    expect(await branchSummary(runnerFor(clone), 'origin/main', 'feature/uno')).toEqual({ count: 1, message: 'Titolo\n\nCorpo del commit' })
    commitFile(clone, 'b.txt', 'b\n', 'Secondo')
    expect(await branchSummary(runnerFor(clone), 'origin/main', 'feature/uno')).toEqual({ count: 2, message: '' })
  })

  it('remote con il loro URL configurato', async () => {
    const { bare, clone } = makeRemotePair()
    git(clone, 'remote', 'add', 'upstream', 'git@gitlab.example.com:acme/demo-app.git')
    expect(await readRemotes(runnerFor(clone))).toEqual([
      { name: 'origin', url: bare },
      { name: 'upstream', url: 'git@gitlab.example.com:acme/demo-app.git' },
    ])
  })
})
