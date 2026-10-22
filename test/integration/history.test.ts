import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { History } from '../../src/main/history'
import { git, makeRepo } from '../helpers/repo'

const history = (repo: string) => new History(new GitRunner(() => 'git', repo))

describe('History', () => {
  it('riusa la storia finché ref e HEAD non cambiano', async () => {
    const repo = makeRepo(3)
    const h = history(repo)
    const a = await h.load('')
    expect(a).toMatchObject({ total: 3, lanes: 1 })
    expect((await h.load('')).version).toBe(a.version)

    writeFileSync(join(repo, 'x.txt'), 'x\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'nuovo')
    const b = await h.load('')
    expect(b).toMatchObject({ version: a.version + 1, total: 4 })

    const page = h.page(0, 2)
    expect(page.version).toBe(b.version)
    expect(page.commits.map((c) => c.subject)).toEqual(['nuovo', 'commit 3'])
    expect(page.rows).toHaveLength(2)
    expect(page.commits[0].refs).toEqual([{ kind: 'branch', name: 'main', current: true }])
  })

  it('ricerca per messaggio, percorso, autore e contenuto, senza grafo', async () => {
    const h = history(makeRepo(3))
    expect((await h.load('message:"commit 2"')).total).toBe(1)
    expect((await h.load('path:file3.txt')).total).toBe(1)
    expect((await h.load('author:test')).total).toBe(3)
    expect((await h.load('contents:2')).total).toBe(1)
    expect(await h.load('commit')).toMatchObject({ total: 3, lanes: 0 })
  })

  it('esclude gli stash', async () => {
    const repo = makeRepo(1)
    writeFileSync(join(repo, 'file1.txt'), 'modificato\n')
    git(repo, 'stash', '-q')
    expect((await history(repo).load('')).total).toBe(1)
  })

  it('repo senza commit', async () => {
    expect(await history(makeRepo(0)).load('')).toMatchObject({ total: 0, lanes: 0 })
  })
})
