import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { FileStatus, Operation, WorkingStatus } from '../../shared/types'
import type { GitRunner } from './runner'

const code = (c: string | undefined): FileStatus | null => (!c || c === '.' ? null : (c as FileStatus))

/** git status --porcelain=v2 -z --branch: voci separate da NUL; nelle rinomine il vecchio percorso è la voce successiva. */
export function parseStatus(out: string): WorkingStatus {
  const status: WorkingStatus = { operation: null, staged: [], unstaged: [], untracked: [], conflicted: [], upstream: null, ahead: 0, behind: 0 }
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.startsWith('# branch.upstream ')) {
      status.upstream = entry.slice('# branch.upstream '.length)
    } else if (entry.startsWith('# branch.ab ')) {
      const [, , ahead, behind] = entry.split(' ')
      status.ahead = Number(ahead)
      status.behind = Math.abs(Number(behind))
    } else if (entry[0] === '1' || entry[0] === '2') {
      const fields = entry.split(' ')
      const xy = fields[1] ?? '..'
      const path = fields.slice(entry[0] === '1' ? 8 : 9).join(' ')
      const oldPath = entry[0] === '2' ? parts[++i] : undefined
      const staged = code(xy[0])
      const unstaged = code(xy[1])
      if (staged) status.staged.push({ path, ...(oldPath ? { oldPath } : {}), status: staged })
      if (unstaged) status.unstaged.push({ path, status: unstaged })
    } else if (entry[0] === 'u') {
      status.conflicted.push({ path: entry.split(' ').slice(10).join(' '), status: 'U' })
    } else if (entry[0] === '?') {
      status.untracked.push({ path: entry.slice(2), status: '?' })
    }
  }
  return status
}

/** Merge, rebase, cherry-pick o revert lasciati a metà, dai file di stato nella cartella .git. */
export async function readOperation(runner: GitRunner): Promise<Operation | null> {
  const dir = (await runner.run(['rev-parse', '--absolute-git-dir'])).stdout.trim()
  const has = (name: string) => existsSync(join(dir, name))
  if (has('rebase-merge') || has('rebase-apply')) return 'rebase'
  if (has('MERGE_HEAD')) return 'merge'
  if (has('CHERRY_PICK_HEAD')) return 'cherry-pick'
  if (has('REVERT_HEAD')) return 'revert'
  return null
}

export async function readStatus(runner: GitRunner): Promise<WorkingStatus> {
  const [out, operation] = await Promise.all([
    runner.run(['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all']),
    readOperation(runner),
  ])
  return { ...parseStatus(out.stdout), operation }
}
