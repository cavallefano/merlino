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

  it('linea tratteggiata dalle modifiche locali a HEAD, nella corsia 0', async () => {
    const repo = makeRepo(2)
    git(repo, 'switch', '-q', '-c', 'altro')
    writeFileSync(join(repo, 'y.txt'), 'y\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'su altro')
    git(repo, 'switch', '-q', 'main')
    const h = history(repo)
    await h.load('')
    const { commits, rows } = h.page(0, 3)
    expect(commits.map((c) => c.subject)).toEqual(['su altro', 'commit 2', 'commit 1'])
    expect(rows).toEqual([
      { lane: 1, up: [{ from: 0, to: 0, dashed: true }] },
      { lane: 0, up: [{ from: 0, to: 0, dashed: true }, { from: 1, to: 0 }] },
      { lane: 0, up: [{ from: 0, to: 0 }] },
    ])
  })

  it('numero di file: commit normale, merge sul primo genitore, merge vuoto; la seconda volta dalla cache', async () => {
    const repo = makeRepo(1)
    git(repo, 'switch', '-q', '-c', 'f')
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'due file')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', 'f', '-m', 'merge con modifiche')
    git(repo, 'switch', '-q', '-c', 'g')
    writeFileSync(join(repo, 'c.txt'), 'c\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'su g')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', '-s', 'ours', 'g', '-m', 'merge vuoto')

    const calls: string[][] = []
    const h = new History(new GitRunner(() => 'git', repo, (e) => calls.push(e.args)))
    const { total } = await h.load('')
    const counts = await h.fileCounts(0, total)
    const bySubject = Object.fromEntries(h.page(0, total).commits.map((c) => [c.subject, counts[c.sha]]))
    expect(bySubject).toEqual({ 'merge vuoto': 0, 'su g': 1, 'merge con modifiche': 2, 'due file': 2, 'commit 1': 1 })

    const before = calls.length
    expect(await h.fileCounts(0, total)).toEqual(counts)
    expect(calls.length).toBe(before)
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
    // Una colonna c'è comunque: quella della riga delle modifiche locali
    expect(await history(makeRepo(0)).load('')).toMatchObject({ total: 0, lanes: 1 })
  })
})
