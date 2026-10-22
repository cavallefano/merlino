import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCommitDetail } from '../../src/main/git/commit'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

const detail = (repo: string, sha: string) => readCommitDetail(new GitRunner(() => 'git', repo), sha)
const head = (repo: string, rev = 'HEAD') => git(repo, 'rev-parse', rev).trim()

describe('readCommitDetail', () => {
  it('messaggio completo e file cambiati: aggiunto, modificato, rinominato', async () => {
    const repo = makeRepo(2)
    git(repo, 'mv', 'file1.txt', 'rinominato.txt')
    writeFileSync(join(repo, 'file2.txt'), '2\nnuovo\n')
    writeFileSync(join(repo, 'bin.dat'), Buffer.from([0, 1, 2]))
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'oggetto', '-m', 'corpo del messaggio')

    const d = await detail(repo, head(repo))
    expect(d.commit.subject).toBe('oggetto')
    expect(d.message).toBe('oggetto\n\ncorpo del messaggio')
    expect(d.files).toEqual([
      { status: 'A', path: 'bin.dat', added: null, deleted: null },
      { status: 'M', path: 'file2.txt', added: 1, deleted: 0 },
      { status: 'R', path: 'rinominato.txt', oldPath: 'file1.txt', added: 0, deleted: 0 },
    ])
  })

  it('commit iniziale e merge (rispetto al primo genitore)', async () => {
    const repo = makeRepo(1)
    expect((await detail(repo, head(repo))).files).toEqual([{ status: 'A', path: 'file1.txt', added: 1, deleted: 0 }])

    git(repo, 'switch', '-q', '-c', 'feature')
    writeFileSync(join(repo, 'feature.txt'), 'f\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'feature')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', 'feature', '-m', 'merge')
    const merge = await detail(repo, head(repo))
    expect(merge.commit.parents).toHaveLength(2)
    expect(merge.files).toEqual([{ status: 'A', path: 'feature.txt', added: 1, deleted: 0 }])
  })
})
