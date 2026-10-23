import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkGit, isAtLeast, parseGitVersion } from '../../src/main/git/check'

describe('parseGitVersion', () => {
  it('legge le versioni di macOS, Windows e Linux', () => {
    expect(parseGitVersion('git version 2.50.1 (Apple Git-155)\n')).toEqual([2, 50, 1])
    expect(parseGitVersion('git version 2.45.1.windows.1\n')).toEqual([2, 45, 1])
    expect(parseGitVersion('git version 2.39\n')).toEqual([2, 39, 0])
    expect(parseGitVersion('boh')).toBeNull()
  })
})

describe('isAtLeast', () => {
  it('confronta major, minor e patch', () => {
    expect(isAtLeast([2, 35, 0], [2, 35, 0])).toBe(true)
    expect(isAtLeast([2, 34, 9], [2, 35, 0])).toBe(false)
    expect(isAtLeast([2, 100, 0], [2, 35, 0])).toBe(true)
    expect(isAtLeast([3, 0, 0], [2, 35, 0])).toBe(true)
  })
})

describe('checkGit', () => {
  it('git di sistema: ok', async () => {
    const r = await checkGit('git')
    expect(r.ok).toBe(true)
    expect(r.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('eseguibile inesistente', async () => {
    const r = await checkGit('/percorso/inesistente/git')
    expect(r).toMatchObject({ ok: false, version: null })
    expect(r.error).toContain('not found')
  })

  it.skipIf(process.platform === 'win32')('versione troppo vecchia', async () => {
    const fake = join(mkdtempSync(join(tmpdir(), 'fakegit-')), 'git')
    writeFileSync(fake, '#!/bin/sh\necho "git version 2.20.1"\n', { mode: 0o755 })
    const r = await checkGit(fake)
    expect(r).toMatchObject({ ok: false, version: '2.20.1' })
    expect(r.error).toContain('2.35.0')
  })
})
