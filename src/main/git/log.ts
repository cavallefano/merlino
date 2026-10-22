import type { Commit, CommitRef } from '../../shared/types'

/** 10 campi separati da NUL; con -z anche ogni record è chiuso da un NUL. */
export const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%s%x00%D'
const FIELDS = 10

export function parseLog(out: string): Commit[] {
  const parts = out.split('\0')
  const commits: Commit[] = []
  for (let i = 0; i + FIELDS <= parts.length; i += FIELDS) {
    const [sha, parents, author, authorEmail, authorTime, committer, committerEmail, commitTime, subject, decoration] =
      parts.slice(i, i + FIELDS)
    commits.push({
      sha,
      parents: parents ? parents.split(' ') : [],
      author,
      authorEmail,
      authorTime: Number(authorTime),
      committer,
      committerEmail,
      commitTime: Number(commitTime),
      subject,
      refs: parseDecoration(decoration),
    })
  }
  return commits
}

/** %D con --decorate=full, es. "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1". */
export function parseDecoration(decoration: string): CommitRef[] {
  if (!decoration) return []
  const refs: CommitRef[] = []
  for (const item of decoration.split(', ')) {
    if (item === 'HEAD') refs.push({ kind: 'head', name: 'HEAD', current: true })
    else if (item.startsWith('HEAD -> ')) refs.push(classify(item.slice('HEAD -> '.length), true))
    else if (item.startsWith('tag: ')) refs.push(classify(item.slice('tag: '.length), false))
    else refs.push(classify(item, false))
  }
  return refs.filter((r) => !(r.kind === 'remote' && r.name.endsWith('/HEAD')))
}

function classify(ref: string, current: boolean): CommitRef {
  if (ref.startsWith('refs/heads/')) return { kind: 'branch', name: ref.slice('refs/heads/'.length), current }
  if (ref.startsWith('refs/remotes/')) return { kind: 'remote', name: ref.slice('refs/remotes/'.length), current }
  if (ref.startsWith('refs/tags/')) return { kind: 'tag', name: ref.slice('refs/tags/'.length), current }
  return { kind: 'branch', name: ref, current }
}
