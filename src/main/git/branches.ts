import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Commit, CommandLogEntry, Operation, RebaseStep, RepoCommand } from '../../shared/types'
import { LOG_FORMAT, parseLog } from './log'
import { t } from '../i18n'
import { GitError, GitRunner } from './runner'
import { applyFileChanges, stashFiles } from './working'

const write = { write: true }
type Progress = (line: string) => void

const run = async (r: GitRunner, args: string[], onProgress?: Progress) => {
  await r.run(args, { ...write, onProgress })
}

async function parentsOf(r: GitRunner, rev: string): Promise<string[]> {
  return (await r.run(['rev-list', '--parents', '-n', '1', rev])).stdout.trim().split(' ').slice(1)
}

// --- Branch ---

export async function createBranch(r: GitRunner, name: string, start: string, checkout: boolean): Promise<void> {
  await run(r, checkout ? ['switch', '-c', name, start] : ['branch', name, start])
}

export const checkoutBranch = (r: GitRunner, name: string) => run(r, ['switch', name])
export const checkoutDetached = (r: GitRunner, sha: string) => run(r, ['switch', '--detach', sha])
export const renameBranch = (r: GitRunner, from: string, to: string) => run(r, ['branch', '-m', from, to])
export const deleteBranch = (r: GitRunner, name: string, force: boolean) => run(r, ['branch', force ? '-D' : '-d', name])
export const deleteRemoteBranch = (r: GitRunner, remote: string, name: string) => run(r, ['push', remote, '--delete', name])

/** Checkout di un branch remoto: crea il branch locale che lo segue, o passa a quello che esiste già. */
export async function checkoutRemote(r: GitRunner, fullName: string): Promise<void> {
  const refs = await r.run(['for-each-ref', '--format=%(refname:short)%00%(upstream:short)', 'refs/heads'])
  const tracking = refs.stdout
    .split('\n')
    .map((line) => line.split('\0'))
    .find(([, upstream]) => upstream === fullName)
  if (tracking?.[0]) await run(r, ['switch', tracking[0]])
  else await run(r, ['switch', '--track', fullName])
}

export async function setUpstream(r: GitRunner, branch: string, upstream: string | null): Promise<void> {
  await run(r, upstream ? ['branch', `--set-upstream-to=${upstream}`, branch] : ['branch', '--unset-upstream', branch])
}

// --- Integrazione dei cambiamenti ---

export const merge = (r: GitRunner, ref: string, noFf: boolean) => run(r, ['merge', ...(noFf ? ['--no-ff'] : []), ref])
export const rebase = (r: GitRunner, onto: string) => run(r, ['rebase', onto])
export const reset = (r: GitRunner, rev: string, mode: 'soft' | 'mixed' | 'hard') => run(r, ['reset', `--${mode}`, rev])

/** Per i merge si usa il primo genitore come base (-m 1). */
export async function cherryPick(r: GitRunner, rev: string): Promise<void> {
  const isMerge = (await parentsOf(r, rev)).length > 1
  await run(r, ['cherry-pick', ...(isMerge ? ['-m', '1'] : []), rev])
}

export async function revert(r: GitRunner, rev: string): Promise<void> {
  const isMerge = (await parentsOf(r, rev)).length > 1
  await run(r, ['revert', '--no-edit', ...(isMerge ? ['-m', '1'] : []), rev])
}

export const operation = (r: GitRunner, op: Operation, step: 'continue' | 'skip' | 'abort') => run(r, [op, `--${step}`])

// --- Tag ---

export async function createTag(r: GitRunner, name: string, rev: string, message: string): Promise<void> {
  await run(r, message ? ['tag', '-a', name, '-m', message, rev] : ['tag', name, rev])
}

export const deleteTag = (r: GitRunner, name: string) => run(r, ['tag', '-d', name])
export const pushTag = (r: GitRunner, remote: string, name: string) => run(r, ['push', remote, `refs/tags/${name}`])

