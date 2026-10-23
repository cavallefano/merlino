import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { finishInfo, flowFinish, flowInit, flowStart, readFlowConfig } from '../../src/main/git/flow'
import { GitRunner } from '../../src/main/git/runner'
import { DEFAULT_FLOW_PREFIXES } from '../../src/shared/flow'
import { cloneOf, git, makeRemotePair, makeRepo } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})
const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const current = (repo: string) => git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
const exists = (repo: string, ref: string) => {
  try {
    git(repo, 'rev-parse', '--verify', '--quiet', ref)
    return true
  } catch {
    return false
  }
}
const init = { main: 'main', develop: 'develop', prefixes: DEFAULT_FLOW_PREFIXES, versionTag: 'v' }
const finish = { update: false, tagMessage: '', deleteBranch: true, deleteRemote: true, push: false }
const noProgress = () => {}

/** Repo con git flow inizializzato (develop creato da main). */
async function flowRepo() {
  const repo = makeRepo(1)
  await flowInit(runnerFor(repo), init)
  return { repo, r: runnerFor(repo) }
}

describe('git flow', () => {
  it('init: chiavi di git-flow-avh e develop creato da main; letta di nuovo uguale', async () => {
    const { repo, r } = await flowRepo()
    expect(git(repo, 'config', 'gitflow.branch.master').trim()).toBe('main')
    expect(git(repo, 'config', 'gitflow.prefix.feature').trim()).toBe('feature/')
    expect(git(repo, 'rev-parse', 'develop').trim()).toBe(git(repo, 'rev-parse', 'main').trim())
    expect(await readFlowConfig(r)).toEqual({ ...init, bases: {} })
    expect(await readFlowConfig(runnerFor(makeRepo(1)))).toBeNull()
  })

  it('init senza develop locale ma con origin/develop: develop segue il remote', async () => {
    const { bare, clone } = makeRemotePair()
    git(clone, 'push', '-q', 'origin', 'main:develop')
    const other = cloneOf(bare)
    await flowInit(runnerFor(other), init)
    expect(git(other, 'rev-parse', '--abbrev-ref', 'develop@{u}').trim()).toBe('origin/develop')
  })

  it('start: branch dalla base, checkout, base salvata, pubblicazione', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    await flowStart(r, { type: 'feature', name: 'login', base: 'develop', checkout: true, publish: 'origin' }, noProgress)
    expect(current(clone)).toBe('feature/login')
    expect(git(clone, 'config', 'gitflow.branch.feature/login.base').trim()).toBe('develop')
    expect(git(bare, 'branch', '--list', 'feature/login').trim()).toBe('feature/login')
    expect(git(clone, 'rev-parse', '--abbrev-ref', 'feature/login@{u}').trim()).toBe('origin/feature/login')
    await flowStart(r, { type: 'support', name: '0.1.x', base: 'main', checkout: false, publish: null }, noProgress)
    expect(current(clone)).toBe('feature/login')
    expect(exists(clone, 'refs/heads/support/0.1.x')).toBe(true)
    expect(() => git(clone, 'config', 'gitflow.branch.support/0.1.x.base')).toThrow()
  })

  it('finish di una feature: merge --no-ff in develop, branch cancellato anche sul remote, si resta su develop', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    await flowStart(r, { type: 'feature', name: 'login', base: 'develop', checkout: true, publish: 'origin' }, noProgress)
    commitFile(clone, 'login.txt', 'login\n', 'Add login')
    expect(await finishInfo(r, 'feature/login')).toMatchObject({ type: 'feature', name: 'login', targets: [{ branch: 'develop', merged: false }], tag: null, remote: 'origin' })
    await flowFinish(r, { branch: 'feature/login', ...finish }, noProgress)
    expect(current(clone)).toBe('develop')
    expect(git(clone, 'log', '-1', '--format=%s %p', 'develop').trim()).toMatch(/^Merge branch 'feature\/login' into develop \w+ \w+$/)
    expect(exists(clone, 'refs/heads/feature/login')).toBe(false)
    expect(git(bare, 'branch', '--list', 'feature/login').trim()).toBe('')
    expect(() => git(clone, 'config', 'gitflow.branch.feature/login.base')).toThrow()
  })

  it('finish di una release: merge in main, tag annotato sul merge, merge in develop, push', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    git(clone, 'push', '-q', '-u', 'origin', 'develop')
    await flowStart(r, { type: 'release', name: '0.2.0', base: 'develop', checkout: true, publish: null }, noProgress)
    commitFile(clone, 'version.txt', '0.2.0\n', 'Bump version')
    await flowFinish(r, { branch: 'release/0.2.0', ...finish, tagMessage: 'Release 0.2.0', push: true }, noProgress)
    const merge = git(clone, 'rev-parse', 'main').trim()
    expect(git(clone, 'log', '-1', '--format=%s', 'main').trim()).toBe("Merge branch 'release/0.2.0'")
    expect(git(clone, 'rev-parse', 'v0.2.0^{commit}').trim()).toBe(merge)
    expect(git(clone, 'cat-file', '-t', 'v0.2.0').trim()).toBe('tag')
    expect(git(clone, 'tag', '-l', '--format=%(contents:subject)', 'v0.2.0').trim()).toBe('Release 0.2.0')
    expect(git(clone, 'merge-base', '--is-ancestor', merge, 'develop').trim()).toBe('')
    expect(git(clone, 'log', '-1', '--format=%s', 'develop').trim()).toBe("Merge tag 'v0.2.0' into develop")
    expect(current(clone)).toBe('develop')
    expect(git(bare, 'rev-parse', 'main').trim()).toBe(merge)
    expect(git(bare, 'rev-parse', 'v0.2.0^{commit}').trim()).toBe(merge)
  })

  it('hotfix con una release aperta: va in main e nella release, non in develop', async () => {
    const { repo, r } = await flowRepo()
    await flowStart(r, { type: 'release', name: '0.2.0', base: 'develop', checkout: false, publish: null }, noProgress)
    await flowStart(r, { type: 'hotfix', name: '0.1.1', base: 'main', checkout: true, publish: null }, noProgress)
    commitFile(repo, 'fix.txt', 'fix\n', 'Fix crash')
    expect((await finishInfo(r, 'hotfix/0.1.1')).targets.map((x) => x.branch)).toEqual(['main', 'release/0.2.0'])
    await flowFinish(r, { branch: 'hotfix/0.1.1', ...finish, tagMessage: 'Hotfix 0.1.1' }, noProgress)
    expect(git(repo, 'log', '--format=%s', 'release/0.2.0').split('\n')).toContain('Fix crash')
    expect(git(repo, 'log', '--format=%s', 'develop').split('\n')).not.toContain('Fix crash')
    expect(current(repo)).toBe('release/0.2.0')
  })

  it('hotfix da un branch support: merge e tag nel support, non in main né in develop', async () => {
    const { repo, r } = await flowRepo()
    git(repo, 'tag', 'v0.1.0')
    await flowStart(r, { type: 'support', name: '0.1.x', base: 'v0.1.0', checkout: false, publish: null }, noProgress)
    await flowStart(r, { type: 'hotfix', name: '0.1.1', base: 'support/0.1.x', checkout: true, publish: null }, noProgress)
    commitFile(repo, 'fix.txt', 'fix\n', 'Fix on support')
    await flowFinish(r, { branch: 'hotfix/0.1.1', ...finish, tagMessage: 'Hotfix 0.1.1' }, noProgress)
    expect(git(repo, 'rev-parse', 'v0.1.1^{commit}').trim()).toBe(git(repo, 'rev-parse', 'support/0.1.x').trim())
    expect(git(repo, 'log', '--format=%s', 'main').split('\n')).not.toContain('Fix on support')
    expect(current(repo)).toBe('support/0.1.x')
  })

  it('conflitto: il finish si ferma col merge in corso; dopo la risoluzione riprende', async () => {
    const { repo, r } = await flowRepo()
    await flowStart(r, { type: 'feature', name: 'a', base: 'develop', checkout: true, publish: null }, noProgress)
    commitFile(repo, 'file1.txt', 'feature\n', 'Change on feature')
    git(repo, 'switch', '-q', 'develop')
    commitFile(repo, 'file1.txt', 'develop\n', 'Change on develop')
    await expect(flowFinish(r, { branch: 'feature/a', ...finish }, noProgress)).rejects.toThrow()
    expect(exists(repo, 'MERGE_HEAD')).toBe(true)
    writeFileSync(join(repo, 'file1.txt'), 'both\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '--no-edit')
    await flowFinish(r, { branch: 'feature/a', ...finish }, noProgress)
    expect(exists(repo, 'refs/heads/feature/a')).toBe(false)
  })

  it('release già unita in main via PR sul server: tag sul merge della PR, poi develop', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    git(clone, 'push', '-q', '-u', 'origin', 'develop')
    await flowStart(r, { type: 'release', name: '0.3.0', base: 'develop', checkout: true, publish: 'origin' }, noProgress)
    commitFile(clone, 'notes.txt', 'notes\n', 'Release notes')
    git(clone, 'push', '-q')
    // Il "server" unisce la PR in main e qualcuno aggiunge un commit dopo
    const server = cloneOf(bare)
    git(server, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #7', 'origin/release/0.3.0')
    const prMerge = git(server, 'rev-parse', 'HEAD').trim()
    commitFile(server, 'later.txt', 'later\n', 'Later work')
    git(server, 'push', '-q', 'origin', 'main')
    expect((await finishInfo(r, 'release/0.3.0')).targets[0]).toMatchObject({ branch: 'main', merged: false, upstream: 'origin/main' })
    await flowFinish(r, { branch: 'release/0.3.0', ...finish, update: true, tagMessage: 'Release 0.3.0' }, noProgress)
    expect(git(clone, 'rev-parse', 'v0.3.0^{commit}').trim()).toBe(prMerge)
    expect(git(clone, 'log', '-1', '--format=%s', 'main').trim()).toBe('Later work')
    // develop riceve il tag (come git-flow-avh), quindi anche il merge della PR
    expect(git(clone, 'merge-base', '--is-ancestor', prMerge, 'develop').trim()).toBe('')
    expect(git(clone, 'log', '-1', '--format=%s', 'develop').trim()).toBe("Merge tag 'v0.3.0' into develop")
  })

  it('destinazione separata dal suo upstream: errore chiaro', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    git(clone, 'push', '-q', '-u', 'origin', 'develop')
    await flowStart(r, { type: 'feature', name: 'b', base: 'develop', checkout: true, publish: null }, noProgress)
    commitFile(clone, 'b.txt', 'b\n', 'B')
    const other = cloneOf(bare)
    git(other, 'switch', '-q', 'develop')
    commitFile(other, 'o.txt', 'o\n', 'Other')
    git(other, 'push', '-q')
    git(clone, 'switch', '-q', 'develop')
    commitFile(clone, 'l.txt', 'l\n', 'Local')
    await expect(flowFinish(r, { branch: 'feature/b', ...finish, update: true }, noProgress)).rejects.toThrow(/develop and origin\/develop have diverged/)
  })
})
