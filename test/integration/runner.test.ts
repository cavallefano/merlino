import { describe, expect, it } from 'vitest'
import { GitError, GitRunner } from '../../src/main/git/runner'
import type { CommandLogEntry } from '../../src/shared/types'
import { makeRepo } from '../helpers/repo'

// "git" finto: node, per provare coda e stdin senza dipendere dai tempi di git
const node = () => process.execPath

describe('GitRunner', () => {
  it('esegue git e restituisce stdout', async () => {
    const r = await new GitRunner(() => 'git', makeRepo()).run(['rev-parse', '--abbrev-ref', 'HEAD'])
    expect(r.stdout.trim()).toBe('main')
    expect(r.exitCode).toBe(0)
  })

  it('rifiuta con GitError e registra il comando fallito', async () => {
    const log: CommandLogEntry[] = []
    const runner = new GitRunner(() => 'git', makeRepo(), (e) => log.push(e))
    const err = await runner.run(['rev-parse', '--verify', 'nope']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitError)
    expect((err as GitError).info.exitCode).toBe(128)
    expect((err as GitError).info.message).toMatch(/^fatal:/)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ args: ['rev-parse', '--verify', 'nope'], exitCode: 128, ok: false })
  })

  it('okCodes: un exit code previsto non è un errore', async () => {
    const r = await new GitRunner(() => 'git', makeRepo()).run(['rev-parse', '--verify', '-q', 'nope'], { okCodes: [0, 1] })
    expect(r.exitCode).toBe(1)
  })

  it('passa stdin al processo', async () => {
    const r = await new GitRunner(node, process.cwd()).run(['-e', 'process.stdin.pipe(process.stdout)'], { stdin: 'ciao' })
    expect(r.stdout).toBe('ciao')
  })

  it('esegue le scritture una alla volta, anche dopo un errore', async () => {
    const log: CommandLogEntry[] = []
    const runner = new GitRunner(node, process.cwd(), (e) => log.push(e))
    const script = (ms: number, code: number) => ['-e', `setTimeout(() => process.exit(${code}), ${ms})`]
    await Promise.allSettled([
      runner.run(script(150, 1), { write: true }),
      runner.run(script(10, 0), { write: true }),
    ])
    const [first, second] = log
    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
    expect(second.startedAt).toBeGreaterThanOrEqual(first.startedAt + first.durationMs)
  })

  it('le letture non aspettano le scritture', async () => {
    const log: CommandLogEntry[] = []
    const runner = new GitRunner(node, process.cwd(), (e) => log.push(e))
    await Promise.all([
      runner.run(['-e', 'setTimeout(() => {}, 300)'], { write: true }),
      runner.run(['-e', '0']),
    ])
    expect(log[0].args).toEqual(['-e', '0'])
  })

  it('eseguibile mancante: GitError con exitCode null', async () => {
    const err = await new GitRunner(() => '/percorso/inesistente/git', process.cwd()).run(['--version']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitError)
    expect((err as GitError).info.exitCode).toBeNull()
  })
})