// --- Remote ---

export const fetch = (r: GitRunner, onProgress: Progress, prune = true) =>
  run(r, ['fetch', '--all', ...(prune ? ['--prune'] : []), '--progress'], onProgress)

/** mode "config" segue pull.rebase della config dell'utente. */
export async function pull(r: GitRunner, mode: 'config' | 'rebase' | 'merge', onProgress: Progress): Promise<void> {
  const flag = mode === 'rebase' ? ['--rebase'] : mode === 'merge' ? ['--no-rebase'] : []
  await run(r, ['pull', '--progress', ...flag], onProgress)
}

/** Senza upstream il primo push lo imposta (-u remote HEAD). */
export async function push(r: GitRunner, remote: string, force: boolean, onProgress: Progress): Promise<void> {
  const upstream = await r.run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { okCodes: [0, 128] })
  const lease = force ? ['--force-with-lease'] : []
  await run(r, upstream.exitCode === 0 ? ['push', '--progress', ...lease] : ['push', '--progress', ...lease, '-u', remote, 'HEAD'], onProgress)
}

/** Push di un branch qualsiasi (anche non corrente), con upstream. */
export const pushBranch = (r: GitRunner, remote: string, branch: string, remoteBranch: string, onProgress: Progress) =>
  run(r, ['push', '--progress', '-u', remote, `refs/heads/${branch}:refs/heads/${remoteBranch}`], onProgress)

/** Aggiorna un branch non corrente senza checkout, solo in fast-forward. */
export async function fastForward(r: GitRunner, branch: string, from: string): Promise<void> {
  try {
    await run(r, ['fetch', '.', `${from}:refs/heads/${branch}`])
  } catch (e) {
    // git lo segnala come "[rejected]", che explain() tradurrebbe in un push rifiutato
    if (e instanceof GitError && /rejected|non-fast-forward/.test(e.info.stderr)) {
      throw new GitError({ ...e.info, message: t('error.fastForward', { branch, from }) })
    }
    throw e
  }
}

export const addRemote = (r: GitRunner, name: string, url: string) => run(r, ['remote', 'add', name, url])
export const removeRemote = (r: GitRunner, name: string) => run(r, ['remote', 'remove', name])

/** Nome della cartella da un URL: git@host:team/app.git → app */
export function repoName(url: string): string {
  const last = url.replace(/[/\\]+$/, '').split(/[/\\:]/).pop() ?? ''
  return last.replace(/\.git$/, '') || 'repo'
}

export async function clone(
  gitPath: () => string,
  url: string,
  parent: string,
  log: (entry: CommandLogEntry) => void,
  onProgress: Progress,
): Promise<string> {
  const dest = join(parent, repoName(url))
  // "--" prima dell'URL: un URL non può diventare un'opzione di git
  await new GitRunner(gitPath, parent, log).run(['clone', '--progress', '--', url, dest], { ...write, onProgress })
  return dest
}

// --- Rebase interattivo ---

/** I commit dal commit scelto a HEAD (dal più recente). Solo storie lineari. */
export async function rebaseRange(r: GitRunner, sha: string): Promise<Commit[]> {
  const ancestor = await r.run(['merge-base', '--is-ancestor', sha, 'HEAD'], { okCodes: [0, 1] })
  if (ancestor.exitCode !== 0) throw new Error(t('error.commitNotInHistory'))
  const root = (await parentsOf(r, sha)).length === 0
  const out = await r.run(['log', '-z', '--decorate=full', `--format=${LOG_FORMAT}`, root ? 'HEAD' : `${sha}^..HEAD`])
  const commits = parseLog(out.stdout)
  if (commits.some((c) => c.parents.length > 1)) throw new Error(t('error.rebaseMerges'))
  return commits
}

/**
 * steps: dal più vecchio al più recente, come verranno applicati.
 * La lista delle operazioni va in un file che GIT_SEQUENCE_EDITOR copia al posto di quella di git;
 * i reword diventano "exec git commit --amend -F <messaggio>", quindi nessun editor.
 */
