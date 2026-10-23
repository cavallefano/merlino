import { DEFAULT_FLOW_PREFIXES, FLOW_TYPES, flowTypeOf } from '../../shared/flow'
import type { FlowConfig, FlowFinishInfo, FlowType } from '../../shared/types'
import { t } from '../i18n'
import type { GitRunner } from './runner'

const write = { write: true }
type Progress = (line: string) => void

/** Output di git config -z --get-regexp ^gitflow\.: voci "chiave\nvalore" chiuse da NUL. null se manca produzione o develop. */
export function parseFlowConfig(out: string): FlowConfig | null {
  const values = new Map<string, string>()
  for (const entry of out.split('\0')) {
    if (!entry) continue
    const i = entry.indexOf('\n')
    values.set(i < 0 ? entry : entry.slice(0, i), i < 0 ? '' : entry.slice(i + 1))
  }
  const main = values.get('gitflow.branch.master')
  const develop = values.get('gitflow.branch.develop')
  if (!main || !develop) return null
  const bases: Record<string, string> = {}
  for (const [key, value] of values) {
    const m = /^gitflow\.branch\.(.+)\.base$/.exec(key)
    if (m?.[1]) bases[m[1]] = value
  }
  const prefix = (type: FlowType) => values.get(`gitflow.prefix.${type}`) ?? DEFAULT_FLOW_PREFIXES[type]
  return {
    main,
    develop,
    prefixes: Object.fromEntries(FLOW_TYPES.map((type) => [type, prefix(type)])) as Record<FlowType, string>,
    versionTag: values.get('gitflow.prefix.versiontag') ?? '',
    bases,
  }
}

export async function readFlowConfig(r: GitRunner): Promise<FlowConfig | null> {
  // exit 1: nessuna chiave gitflow
  return parseFlowConfig((await r.run(['config', '-z', '--get-regexp', '^gitflow\\.'], { okCodes: [0, 1] })).stdout)
}

async function requireConfig(r: GitRunner): Promise<FlowConfig> {
  const config = await readFlowConfig(r)
  if (!config) throw new Error(t('flow.notInitialized'))
  return config
}

const exists = async (r: GitRunner, ref: string) => (await r.run(['rev-parse', '--verify', '--quiet', ref], { okCodes: [0, 1] })).exitCode === 0
const isAncestor = async (r: GitRunner, a: string, b: string) => (await r.run(['merge-base', '--is-ancestor', a, b], { okCodes: [0, 1] })).exitCode === 0
const currentBranch = async (r: GitRunner) => (await r.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], { okCodes: [0, 1] })).stdout.trim()

