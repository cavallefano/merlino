import { describe, expect, it } from 'vitest'
import { diffFlags } from '../../src/main/git/diff'
import { commitTemplates, diffOptions, gitConfigEntry, gitUrl, limitedText, mergeOptions, newPullRequest, preferences, prNumber, refName, repoCommand, revision, server, token } from '../../src/main/validate'
import { DEFAULT_PREFERENCES } from '../../src/shared/preferences'

describe('validazione degli argomenti dal renderer', () => {
  it('account e pull request', () => {
    expect(server(' GitLab.Example.com:8443 ')).toBe('gitlab.example.com:8443')
    for (const bad of ['https://github.com', 'github.com/acme', '-x', 'a b', '']) expect(() => server(bad)).toThrow()
    expect(token(' ghp_abc ')).toBe('ghp_abc')
    expect(() => token('ab cd')).toThrow()
    expect(prNumber(42)).toBe(42)
    for (const bad of [0, -1, 1.5, '3']) expect(() => prNumber(bad)).toThrow()
    expect(() => limitedText('x'.repeat(11), 'testo', 10)).toThrow()
    expect(() => limitedText('  ', 'testo', 10, true)).toThrow()
    expect(mergeOptions({ method: 'squash', sha: 'abc1234', message: 'x', deleteBranch: 1 })).toEqual({ method: 'squash', sha: 'abc1234', message: 'x', squash: false, deleteBranch: false })
    expect(() => mergeOptions({ method: 'octopus', sha: 'abc1234' })).toThrow()
    expect(() => mergeOptions({ method: 'merge', sha: 'HEAD' })).toThrow()
    const pr = { remote: 'origin', base: 'main', headRemote: 'origin', head: 'feature/a', title: ' Login ', draft: 'yes' }
    expect(newPullRequest(pr)).toEqual({ remote: 'origin', base: 'main', headRemote: 'origin', head: 'feature/a', title: 'Login', body: '', draft: false })
    for (const bad of [{ title: '   ' }, { title: 'x'.repeat(257) }, { head: '--force' }, { remote: 'a b' }]) expect(() => newPullRequest({ ...pr, ...bad })).toThrow()
  })

  it('nomi di ref: niente opzioni travestite né caratteri non ammessi da git', () => {
    expect(refName('feature/login-2')).toBe('feature/login-2')
    for (const bad of ['--force', '-d', 'a b', 'a..b', 'a~1', 'a:b', 'x@{1}', 'a\tb']) expect(() => refName(bad)).toThrow()
  })

  it('revisioni e URL', () => {
    expect(revision('HEAD~2')).toBe('HEAD~2')
    expect(() => revision('--upload-pack=x')).toThrow()
    expect(gitUrl('git@host:team/app.git')).toBe('git@host:team/app.git')
    expect(() => gitUrl('--upload-pack=touch /tmp/x')).toThrow()
  })

  it('comandi del drag & drop', () => {
    expect(repoCommand({ kind: 'pushBranch', remote: 'origin', branch: 'feature/a', remoteBranch: 'feature/a' })).toEqual({
      kind: 'pushBranch',
      remote: 'origin',
      branch: 'feature/a',
      remoteBranch: 'feature/a',
    })
    expect(repoCommand({ kind: 'stashFiles', paths: ['a.txt'], untracked: 1 })).toEqual({ kind: 'stashFiles', paths: ['a.txt'], untracked: false })
    for (const bad of [
      { kind: 'pushBranch', remote: 'origin', branch: 'a:b', remoteBranch: 'a' },
      { kind: 'fastForward', branch: '-x', from: 'origin/main' },
      { kind: 'stashFiles', paths: ['../fuori'] },
      { kind: 'stashFiles', paths: [] },
      { kind: 'applyFileChanges', sha: 'HEAD', path: 'a.txt' },
    ]) expect(() => repoCommand(bad)).toThrow()
  })

  it('comandi: tiene solo i campi della variante e rifiuta i tipi sconosciuti', () => {
    expect(repoCommand({ kind: 'push', remote: 'origin', force: 'yes', extra: 1 })).toEqual({ kind: 'push', remote: 'origin', force: false })
    expect(repoCommand({ kind: 'reset', sha: 'abc1234', mode: 'hard' })).toEqual({ kind: 'reset', sha: 'abc1234', mode: 'hard' })
    expect(() => repoCommand({ kind: 'reset', sha: 'abc1234', mode: 'keep' })).toThrow()
    expect(() => repoCommand({ kind: 'exec', args: ['rm'] })).toThrow()
    expect(repoCommand({ kind: 'rebaseInteractive', sha: 'abc1234', steps: [{ sha: 'abc1234', action: 'reword', message: 'x' }] })).toEqual({
      kind: 'rebaseInteractive',
      sha: 'abc1234',
      steps: [{ sha: 'abc1234', action: 'reword', message: 'x' }],
    })
  })
})