export async function rebaseInteractive(r: GitRunner, sha: string, steps: RebaseStep[]): Promise<void> {
  const range = new Set((await rebaseRange(r, sha)).map((c) => c.sha))
  if (steps.length !== range.size || !steps.every((s) => range.has(s.sha))) {
    throw new Error(t('error.rebaseChanged'))
  }
  if (steps[0] && (steps[0].action === 'squash' || steps[0].action === 'fixup')) {
    throw new Error(t('error.rebaseFirstSquash'))
  }
  // ponytail: la cartella temporanea resta finché il sistema non la pulisce (serve anche se il rebase si ferma su un edit)
  const dir = mkdtempSync(join(tmpdir(), 'merlino-rebase-'))
  const todo: string[] = []
  steps.forEach((step, i) => {
    if (step.action !== 'reword') {
      todo.push(`${step.action} ${step.sha}`)
      return
    }
    const file = join(dir, `messaggio-${i}.txt`)
    writeFileSync(file, `${step.message ?? ''}\n`)
    todo.push(`pick ${step.sha}`, `exec git commit --amend -q -F '${file}'`)
  })
  const todoFile = join(dir, 'todo')
  writeFileSync(todoFile, `${todo.join('\n')}\n`)
  const root = (await parentsOf(r, sha)).length === 0
  await r.run(['rebase', '-i', root ? '--root' : `${sha}^`], { ...write, env: { GIT_SEQUENCE_EDITOR: `cp '${todoFile}'` } })
}

/** Esegue un'operazione già validata (vedi validate.ts); prune vale per i fetch. */
export function runCommand(r: GitRunner, c: RepoCommand, onProgress: Progress, prune = true): Promise<void> {
  switch (c.kind) {
    case 'createBranch':
      return createBranch(r, c.name, c.start, c.checkout)
    case 'checkoutBranch':
      return checkoutBranch(r, c.name)
    case 'checkoutRemote':
      return checkoutRemote(r, c.fullName)
    case 'checkoutDetached':
      return checkoutDetached(r, c.sha)
    case 'renameBranch':
      return renameBranch(r, c.from, c.to)
    case 'deleteBranch':
      return deleteBranch(r, c.name, c.force)
    case 'deleteRemoteBranch':
      return deleteRemoteBranch(r, c.remote, c.name)
    case 'setUpstream':
      return setUpstream(r, c.branch, c.upstream)
    case 'merge':
      return merge(r, c.ref, c.noFf)
    case 'rebase':
      return rebase(r, c.onto)
    case 'cherryPick':
      return cherryPick(r, c.sha)
    case 'revert':
      return revert(r, c.sha)
    case 'reset':
      return reset(r, c.sha, c.mode)
    case 'operation':
      return operation(r, c.op, c.step)
    case 'createTag':
      return createTag(r, c.name, c.sha, c.message)
    case 'deleteTag':
      return deleteTag(r, c.name)
    case 'pushTag':
      return pushTag(r, c.remote, c.name)
    case 'fetch':
      return fetch(r, onProgress, prune)
    case 'pull':
      return pull(r, c.mode, onProgress)
    case 'push':
      return push(r, c.remote, c.force, onProgress)
    case 'addRemote':
      return addRemote(r, c.name, c.url)
    case 'removeRemote':
      return removeRemote(r, c.name)
    case 'pushBranch':
      return pushBranch(r, c.remote, c.branch, c.remoteBranch, onProgress)
    case 'fastForward':
      return fastForward(r, c.branch, c.from)
    case 'stashFiles':
      return stashFiles(r, c.paths, c.untracked)
    case 'applyFileChanges':
      return applyFileChanges(r, c.sha, c.path)
    case 'rebaseInteractive':
      return rebaseInteractive(r, c.sha, c.steps)
  }
}
