import type { FileStatus, WorkingStatus } from '../../shared/types'
import type { GitRunner } from './runner'

const code = (c: string | undefined): FileStatus | null => (!c || c === '.' ? null : (c as FileStatus))

/** git status --porcelain=v2 -z --branch: voci separate da NUL; nelle rinomine il vecchio percorso è la voce successiva. */
export function parseStatus(out: string): WorkingStatus {
  const status: WorkingStatus = { staged: [], unstaged: [], untracked: [], conflicted: [], upstream: null, ahead: 0, behind: 0 }
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

export async function readStatus(runner: GitRunner): Promise<WorkingStatus> {
  return parseStatus((await runner.run(['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'])).stdout)
}
