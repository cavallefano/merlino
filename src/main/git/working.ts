import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiffOptions, FileDiff, PatchMode, StashEntry, WorkingArea } from '../../shared/types'
import { type DiffRequest, limitedDiff } from './diff'
import type { GitRunner } from './runner'

const write = { write: true }

export async function readWorkingDiff(runner: GitRunner, file: DiffRequest, area: WorkingArea, options: DiffOptions): Promise<FileDiff> {
  const base = ['--no-color', '--no-ext-diff', '-U3', ...(options.ignoreWhitespace ? ['-w'] : [])]
  const paths = file.oldPath ? [file.oldPath, file.path] : [file.path]
  // Il file non tracciato si confronta con un file vuoto: git esce con 1 quando c'è una differenza
  const out =
    area === 'untracked'
      ? await runner.run(['diff', ...base, '--no-index', '--', '/dev/null', file.path], { okCodes: [0, 1] })
      : await runner.run(['diff', ...(area === 'staged' ? ['--cached', '-M'] : []), ...base, '--', ...paths])
  return limitedDiff(out.stdout, file, options.force)
}

const hasHead = async (runner: GitRunner) =>
  (await runner.run(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] })).exitCode === 0

export async function stageFiles(runner: GitRunner, paths: string[]): Promise<void> {
  await runner.run(['add', '-A', '--', ...paths], write)
}

/** In un repo senza commit non c'è HEAD da cui ripristinare l'index: si toglie il file dall'index. */
export async function unstageFiles(runner: GitRunner, paths: string[]): Promise<void> {
  if (await hasHead(runner)) await runner.run(['restore', '--staged', '--', ...paths], write)
  else await runner.run(['rm', '--cached', '-r', '-q', '--', ...paths], write)
}

export async function discardFiles(runner: GitRunner, tracked: string[], untracked: string[]): Promise<void> {
  if (tracked.length) await runner.run(['restore', '--', ...tracked], write)
  if (untracked.length) await runner.run(['clean', '-f', '-q', '--', ...untracked], write)
}

export async function stageAll(runner: GitRunner): Promise<void> {
  await runner.run(['add', '-A'], write)
}

export async function unstageAll(runner: GitRunner): Promise<void> {
  if (await hasHead(runner)) await runner.run(['reset', '-q'], write)
  else await runner.run(['rm', '--cached', '-r', '-q', '.'], write)
}

const APPLY: Record<PatchMode, string[]> = {
  stage: ['--cached'],
  unstage: ['--cached', '--reverse'],
  discard: ['--reverse'],
}

export async function applyPatch(runner: GitRunner, patch: string, mode: PatchMode): Promise<void> {
  await runner.run(['apply', ...APPLY[mode], '--recount', '--whitespace=nowarn', '-'], { ...write, stdin: patch })
}

export async function commit(runner: GitRunner, message: string, amend: boolean): Promise<void> {
  await runner.run(['commit', '-F', '-', ...(amend ? ['--amend'] : [])], { ...write, stdin: message })
}

export async function lastCommitMessage(runner: GitRunner): Promise<string> {
  const r = await runner.run(['log', '-1', '--format=%B'], { okCodes: [0, 128] })
  return r.exitCode === 0 ? r.stdout.trimEnd() : ''
}

export function parseStashList(out: string): StashEntry[] {
  const parts = out.split('\0')
  const stashes: StashEntry[] = []
  for (let i = 0; i + 4 <= parts.length; i += 4) {
    const [ref, sha, time, message] = parts.slice(i, i + 4)
    stashes.push({ ref, sha, time: Number(time), message })
  }
  return stashes
}

export async function readStashes(runner: GitRunner): Promise<StashEntry[]> {
  return parseStashList((await runner.run(['stash', 'list', '-z', '--format=%gd%x00%H%x00%ct%x00%s'])).stdout)
}

export async function stashPush(runner: GitRunner, message: string, includeUntracked: boolean): Promise<void> {
  await runner.run(['stash', 'push', ...(includeUntracked ? ['-u'] : []), ...(message ? ['-m', message] : [])], write)
}

export async function stashAction(runner: GitRunner, action: 'apply' | 'pop' | 'drop', ref: string): Promise<void> {
  await runner.run(['stash', action, '-q', ref], write)
}

/** Aggiunge "/percorso" al .gitignore della radice, proteggendo i caratteri speciali dei pattern. */
export function addToGitignore(root: string, path: string): void {
  const file = join(root, '.gitignore')
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  writeFileSync(file, `${current}${separator}/${path.replace(/[*?[\]\\]/g, '\\$&')}\n`)
}
