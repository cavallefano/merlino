import type { FlowConfig, FlowType } from './types'

export const FLOW_TYPES = ['feature', 'bugfix', 'release', 'hotfix', 'support'] as const satisfies readonly FlowType[]

export const DEFAULT_FLOW_PREFIXES: Record<FlowType, string> = {
  feature: 'feature/',
  bugfix: 'bugfix/',
  release: 'release/',
  hotfix: 'hotfix/',
  support: 'support/',
}

/** Tipo di git flow di un branch: il prefisso (non vuoto) più lungo che gli fa da inizio; il solo prefisso non conta. */
export function flowTypeOf(branch: string, config: FlowConfig): FlowType | null {
  let best: FlowType | null = null
  for (const type of FLOW_TYPES) {
    const prefix = config.prefixes[type]
    if (!prefix || !branch.startsWith(prefix) || branch.length === prefix.length) continue
    if (!best || prefix.length > config.prefixes[best].length) best = type
  }
  return best
}

/** Nome del branch senza il prefisso del suo tipo. */
export function flowName(branch: string, config: FlowConfig): string {
  const type = flowTypeOf(branch, config)
  return type ? branch.slice(config.prefixes[type].length) : branch
}

/** Versioni X.Y.Z dei tag con il prefisso, dalla più vecchia. */
function versions(tags: string[], prefix: string): { tag: string; v: [number, number, number] }[] {
  return tags
    .flatMap((tag) => {
      const m = tag.startsWith(prefix) ? /^(\d+)\.(\d+)\.(\d+)$/.exec(tag.slice(prefix.length)) : null
      return m ? [{ tag, v: [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number] }] : []
    })
    .sort((a, b) => a.v[0] - b.v[0] || a.v[1] - b.v[1] || a.v[2] - b.v[2])
}

export const latestVersionTag = (tags: string[], prefix: string): string | null => versions(tags, prefix).at(-1)?.tag ?? null

/** Versione proposta: release la minor successiva, hotfix la patch successiva, support "X.Y.x". */
export function nextVersion(tags: string[], prefix: string, kind: 'release' | 'hotfix' | 'support'): string {
  const last = versions(tags, prefix).at(-1)?.v
  if (!last) return kind === 'release' ? '0.1.0' : kind === 'hotfix' ? '0.0.1' : '0.1.x'
  const [major, minor, patch] = last
  if (kind === 'release') return `${major}.${minor + 1}.0`
  if (kind === 'hotfix') return `${major}.${minor}.${patch + 1}`
  return `${major}.${minor}.x`
}
