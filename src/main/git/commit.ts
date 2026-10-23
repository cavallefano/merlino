import type { CommitDetail, FileChange, FileStatus } from '../../shared/types'
import { LOG_FORMAT, parseLog } from './log'
import type { GitRunner } from './runner'

/** git … --name-status -z: "M\0path\0", rinomine "R100\0vecchio\0nuovo\0". */
export function parseNameStatus(out: string): Pick<FileChange, 'path' | 'oldPath' | 'status'>[] {
  const parts = out.split('\0')
  const files: Pick<FileChange, 'path' | 'oldPath' | 'status'>[] = []
  for (let i = 0; i < parts.length - 1; ) {
    const status = parts[i++][0] as FileStatus
    if (status === 'R' || status === 'C') {
      const oldPath = parts[i++]
      files.push({ status, path: parts[i++], oldPath })
    } else {
      files.push({ status, path: parts[i++] })
    }
  }
  return files
}

/** git … --numstat -z: "add\tdel\tpath\0", rinomine "add\tdel\t\0vecchio\0nuovo\0", binari "-\t-". Chiave: percorso nuovo. */
export function parseNumstat(out: string): Map<string, Pick<FileChange, 'added' | 'deleted'>> {
  const parts = out.split('\0')
  const map = new Map<string, Pick<FileChange, 'added' | 'deleted'>>()
  for (let i = 0; i < parts.length - 1; ) {
    const entry = parts[i++]
    const t1 = entry.indexOf('\t')
    const t2 = entry.indexOf('\t', t1 + 1)
    const count = (s: string) => (s === '-' ? null : Number(s))
    const counts = { added: count(entry.slice(0, t1)), deleted: count(entry.slice(t1 + 1, t2)) }
    let path = entry.slice(t2 + 1)
    if (path === '') {
      i++ // percorso vecchio
      path = parts[i++]
    }
    map.set(path, counts)
  }
  return map
}

/** File cambiati, dall'output di --name-status -z e --numstat -z dello stesso diff. */
export function fileChanges(nameStatus: string, numstat: string): FileChange[] {
  const counts = parseNumstat(numstat)
  return parseNameStatus(nameStatus).map((f) => ({ ...f, ...(counts.get(f.path) ?? { added: null, deleted: null }) }))
}

export async function readCommitDetail(runner: GitRunner, sha: string): Promise<CommitDetail> {
  const changes = ['show', '--format=', '-z', '-M', '--diff-merges=first-parent']
  const [meta, nameStatus, numstat] = await Promise.all([
    runner.run(['show', '-s', '-z', '--decorate=full', `--format=${LOG_FORMAT}%x00%B`, sha]),
    runner.run([...changes, '--name-status', sha]),
    runner.run([...changes, '--numstat', sha]),
  ])
  const parts = meta.stdout.split('\0')
  return {
    commit: parseLog(parts.slice(0, 10).join('\0'))[0],
    message: (parts[10] ?? '').trimEnd(),
    files: fileChanges(nameStatus.stdout, numstat.stdout),
  }
}
