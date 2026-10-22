import { mkdtempSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readGitCommitTemplate } from '../../src/main/git/commit-template'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

afterEach(() => {
  process.env.GIT_CONFIG_GLOBAL = devNull
})

describe('commit.template di git', () => {
  it('quello del repo vince sul globale; percorso relativo dalla radice; file mancante → null', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    expect(await readGitCommitTemplate(runner)).toBeNull()

    const dir = mkdtempSync(join(tmpdir(), 'merlino-tpl-'))
    const globalTemplate = join(dir, 'globale.txt')
    writeFileSync(globalTemplate, 'globale\n')
    writeFileSync(join(dir, 'gitconfig'), `[commit]\n\ttemplate = ${globalTemplate}\n`)
    process.env.GIT_CONFIG_GLOBAL = join(dir, 'gitconfig')
    expect(await readGitCommitTemplate(runner)).toEqual({ path: globalTemplate, text: 'globale\n' })

    writeFileSync(join(repo, '.gitmessage'), '# istruzioni\n[{ticket}] \n')
    git(repo, 'config', 'commit.template', '.gitmessage')
    expect(await readGitCommitTemplate(runner)).toEqual({ path: join(repo, '.gitmessage'), text: '# istruzioni\n[{ticket}] \n' })

    git(repo, 'config', 'commit.template', 'manca.txt')
    expect(await readGitCommitTemplate(runner)).toBeNull()
  })
})
