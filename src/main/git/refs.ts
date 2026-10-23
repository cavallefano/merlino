import type { BranchInfo, RefsSnapshot, RemoteInfo, TagInfo } from '../../shared/types'
import type { GitRunner } from './runner'

/** Campi separati da NUL, un ref per riga; %(*objectname) è il commit puntato da un tag annotato. */
export const REFS_FORMAT = '%(refname)%00%(objectname)%00%(*objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(HEAD)'

/** out: for-each-ref con REFS_FORMAT; remoteConfig: righe "remote.<nome>.url <url>". */
export function parseRefs(out: string, remoteConfig: string): RefsSnapshot {
  const remotes = new Map<string, RemoteInfo>()
  for (const line of remoteConfig.split('\n')) {
    const m = /^remote\.(.+)\.url (.*)$/.exec(line)
    if (m) remotes.set(m[1], { name: m[1], url: m[2], branches: [] })
  }
  // Il nome di un remote può contenere "/": vince il remote noto più lungo che fa da prefisso
  const byLength = [...remotes.keys()].sort((a, b) => b.length - a.length)
  const branches: BranchInfo[] = []
  const tags: TagInfo[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const [ref = '', sha = '', peeled = '', upstream = '', track = '', head = ''] = line.split('\0')
    if (ref.startsWith('refs/heads/')) {
      branches.push({
        name: ref.slice('refs/heads/'.length),
        sha,
        upstream: upstream || null,
        ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
        behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
        gone: track === 'gone',
        current: head === '*',
      })
    } else if (ref.startsWith('refs/remotes/')) {
      const fullName = ref.slice('refs/remotes/'.length)
      const remote = byLength.find((r) => fullName.startsWith(`${r}/`))
      if (!remote || fullName === `${remote}/HEAD`) continue
      remotes.get(remote)?.branches.push({ name: fullName.slice(remote.length + 1), fullName, sha })
    } else if (ref.startsWith('refs/tags/')) {
      tags.push({ name: ref.slice('refs/tags/'.length), sha: peeled || sha })
    }
  }
  return { branches, remotes: [...remotes.values()], tags }
}

// exit 1: nessun remote configurato
const readRemoteConfig = async (runner: GitRunner): Promise<string> =>
  (await runner.run(['config', '--get-regexp', '^remote\\..*\\.url$'], { okCodes: [0, 1] })).stdout

export async function readRefs(runner: GitRunner): Promise<RefsSnapshot> {
  const [refs, config] = await Promise.all([
    runner.run(['for-each-ref', `--format=${REFS_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags']),
    readRemoteConfig(runner),
  ])
  return parseRefs(refs.stdout, config)
}

/** I remote con l'URL configurato, senza le riscritture insteadOf. */
export async function readRemotes(runner: GitRunner): Promise<{ name: string; url: string }[]> {
  return parseRefs('', await readRemoteConfig(runner)).remotes.map(({ name, url }) => ({ name, url }))
}
