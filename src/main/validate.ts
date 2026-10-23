import { isAbsolute } from 'node:path'
import { FLOW_TYPES } from '../shared/flow'
import { LANGUAGES } from '../shared/i18n'
import { DIFF_ALGORITHMS } from '../shared/preferences'
import type {
  CommitTemplate,
  DiffOptions,
  FlowType,
  GitConfigKey,
  HostingService,
  MergeMethod,
  MergeOptions,
  NewPullRequest,
  Operation,
  Preferences,
  PullRequestFilter,
  RebaseStep,
  RepoCommand,
} from '../shared/types'
import type { DiffRequest } from './git/diff'
import { GIT_CONFIG_KEYS } from './git/global-config'
import { t } from './i18n'

/** Gli argomenti arrivano dal renderer: si validano qui. */
export function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new TypeError(t('validation.required', { name }))
  return value
}

/** Uno SHA che non può essere scambiato per un'opzione di git. */
export function sha(value: unknown): string {
  const s = str(value, 'sha')
  if (!/^[0-9a-f]{4,64}$/i.test(s)) throw new TypeError(t('validation.invalid', { name: 'sha' }))
  return s
}

export function int(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new TypeError(t('validation.invalid', { name }))
  return value
}

export function fileRequest(value: unknown): DiffRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as { path?: unknown; oldPath?: unknown }
  const path = str(v.path, 'path')
  return v.oldPath === undefined ? { path } : { path, oldPath: str(v.oldPath, 'oldPath') }
}

export function diffOptions(value: unknown): DiffOptions {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    ignoreWhitespace: v.ignoreWhitespace === true,
    force: v.force === true,
    context: v.context === undefined ? 3 : intIn(v.context, t('setting.diffContext'), 1, 20),
    algorithm: v.algorithm === undefined ? 'default' : oneOf(v.algorithm, DIFF_ALGORITHMS, t('setting.diffAlgorithm')),
  }
}

const MAX_TEXT = 50 * 1024 * 1024

/** Percorso relativo dentro il repo. */
export function relPath(value: unknown): string {
  const p = str(value, 'path')
  if (isAbsolute(p) || p.split(/[\\/]/).includes('..')) throw new TypeError(t('validation.invalidPath', { path: p }))
  return p
}

export function list<T>(value: unknown, item: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) throw new TypeError(t('validation.invalidList'))
  return value.map(item)
}

export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new TypeError(t('validation.invalid', { name }))
  return value
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (!options.includes(value as T)) throw new TypeError(t('validation.invalid', { name }))
  return value as T
}

export function stashRef(value: unknown): string {
  const ref = str(value, 'ref')
  if (!/^stash@\{\d+\}$/.test(ref)) throw new TypeError(t('validation.invalid', { name: 'stash' }))
  return ref
}

/** Il file e, per le rinomine, anche il vecchio percorso. */
export function withOldPath(value: unknown): string[] {
  const f = fileRequest(value)
  return f.oldPath ? [relPath(f.oldPath), relPath(f.path)] : [relPath(f.path)]
}

const NOT_PRINTABLE = /[^\x20-\x7e\u00a0-\uffff]/

