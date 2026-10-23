import { describe, expect, it } from 'vitest'
import { gitUrl, refName, repoCommand, revision } from '../../src/main/validate'

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
