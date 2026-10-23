import { isAbsolute } from 'node:path'
import { DIFF_ALGORITHMS } from '../shared/preferences'
import type { CommitTemplate, DiffOptions, GitConfigKey, Operation, Preferences, RebaseStep, RepoCommand } from '../shared/types'
import type { DiffRequest } from './git/diff'
import { GIT_CONFIG_KEYS } from './git/global-config'

/** Gli argomenti arrivano dal renderer: si validano qui. */
export function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${name} deve essere una stringa non vuota`)
  return value
}

/** Uno SHA che non può essere scambiato per un'opzione di git. */
export function sha(value: unknown): string {
  const s = str(value, 'sha')
  if (!/^[0-9a-f]{4,64}$/i.test(s)) throw new TypeError('sha non valido')
  return s
}

export function int(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new TypeError(`${name} non valido`)
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
    context: v.context === undefined ? 3 : intIn(v.context, 'Righe di contesto', 1, 20),
    algorithm: v.algorithm === undefined ? 'default' : oneOf(v.algorithm, DIFF_ALGORITHMS, 'Algoritmo del diff'),
  }
}

const MAX_TEXT = 50 * 1024 * 1024

/** Percorso relativo dentro il repo. */
export function relPath(value: unknown): string {
  const p = str(value, 'path')
  if (isAbsolute(p) || p.split(/[\\/]/).includes('..')) throw new TypeError(`percorso non valido: ${p}`)
  return p
}

export function list<T>(value: unknown, item: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) throw new TypeError('elenco non valido')
  return value.map(item)
}

export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new TypeError(`${name} non valido`)
  return value
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (!options.includes(value as T)) throw new TypeError(`${name} non valido`)
  return value as T
}

export function stashRef(value: unknown): string {
  const ref = str(value, 'ref')
  if (!/^stash@\{\d+\}$/.test(ref)) throw new TypeError('stash non valido')
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
  const s = str(value, 'nome')
  if (s.startsWith('-') || /[\s~^:?*[\\]|\.\.|@\{/.test(s) || NOT_PRINTABLE.test(s)) throw new TypeError(`nome non valido: ${s}`)
  return s
}

/** Revisione (sha, branch, HEAD~2, origin/main): non deve sembrare un'opzione. */
export function revision(value: unknown): string {
  const s = str(value, 'revisione')
  if (s.startsWith('-') || /\s/.test(s) || NOT_PRINTABLE.test(s)) throw new TypeError(`revisione non valida: ${s}`)
  return s
}

export function gitUrl(value: unknown): string {
  const s = str(value, 'url')
  if (s.startsWith('-') || /\s/.test(s) || s.length > 2000) throw new TypeError(`URL non valido: ${s}`)
  return s
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
    case 'rebaseInteractive':
      return { kind: 'rebaseInteractive', sha: sha(v.sha), steps: list(v.steps, rebaseStep) }
    default:
      throw new TypeError('comando non valido')
  }
}

export function intIn(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${name}: serve un numero intero da ${min} a ${max}`)
  }
  return value
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${name} non valido`)
  return value
}

function absolutePath(value: unknown, name: string): string | null {
  if (value === null) return null
  const s = str(value, name)
  if (!isAbsolute(s) || s.length > 1024) throw new TypeError(`${name}: serve un percorso assoluto`)
  return s
}

/** Preferenze dopo una modifica parziale: si valida il risultato, così i vincoli fra campi valgono sempre. */
export function preferences(current: Preferences, patch: unknown): Preferences {
  const p = { ...current, ...(typeof patch === 'object' && patch !== null ? patch : {}) } as Record<string, unknown>
  const subjectWarn = intIn(p.subjectWarn, "Avviso sull'oggetto", 20, 200)
  return {
    theme: oneOf(p.theme, ['system', 'light', 'dark'] as const, 'Tema'),
    autoFetchMinutes: intIn(p.autoFetchMinutes, 'Fetch automatico', 0, 60),
    fetchPrune: bool(p.fetchPrune, 'Prune'),
    restoreTabs: bool(p.restoreTabs, 'Riapri le tab'),
    subjectWarn,
    subjectLimit: intIn(p.subjectLimit, "Limite dell'oggetto", subjectWarn, 200),
    bodyGuide: p.bodyGuide === 0 ? 0 : intIn(p.bodyGuide, 'Guida della descrizione', 40, 200),
    diffSplit: bool(p.diffSplit, 'Vista del diff'),
    diffIgnoreWhitespace: bool(p.diffIgnoreWhitespace, 'Ignora spazi'),
    diffContext: intIn(p.diffContext, 'Righe di contesto', 1, 20),
    diffAlgorithm: oneOf(p.diffAlgorithm, DIFF_ALGORITHMS, 'Algoritmo del diff'),
    codeFontSize: intIn(p.codeFontSize, 'Dimensione del carattere', 10, 20),
    tabSize: intIn(p.tabSize, 'Larghezza del tab', 1, 8),
    editorApp: absolutePath(p.editorApp, 'Editor'),
    terminalApp: absolutePath(p.terminalApp, 'Terminale'),
    cloneFolder: absolutePath(p.cloneFolder, 'Cartella dei clone'),
  }
}

/** Una chiave della sezione Git e il suo valore; '' = togli la chiave. */
export function gitConfigEntry(key: unknown, value: unknown): [GitConfigKey, string] {
  const k = oneOf(key, GIT_CONFIG_KEYS, 'chiave')
  if (typeof value !== 'string' || /[\r\n\0]/.test(value) || value.length > 200) throw new TypeError(`${k}: valore non valido`)
  const v = value.trim()
  if (v === '') return [k, '']
  if (v.startsWith('-')) throw new TypeError(`${k}: il valore non può iniziare con "-"`)
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
  if (!Array.isArray(value) || value.length > 200) throw new TypeError('elenco dei template non valido')
  const ids = new Set<string>()
  return value.map((raw) => {
    const t = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const id = str(t.id, 'id')
    if (!/^[\w-]{1,64}$/.test(id) || ids.has(id)) throw new TypeError(`id del template non valido: ${id}`)
    ids.add(id)
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    if (!name || name.length > 100) throw new TypeError('Il nome di un template deve avere da 1 a 100 caratteri')
    const subject = text(t.subject, 'oggetto')
    const body = text(t.body, 'descrizione')
    if (subject.length > 500 || body.length > 20_000) throw new TypeError(`Il template "${name}" è troppo lungo`)
    return { id, name, subject, body }
  })
}
