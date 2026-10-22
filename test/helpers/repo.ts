import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'

// Config globale e di sistema ignorate, così una firma GPG o un hook dell'utente non rompe i test
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' })
}

/** Repo temporaneo sul branch main con `commits` commit (file1.txt, file2.txt, …). */
export function makeRepo(commits = 1): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-')))
  git(dir, 'init', '-q', '-b', 'main')
  for (let i = 1; i <= commits; i++) {
    writeFileSync(join(dir, `file${i}.txt`), `${i}\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', `commit ${i}`)
  }
  return dir
}

/** Un repo bare che fa da "server" e un clone con un commit già pushato su main (upstream impostato). */
export function makeRemotePair(): { bare: string; clone: string } {
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-bare-')))
  git(bare, 'init', '-q', '--bare', '-b', 'main')
  const clone = makeRepo(1)
  git(clone, 'remote', 'add', 'origin', bare)
  git(clone, 'push', '-q', '-u', 'origin', 'main')
  return { bare, clone }
}

/** Un altro clone dello stesso "server". */
export function cloneOf(bare: string): string {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-clone-')))
  git(parent, 'clone', '-q', bare, 'clone')
  return join(parent, 'clone')
}