/** Upstream di un branch locale: es. { ref: 'origin/main', remote: 'origin', branch: 'main' }. */
async function upstreamOf(r: GitRunner, branch: string): Promise<{ ref: string; remote: string; branch: string } | null> {
  const out = await r.run(['for-each-ref', '--format=%(upstream:short)%00%(upstream:remotename)%00%(upstream:remoteref)', `refs/heads/${branch}`])
  const [ref = '', remote = '', remoteRef = ''] = out.stdout.trim().split('\0')
  return ref && remote ? { ref, remote, branch: remoteRef.replace(/^refs\/heads\//, '') } : null
}

/** I remote su cui c'è un branch con questo nome. */
async function remotesWith(r: GitRunner, branch: string): Promise<string[]> {
  const remotes = (await r.run(['remote'])).stdout.split('\n').filter(Boolean)
  const found: string[] = []
  for (const remote of remotes) if (await exists(r, `refs/remotes/${remote}/${branch}`)) found.push(remote)
  return found
}

export async function flowInit(r: GitRunner, c: { main: string; develop: string; prefixes: Record<FlowType, string>; versionTag: string }): Promise<void> {
  const set = (key: string, value: string) => r.run(['config', key, value], write)
  await set('gitflow.branch.master', c.main)
  await set('gitflow.branch.develop', c.develop)
  for (const type of FLOW_TYPES) await set(`gitflow.prefix.${type}`, c.prefixes[type])
  await set('gitflow.prefix.versiontag', c.versionTag)
  if (await exists(r, `refs/heads/${c.develop}`)) return
  // Develop solo sul remote: il branch locale lo segue; altrimenti nasce dalla produzione
  const [remote] = await remotesWith(r, c.develop)
  if (remote) {
    await r.run(['branch', '--track', c.develop, `${remote}/${c.develop}`], write)
    return
  }
  const [mainRemote] = await remotesWith(r, c.main)
  const start = (await exists(r, `refs/heads/${c.main}`)) ? c.main : mainRemote ? `${mainRemote}/${c.main}` : null
  if (!start) throw new Error(t('flow.noMain', { branch: c.main }))
  await r.run(['branch', '--no-track', c.develop, start], write)
}

export async function flowStart(
  r: GitRunner,
  c: { type: FlowType; name: string; base: string; checkout: boolean; publish: string | null },
  onProgress: Progress,
): Promise<void> {
  const config = await requireConfig(r)
  const branch = `${config.prefixes[c.type]}${c.name}`
  await r.run(c.checkout ? ['switch', '--no-track', '-c', branch, c.base] : ['branch', '--no-track', branch, c.base], write)
  // I support non finiscono: la base non serve
  if (c.type !== 'support') await r.run(['config', `gitflow.branch.${branch}.base`, c.base], write)
  if (c.publish) await r.run(['push', '--progress', '-u', c.publish, `refs/heads/${branch}:refs/heads/${branch}`], { ...write, onProgress })
}

/** Il branch release aperto (il primo), per gli hotfix della produzione. */
async function openRelease(r: GitRunner, config: FlowConfig): Promise<string | null> {
  const heads = (await r.run(['for-each-ref', '--format=%(refname:short)', 'refs/heads'])).stdout.split('\n')
  return heads.find((h) => flowTypeOf(h, config) === 'release') ?? null
}

/** Destinazioni, tag e remote del Finish di un branch di git flow. */
export async function finishInfo(r: GitRunner, branch: string): Promise<FlowFinishInfo> {
  const config = await requireConfig(r)
  const type = flowTypeOf(branch, config)
  if (!type || type === 'support' || !(await exists(r, `refs/heads/${branch}`))) throw new Error(t('flow.notFinishable', { branch }))
  const name = branch.slice(config.prefixes[type].length)
  const base = config.bases[branch]
  const targets: string[] = []
  if (type === 'feature' || type === 'bugfix') {
    targets.push(base ?? config.develop)
  } else if (type === 'release') {
    targets.push(config.main, config.develop)
  } else {
    const first = base ?? config.main
    targets.push(first)
    // Un hotfix della produzione va anche nella release aperta, se c'è, altrimenti in develop (come git flow)
    if (first === config.main) targets.push((await openRelease(r, config)) ?? config.develop)
  }
  const tag = type === 'release' || type === 'hotfix' ? `${config.versionTag}${name}` : null
  const tagExists = tag ? await exists(r, `refs/tags/${tag}`) : false
  const [own, remotes] = await Promise.all([upstreamOf(r, branch), remotesWith(r, branch)])
  return {
    branch,
    type,
    name,
    targets: await Promise.all(
      targets.map(async (target, i) => {
        const up = await upstreamOf(r, target)
        // Dopo la prima destinazione arriva il tag (se c'è), non il branch
        const merged = i === 0 || !tag ? await isAncestor(r, branch, target) : tagExists && (await isAncestor(r, tag, target))
        return { branch: target, merged, upstream: up?.ref ?? null, remote: up?.remote ?? null }
      }),
    ),
    tag: tag ? { name: tag, exists: tagExists } : null,
    remote: own && remotes.includes(own.remote) ? own.remote : (remotes[0] ?? null),
  }
}

/** Porta branch al suo upstream in fast-forward; niente se è già avanti o allineato; errore se si sono separati. */
async function fastForwardTo(r: GitRunner, branch: string, upstream: string): Promise<void> {
  if (await isAncestor(r, upstream, branch)) return
  if (!(await isAncestor(r, branch, upstream))) throw new Error(t('flow.diverged', { branch, upstream }))
  if ((await currentBranch(r)) === branch) await r.run(['merge', '--ff-only', upstream], write)
  else await r.run(['update-ref', `refs/heads/${branch}`, upstream], write)
}

/** Il commit che ha portato branch in target: il più vecchio della linea principale di target che lo contiene; la punta se è entrato in fast-forward. */
async function mergePoint(r: GitRunner, branch: string, target: string): Promise<string> {
  const line = (await r.run(['rev-list', '--first-parent', '--ancestry-path', `${branch}..${target}`])).stdout.trim().split('\n').filter(Boolean)
  const oldest = line[line.length - 1]
  if (!oldest) return branch
  const [parent, tip] = (await r.run(['rev-parse', `${oldest}^1`, branch])).stdout.trim().split('\n')
  return parent === tip ? branch : oldest
}

/** Finish locale: ogni passo controlla se è già fatto, così dopo un conflitto o una PR unita sul server un nuovo Finish riprende. */
export async function flowFinish(
  r: GitRunner,
  o: { branch: string; update: boolean; tagMessage: string; deleteBranch: boolean; deleteRemote: boolean; push: boolean },
  onProgress: Progress,
): Promise<void> {
  const info = await finishInfo(r, o.branch)
  const targets = await Promise.all(info.targets.map(async (x) => ({ branch: x.branch, up: await upstreamOf(r, x.branch) })))
  if (o.update) {
    for (const remote of new Set(targets.flatMap((x) => (x.up ? [x.up.remote] : [])))) {
      await r.run(['fetch', '--progress', remote], { ...write, onProgress })
    }
    for (const x of targets) if (x.up) await fastForwardTo(r, x.branch, x.up.ref)
  }
  /** Merge di source in target, se non lo contiene già; con un conflitto ci si ferma qui e il merge resta in corso. */
  const mergeInto = async (target: string, source: string) => {
    if (await isAncestor(r, source, target)) return
    await r.run(['switch', target], write)
    await r.run(['merge', '--no-ff', '--no-edit', source], write)
  }
  const first = targets[0]?.branch ?? ''
  await mergeInto(first, o.branch)
  if (info.tag && !(await exists(r, `refs/tags/${info.tag.name}`))) {
    await r.run(['tag', '-a', info.tag.name, '-m', o.tagMessage.trim() || info.tag.name, await mergePoint(r, o.branch, first)], write)
  }
  // Release e hotfix tornano in develop (o nella release aperta) con il tag, come git-flow-avh: così develop contiene il tag
  for (const x of targets.slice(1)) await mergeInto(x.branch, info.tag?.name ?? o.branch)
  if (o.push) {
    for (const x of targets) {
      if (x.up) await r.run(['push', '--progress', x.up.remote, `refs/heads/${x.branch}:refs/heads/${x.up.branch}`], { ...write, onProgress })
    }
    const remote = targets.find((x) => x.up)?.up?.remote
    if (info.tag && remote) await r.run(['push', '--progress', remote, `refs/tags/${info.tag.name}`], { ...write, onProgress })
  }
  const last = targets[targets.length - 1]?.branch ?? first
  if ((await currentBranch(r)) !== last) await r.run(['switch', last], write)
  if (!o.deleteBranch) return
  // -d rifiuterebbe un branch pubblicato con commit non pushati, anche se è nella destinazione: lo si controlla qui
  await r.run(['branch', (await isAncestor(r, o.branch, last)) ? '-D' : '-d', o.branch], write)
  if (o.deleteRemote && info.remote) await r.run(['push', '--progress', info.remote, '--delete', o.branch], { ...write, onProgress })
  // exit 5: la chiave non c'era
  await r.run(['config', '--unset', `gitflow.branch.${o.branch}.base`], { ...write, okCodes: [0, 5] })
}
