import { describe, expect, it } from 'vitest'
import { diffFlags } from '../../src/main/git/diff'
import { diffOptions, gitUrl, preferences, refName, repoCommand, revision } from '../../src/main/validate'
import { DEFAULT_PREFERENCES } from '../../src/shared/preferences'

describe('validazione degli argomenti dal renderer', () => {
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
