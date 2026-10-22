import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { applyPatch, readWorkingDiff, stageFiles } from '../../src/main/git/working'
import { buildPatch, changedKeys, lineKey } from '../../src/shared/patch'
import { git, makeRepo } from '../helpers/repo'

const options = { ignoreWhitespace: false, force: false }
const lines = (n: number) => Array.from({ length: n }, (_, i) => `riga ${i + 1}`)

function setup(name = 'f.txt') {
  const repo = makeRepo(0)
  writeFileSync(join(repo, name), lines(20).join('\n') + '\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'base')
  const changed = lines(20)
  changed[1] = 'DUE'
  changed[17] = 'DICIOTTO'
  writeFileSync(join(repo, name), changed.join('\n') + '\n')
  return { repo, runner: new GitRunner(() => 'git', repo, () => {}) }
}

describe('stage e scarto di righe e blocchi con git vero', () => {
  it('stage di una sola riga aggiunta: in stage c’è solo quella', async () => {
    const { repo, runner } = setup()
    const diff = await readWorkingDiff(runner, { path: 'f.txt' }, 'unstaged', options)
    expect(diff.hunks).toHaveLength(2)
    const addLine = diff.hunks[0].lines.findIndex((l) => l.type === 'add')
    await applyPatch(runner, buildPatch(diff, new Set([lineKey(0, addLine)]), false)!, 'stage')
    // git aggiunge all'intestazione il contesto della funzione: "@@ -2,0 +3 @@ riga 2"
    expect(git(repo, 'diff', '--cached', '-U0')).toMatch(/@@ -2,0 \+3 @@.*\n\+DUE\n/)
    expect(git(repo, 'diff', '--cached', '-U0')).not.toContain('DICIOTTO')
  })

  it('unstage di un blocco e scarto di un blocco', async () => {
    const { repo, runner } = setup('con spazio è.txt')
    await stageFiles(runner, ['con spazio è.txt'])
    const staged = await readWorkingDiff(runner, { path: 'con spazio è.txt' }, 'staged', options)
    await applyPatch(runner, buildPatch(staged, changedKeys(staged, 1), true)!, 'unstage')
    expect(git(repo, 'diff', '--cached')).toContain('+DUE')
    expect(git(repo, 'diff', '--cached')).not.toContain('DICIOTTO')

    const unstaged = await readWorkingDiff(runner, { path: 'con spazio è.txt' }, 'unstaged', options)
    await applyPatch(runner, buildPatch(unstaged, changedKeys(unstaged, 0), true)!, 'discard')
    expect(git(repo, 'diff')).toBe('')
    expect(git(repo, 'diff', '--cached')).toContain('+DUE')
  })

  it('ultima riga senza a capo', async () => {
    const repo = makeRepo(0)
    writeFileSync(join(repo, 'f.txt'), 'a\nb')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'base')
    writeFileSync(join(repo, 'f.txt'), 'a\nB')
    const runner = new GitRunner(() => 'git', repo, () => {})
    const diff = await readWorkingDiff(runner, { path: 'f.txt' }, 'unstaged', options)
    await applyPatch(runner, buildPatch(diff, changedKeys(diff), false)!, 'stage')
    expect(git(repo, 'diff')).toBe('')
    expect(git(repo, 'show', ':f.txt')).toBe('a\nB')
  })
})