/** Nome di branch, tag o remote: niente opzioni travestite (-x) né caratteri che git non ammette. */
export function refName(value: unknown): string {
  const s = str(value, t('field.name'))
  if (s.startsWith('-') || /[\s~^:?*[\\]|\.\.|@\{/.test(s) || NOT_PRINTABLE.test(s)) throw new TypeError(t('validation.invalidName', { value: s }))
  return s
}

/** Revisione (sha, branch, HEAD~2, origin/main): non deve sembrare un'opzione. */
export function revision(value: unknown): string {
  const s = str(value, t('field.revision'))
  if (s.startsWith('-') || /\s/.test(s) || NOT_PRINTABLE.test(s)) throw new TypeError(t('validation.invalidRevision', { value: s }))
  return s
}

export function gitUrl(value: unknown): string {
  const s = str(value, t('field.url'))
  if (s.startsWith('-') || /\s/.test(s) || s.length > 2000) throw new TypeError(t('validation.invalidUrl', { value: s }))
  return s
}

const NOT_REF = /[\s~^:?*[\\]|\.\.|@\{/

/** Prefisso di git flow: vuoto o un frammento di nome di ref. */
function flowPrefix(value: unknown): string {
  if (typeof value !== 'string' || value.length > 50 || value.startsWith('-') || NOT_REF.test(value) || NOT_PRINTABLE.test(value)) {
    throw new TypeError(t('validation.flowPrefix', { value: String(value) }))
  }
  return value
}

function flowPrefixes(value: unknown): Record<FlowType, string> {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const prefixes = Object.fromEntries(FLOW_TYPES.map((type) => [type, flowPrefix(v[type])])) as Record<FlowType, string>
  const used = Object.values(prefixes).filter(Boolean)
  if (new Set(used).size !== used.length) throw new TypeError(t('validation.flowPrefixes'))
  return prefixes
}

const OPERATIONS = ['merge', 'rebase', 'cherry-pick', 'revert'] as const satisfies readonly Operation[]

function rebaseStep(value: unknown): RebaseStep {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const action = oneOf(v.action, ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'] as const, 'action')
  return action === 'reword' ? { sha: sha(v.sha), action, message: text(v.message, 'message') } : { sha: sha(v.sha), action }
}

/** Le operazioni su branch, tag e remote: ogni variante ha i suoi campi, validati uno per uno. */
export function repoCommand(value: unknown): RepoCommand {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  switch (v.kind) {
    case 'createBranch':
      return { kind: 'createBranch', name: refName(v.name), start: revision(v.start), checkout: v.checkout === true }
    case 'checkoutBranch':
      return { kind: 'checkoutBranch', name: refName(v.name) }
    case 'checkoutRemote':
      return { kind: 'checkoutRemote', fullName: refName(v.fullName) }
    case 'checkoutDetached':
      return { kind: 'checkoutDetached', sha: sha(v.sha) }
    case 'renameBranch':
      return { kind: 'renameBranch', from: refName(v.from), to: refName(v.to) }
    case 'deleteBranch':
      return { kind: 'deleteBranch', name: refName(v.name), force: v.force === true }
    case 'deleteRemoteBranch':
      return { kind: 'deleteRemoteBranch', remote: refName(v.remote), name: refName(v.name) }
    case 'setUpstream':
      return { kind: 'setUpstream', branch: refName(v.branch), upstream: v.upstream === null ? null : refName(v.upstream) }
    case 'merge':
      return { kind: 'merge', ref: revision(v.ref), noFf: v.noFf === true }
    case 'rebase':
      return { kind: 'rebase', onto: revision(v.onto) }
    case 'cherryPick':
      return { kind: 'cherryPick', sha: sha(v.sha) }
    case 'revert':
      return { kind: 'revert', sha: sha(v.sha) }
    case 'reset':
      return { kind: 'reset', sha: sha(v.sha), mode: oneOf(v.mode, ['soft', 'mixed', 'hard'] as const, 'mode') }
    case 'operation':
      return { kind: 'operation', op: oneOf(v.op, OPERATIONS, 'op'), step: oneOf(v.step, ['continue', 'skip', 'abort'] as const, 'step') }
    case 'createTag':
      return { kind: 'createTag', name: refName(v.name), sha: sha(v.sha), message: text(v.message ?? '', 'message') }
    case 'deleteTag':
      return { kind: 'deleteTag', name: refName(v.name) }
    case 'pushTag':
      return { kind: 'pushTag', remote: refName(v.remote), name: refName(v.name) }
    case 'fetch':
      return { kind: 'fetch' }
    case 'pull':
      return { kind: 'pull', mode: oneOf(v.mode, ['config', 'rebase', 'merge'] as const, 'mode') }
    case 'push':
      return { kind: 'push', remote: refName(v.remote), force: v.force === true }
    case 'addRemote':
      return { kind: 'addRemote', name: refName(v.name), url: gitUrl(v.url) }
    case 'removeRemote':
      return { kind: 'removeRemote', name: refName(v.name) }
    case 'pushBranch':
      return { kind: 'pushBranch', remote: refName(v.remote), branch: refName(v.branch), remoteBranch: refName(v.remoteBranch) }
    case 'fastForward':
      return { kind: 'fastForward', branch: refName(v.branch), from: refName(v.from) }
    case 'stashFiles':
      return { kind: 'stashFiles', paths: list(v.paths, relPath), untracked: v.untracked === true }
    case 'applyFileChanges':
      return { kind: 'applyFileChanges', sha: sha(v.sha), path: relPath(v.path) }
    case 'flowInit':
      return { kind: 'flowInit', main: refName(v.main), develop: refName(v.develop), prefixes: flowPrefixes(v.prefixes), versionTag: flowPrefix(v.versionTag) }
    case 'flowStart':
      return {
        kind: 'flowStart',
        type: oneOf(v.type, FLOW_TYPES, 'type'),
        name: refName(v.name),
        base: revision(v.base),
        checkout: v.checkout === true,
        publish: v.publish === null || v.publish === undefined ? null : refName(v.publish),
      }
    case 'flowFinish':
      return {
        kind: 'flowFinish',
        branch: refName(v.branch),
        update: v.update === true,
        tagMessage: limitedText(v.tagMessage ?? '', t('field.message'), 10_000),
        deleteBranch: v.deleteBranch === true,
        deleteRemote: v.deleteRemote === true,
        push: v.push === true,
      }
    case 'rebaseInteractive':
      return { kind: 'rebaseInteractive', sha: sha(v.sha), steps: list(v.steps, rebaseStep) }
    default:
      throw new TypeError(t('validation.invalidCommand'))
  }
}

export function intIn(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(t('validation.integerRange', { name, min, max }))
  }
  return value
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(t('validation.invalid', { name }))
  return value
}

function absolutePath(value: unknown, name: string): string | null {
  if (value === null) return null
  const s = str(value, name)
  if (!isAbsolute(s) || s.length > 1024) throw new TypeError(t('validation.absolutePath', { name }))
  return s
}

/** Preferenze dopo una modifica parziale: si valida il risultato, così i vincoli fra campi valgono sempre. */
export function preferences(current: Preferences, patch: unknown): Preferences {
  const p = { ...current, ...(typeof patch === 'object' && patch !== null ? patch : {}) } as Record<string, unknown>
  const subjectWarn = intIn(p.subjectWarn, t('setting.subjectWarn'), 20, 200)
  return {
    language: oneOf(p.language, LANGUAGES, t('setting.language')),
    theme: oneOf(p.theme, ['system', 'light', 'dark'] as const, t('setting.theme')),
    panelLayout: oneOf(p.panelLayout, ['horizontal', 'vertical'] as const, t('setting.panelLayout')),
    autoFetchMinutes: intIn(p.autoFetchMinutes, t('setting.autoFetch'), 0, 60),
    fetchPrune: bool(p.fetchPrune, t('setting.prune')),
    restoreTabs: bool(p.restoreTabs, t('setting.restoreTabs')),
    subjectWarn,
    subjectLimit: intIn(p.subjectLimit, t('setting.subjectLimit'), subjectWarn, 200),
    bodyGuide: p.bodyGuide === 0 ? 0 : intIn(p.bodyGuide, t('setting.bodyGuide'), 40, 200),
    diffSplit: bool(p.diffSplit, t('setting.diffView')),
    diffIgnoreWhitespace: bool(p.diffIgnoreWhitespace, t('setting.ignoreWhitespace')),
    diffContext: intIn(p.diffContext, t('setting.diffContext'), 1, 20),
    diffAlgorithm: oneOf(p.diffAlgorithm, DIFF_ALGORITHMS, t('setting.diffAlgorithm')),
    codeFontSize: intIn(p.codeFontSize, t('setting.codeFontSize'), 10, 20),
    tabSize: intIn(p.tabSize, t('setting.tabSize'), 1, 8),
    editorApp: absolutePath(p.editorApp, t('setting.editor')),
    terminalApp: absolutePath(p.terminalApp, t('setting.terminal')),
    cloneFolder: absolutePath(p.cloneFolder, t('setting.cloneFolder')),
  }
}

/** Una chiave della sezione Git e il suo valore; '' = togli la chiave. */
export function gitConfigEntry(key: unknown, value: unknown): [GitConfigKey, string] {
  const k = oneOf(key, GIT_CONFIG_KEYS, t('field.key'))
  if (typeof value !== 'string' || /[\r\n\0]/.test(value) || value.length > 200) throw new TypeError(t('validation.configValue', { key: k }))
  const v = value.trim()
  if (v === '') return [k, '']
  if (v.startsWith('-')) throw new TypeError(t('validation.configDash', { key: k }))
  switch (k) {
    case 'commit.gpgsign':
    case 'pull.rebase':
      return [k, oneOf(v, ['true', 'false'] as const, k)]
    case 'gpg.format':
      return [k, oneOf(v, ['openpgp', 'ssh', 'x509'] as const, k)]
    case 'init.defaultBranch':
      return [k, refName(v)]
    default:
      return [k, v]
  }
}

/** La libreria dei template: id unici, nomi con trim, testi entro i limiti. */
export function commitTemplates(value: unknown): CommitTemplate[] {
  if (!Array.isArray(value) || value.length > 200) throw new TypeError(t('validation.templateList'))
  const ids = new Set<string>()
  return value.map((raw) => {
    const tpl = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const id = str(tpl.id, 'id')
    if (!/^[\w-]{1,64}$/.test(id) || ids.has(id)) throw new TypeError(t('validation.templateId', { id }))
    ids.add(id)
    const name = typeof tpl.name === 'string' ? tpl.name.trim() : ''
    if (!name || name.length > 100) throw new TypeError(t('validation.templateName'))
    const subject = text(tpl.subject, t('field.subject'))
    const body = text(tpl.body, t('field.description'))
    if (subject.length > 500 || body.length > 20_000) throw new TypeError(t('validation.templateTooLong', { name }))
    return { id, name, subject, body }
  })
}

export const HOSTING_SERVICES = ['github', 'gitlab'] as const satisfies readonly HostingService[]
export const PR_FILTERS = ['open', 'merged', 'closed', 'all'] as const satisfies readonly PullRequestFilter[]
const MERGE_METHODS = ['merge', 'squash', 'rebase', 'ff'] as const satisfies readonly MergeMethod[]
export const MAX_BODY = 65_536

/** Server di un account: nome con la porta facoltativa, senza schema né percorso. */
export function server(value: unknown): string {
  const s = str(value, t('field.server')).trim().toLowerCase()
  if (s.length > 253 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(s)) throw new TypeError(t('validation.invalidServer', { value: s }))
  return s
}

export function token(value: unknown): string {
  const s = str(value, 'token').trim()
  if (!s || /\s/.test(s) || s.length > 1000) throw new TypeError(t('validation.invalid', { name: 'token' }))
  return s
}

export function accountId(value: unknown): string {
  const s = str(value, 'id')
  if (!/^[\w-]{1,64}$/.test(s)) throw new TypeError(t('validation.invalid', { name: 'id' }))
  return s
}

export const prNumber = (value: unknown): number => intIn(value, '#', 1, 2 ** 31 - 1)

/** Testo fino a max caratteri; con required non può essere vuoto. */
export function limitedText(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new TypeError(t('validation.invalid', { name }))
  if (value.length > max) throw new TypeError(t('validation.tooLong', { name, max }))
  if (required && !value.trim()) throw new TypeError(t('validation.required', { name }))
  return value
}

export function mergeOptions(value: unknown): MergeOptions {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    method: oneOf(v.method, MERGE_METHODS, 'method'),
    sha: sha(v.sha),
    message: limitedText(v.message ?? '', t('field.message'), MAX_BODY),
    squash: v.squash === true,
    deleteBranch: v.deleteBranch === true,
  }
}

export function newPullRequest(value: unknown): NewPullRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    remote: refName(v.remote),
    base: refName(v.base),
    headRemote: refName(v.headRemote),
    head: refName(v.head),
    title: limitedText(v.title, t('field.title'), 256, true).trim(),
    body: limitedText(v.body ?? '', t('field.description'), MAX_BODY),
    draft: v.draft === true,
  }
}

/** Branch di destinazione e SHA di una PR, per scaricarne gli oggetti. */
export function pullRequestRefs(value: unknown): { base: string; baseSha: string; headSha: string } {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return { base: refName(v.base), baseSha: sha(v.baseSha), headSha: sha(v.headSha) }
}