describe('preferenze', () => {
  it('valida il risultato della modifica e scarta i campi sconosciuti', () => {
    expect(preferences(DEFAULT_PREFERENCES, { theme: 'dark', extra: 1 })).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark' })
    expect(preferences(DEFAULT_PREFERENCES, { bodyGuide: 0 }).bodyGuide).toBe(0)
    expect(preferences(DEFAULT_PREFERENCES, { editorApp: '/Applications/Code.app' }).editorApp).toBe('/Applications/Code.app')
  })

  it('rifiuta valori fuori intervallo, tipi sbagliati e vincoli fra campi violati', () => {
    for (const bad of [
      { theme: 'blu' },
      { autoFetchMinutes: 61 },
      { autoFetchMinutes: 1.5 },
      { diffContext: 0 },
      { bodyGuide: 20 },
      { fetchPrune: 'sì' },
      { diffAlgorithm: 'git' },
      { editorApp: 'Code.app' },
      { subjectLimit: 40 }, // sotto subjectWarn (50)
    ]) expect(() => preferences(DEFAULT_PREFERENCES, bad)).toThrow()
    expect(() => preferences({ ...DEFAULT_PREFERENCES, subjectLimit: 60 }, { subjectWarn: 70 })).toThrow()
  })
})

describe('opzioni del diff', () => {
  it('default 3 righe e algoritmo di git; valori fuori intervallo rifiutati', () => {
    expect(diffOptions({ ignoreWhitespace: true })).toEqual({ ignoreWhitespace: true, force: false, context: 3, algorithm: 'default' })
    expect(() => diffOptions({ context: 0 })).toThrow()
    expect(() => diffOptions({ algorithm: '--output=x' })).toThrow()
  })

  it('argomenti per git', () => {
    expect(diffFlags({ ignoreWhitespace: false, force: false })).toEqual(['-U3'])
    expect(diffFlags({ ignoreWhitespace: true, force: false, context: 1, algorithm: 'patience' })).toEqual(['-U1', '--diff-algorithm=patience', '-w'])
  })
})

describe('config globale di git', () => {
  it('solo le chiavi gestite, con i valori ammessi', () => {
    expect(gitConfigEntry('user.name', '  Ada  ')).toEqual(['user.name', 'Ada'])
    expect(gitConfigEntry('pull.rebase', '')).toEqual(['pull.rebase', ''])
    expect(gitConfigEntry('gpg.format', 'ssh')).toEqual(['gpg.format', 'ssh'])
    for (const [k, v] of [
      ['core.editor', 'vim'],
      ['user.name', '--global'],
      ['user.name', 'a\nb'],
      ['gpg.format', 'pgp'],
      ['commit.gpgsign', 'yes'],
      ['init.defaultBranch', 'a b'],
    ]) expect(() => gitConfigEntry(k, v)).toThrow()
  })
})

describe('template di commit', () => {
  const t = { id: 'a1', name: ' Feature ', subject: 'feat: ', body: '' }
  it('nome con trim, campi in più scartati, elenco vuoto ammesso', () => {
    expect(commitTemplates([{ ...t, extra: 1 }])).toEqual([{ id: 'a1', name: 'Feature', subject: 'feat: ', body: '' }])
    expect(commitTemplates([])).toEqual([])
  })
  it('rifiuta id non validi o doppi, nomi vuoti, testi troppo lunghi, troppi template', () => {
    for (const bad of [
      [{ ...t, id: 'a b' }],
      [t, t],
      [{ ...t, name: '  ' }],
      [{ ...t, subject: 'x'.repeat(501) }],
      Array.from({ length: 201 }, (_, i) => ({ ...t, id: `t${i}` })),
      'nope',
    ]) expect(() => commitTemplates(bad)).toThrow()
  })
})
