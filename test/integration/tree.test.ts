import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { readFileContent, readTree } from '../../src/main/git/tree'
import { git, makeRepo } from '../helpers/repo'

const commitAll = (repo: string, message: string) => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD').trim()
}

describe('readTree', () => {
  it('radice e cartella, con le cartelle prima; una cartella che non c è è vuota', async () => {
    const repo = makeRepo(1)
    mkdirSync(join(repo, 'src/lib'), { recursive: true })
    writeFileSync(join(repo, 'src/lib/util.ts'), 'export {}\n')
    writeFileSync(join(repo, 'src/app.ts'), 'uno\n')
    writeFileSync(join(repo, 'README.md'), '# demo\n')
    const sha = commitAll(repo, 'albero')
    const runner = new GitRunner(() => 'git', repo)
    expect(await readTree(runner, sha, '')).toEqual([
      { name: 'src', path: 'src', kind: 'folder' },
      { name: 'file1.txt', path: 'file1.txt', kind: 'file' },
      { name: 'README.md', path: 'README.md', kind: 'file' },
    ])
    expect(await readTree(runner, sha, 'src')).toEqual([
      { name: 'lib', path: 'src/lib', kind: 'folder' },
      { name: 'app.ts', path: 'src/app.ts', kind: 'file' },
    ])
    expect(await readTree(runner, sha, 'manca')).toEqual([])
  })
})

describe('readFileContent', () => {
  it('testo, binario, troppo grande (poi force), submodule, mancante e cartella', async () => {
    const repo = makeRepo(1)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, 'src/bin.dat'), Buffer.from([0, 1, 2]))
    writeFileSync(join(repo, 'big.txt'), 'x\n'.repeat(20_001))
    git(repo, 'add', '-A')
    // Un submodule senza cartella: dopo add -A, che altrimenti lo toglierebbe
    git(repo, 'update-index', '--add', '--cacheinfo', `160000,${first},modulo`)
    git(repo, 'commit', '-q', '-m', 'file vari')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()
    const runner = new GitRunner(() => 'git', repo)
    expect(await readFileContent(runner, sha, 'file1.txt', false)).toEqual({ binary: false, tooLarge: false, text: '1\n' })
    expect(await readFileContent(runner, sha, 'src/bin.dat', false)).toEqual({ binary: true, tooLarge: false, text: '' })
    expect(await readFileContent(runner, sha, 'big.txt', false)).toEqual({ binary: false, tooLarge: true, text: '' })
    expect((await readFileContent(runner, sha, 'big.txt', true))?.text.length).toBe(40_002)
    expect(await readFileContent(runner, sha, 'modulo', false)).toEqual({ binary: false, tooLarge: false, text: `Subproject commit ${first}` })
    expect(await readFileContent(runner, sha, 'manca.txt', false)).toBeNull()
    expect(await readFileContent(runner, sha, 'src', false)).toBeNull()
  })
})
