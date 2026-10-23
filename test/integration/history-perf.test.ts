import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { History } from '../../src/main/history'

// Lento (crea 100.000 commit): MERLINO_PERF=1 npx vitest run test/integration/history-perf.test.ts
describe.skipIf(!process.env.MERLINO_PERF)('prestazioni della storia', () => {
  it('100.000 commit in meno di 2 secondi', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'merlino-big-')), 'big')
    execFileSync(process.execPath, ['scripts/make-big-repo.mjs', dir, '100000'])
    const h = new History(new GitRunner(() => 'git', dir))
    const start = performance.now()
    const summary = await h.load('')
    const ms = performance.now() - start
    console.log(`load: ${Math.round(ms)} ms, ${summary.total} commit, ${summary.lanes} colonne`)
    expect(summary.total).toBeGreaterThanOrEqual(100_000)
    expect(ms).toBeLessThan(2000)
  }, 600_000)
})
