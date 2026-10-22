import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { readStatus } from '../../src/main/git/status'
import {
  addToGitignore,
  commit,
  discardFiles,
  lastCommitMessage,
  parseStashList,
  readStashes,
  readWorkingDiff,
  stageAll,
  stageFiles,
  stashAction,
  stashPush,
  unstageAll,
  unstageFiles,
} from '../../src/main/git/working'
import { git, makeRepo } from '../helpers/repo'

const setup = (commits = 1) => {
  const repo = makeRepo(commits)
  return { repo, runner: new GitRunner(() => 'git', repo, () => {}) }
}
const options = { ignoreWhitespace: false, force: false }

describe('modifiche locali', () => {
  it('stage, unstage e scarto di file tracciati e non tracciati', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
    writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
    await stageFiles(runner, ['file1.txt', 'nuovo.txt'])
    expect((await readStatus(runner)).staged.map((f) => f.path)).toEqual(['file1.txt', 'nuovo.txt'])
    await unstageFiles(runner, ['file1.txt'])
    const s = await readStatus(runner)
    expect(s.staged.map((f) => f.path)).toEqual(['nuovo.txt'])
    expect(s.unstaged.map((f) => f.path)).toEqual(['file1.txt'])

    await unstageAll(runner)
    await discardFiles(runner, ['file1.txt'], ['nuovo.txt'])
    expect(await readStatus(runner)).toMatchObject({ staged: [], unstaged: [], untracked: [] })
    expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('1\n')
  })

  it('unstage e stageAll in un repo senza commit', async () => {
    const { repo, runner } = setup(0)
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    await stageAll(runner)
    expect((await readStatus(runner)).staged).toEqual([{ path: 'a.txt', status: 'A' }])
    await unstageFiles(runner, ['a.txt'])
    expect((await readStatus(runner)).untracked).toEqual([{ path: 'a.txt', status: '?' }])
  })

  it('diff dei file in stage, modificati e non tracciati', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), '1\ndue\n')
    expect((await readWorkingDiff(runner, { path: 'file1.txt' }, 'unstaged', options)).hunks[0].lines[1]).toMatchObject({ type: 'add', text: 'due' })
    await stageFiles(runner, ['file1.txt'])
    expect((await readWorkingDiff(runner, { path: 'file1.txt' }, 'staged', options)).hunks).toHaveLength(1)
    expect((await readWorkingDiff(runner, { path: 'file1.txt' }, 'unstaged', options)).hunks).toEqual([])
    writeFileSync(join(repo, 'nuovo file.txt'), 'x\ny\n')
    const untracked = await readWorkingDiff(runner, { path: 'nuovo file.txt' }, 'untracked', options)
    expect(untracked.hunks[0].lines.map((l) => l.text)).toEqual(['x', 'y'])
  })

  it('commit con messaggio da stdin e amend', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
    await stageFiles(runner, ['file1.txt'])
    await commit(runner, 'oggetto\n\ncorpo', false)
    expect(await lastCommitMessage(runner)).toBe('oggetto\n\ncorpo')
    await commit(runner, 'oggetto corretto', true)
    expect(git(repo, 'log', '--format=%s')).toBe('oggetto corretto\ncommit 1\n')
  })

  it('stash: crea, elenca, applica ed elimina', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
    writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
    await stashPush(runner, 'mio stash', true)
    expect(await readStatus(runner)).toMatchObject({ unstaged: [], untracked: [] })
    const [entry] = await readStashes(runner)
    expect(entry).toMatchObject({ ref: 'stash@{0}', message: 'On main: mio stash' })
    await stashAction(runner, 'pop', entry.ref)
    expect((await readStatus(runner)).untracked).toEqual([{ path: 'nuovo.txt', status: '?' }])
    expect(await readStashes(runner)).toEqual([])
  })

  it('parseStashList', () => {
    // join: in un letterale '\0100' verrebbe letto come escape ottale
    expect(parseStashList(['stash@{0}', 'abc', '100', 'On main: x', ''].join('\0'))).toEqual([{ ref: 'stash@{0}', sha: 'abc', time: 100, message: 'On main: x' }])
  })

  it('aggiunge un percorso al .gitignore con i caratteri speciali protetti', () => {
    const { repo } = setup()
    writeFileSync(join(repo, '.gitignore'), 'node_modules')
    addToGitignore(repo, 'logs/a[1].log')
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('node_modules\n/logs/a\\[1\\].log\n')
  })
})
