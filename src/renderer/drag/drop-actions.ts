import { type Lang, type MessageKey, type Params, translate, translatePlural } from '../../shared/i18n'
import type { RemoteInfo, RepoCommand, WorkingArea, WorkingFile } from '../../shared/types'

export type DragSource =
  | { kind: 'branch'; name: string }
  | { kind: 'remoteBranch'; remote: string; name: string; fullName: string }
  | { kind: 'tag'; name: string }
  | { kind: 'commit'; sha: string }
  | { kind: 'files'; area: WorkingArea; files: WorkingFile[] }
  | { kind: 'stash'; ref: string; sha: string }
  | { kind: 'commitFile'; sha: string; path: string }

export type DropTarget =
  | { kind: 'branch'; name: string }
  | { kind: 'remote'; name: string }
  | { kind: 'remoteBranch'; remote: string; name: string; fullName: string }
  | { kind: 'branchesHeader' }
  | { kind: 'tagsHeader' }
  | { kind: 'stashHeader' }
  | { kind: 'working' }
  | { kind: 'area'; area: 'staged' | 'unstaged' }
  | { kind: 'pullRequests' }

export type DropOperation =
  | { type: 'git'; command: RepoCommand }
  | { type: 'createBranch'; start: string }
  | { type: 'createTag'; sha: string }
  | { type: 'stage' | 'unstage'; files: WorkingFile[] }
  | { type: 'stash'; action: 'apply' | 'pop'; ref: string }
  | { type: 'createPullRequest'; branch: string }

export interface DropContext {
  /** null con HEAD staccato. */
  currentBranch: string | null
  remotes: RemoteInfo[]
  lang: Lang
}

export interface DropAction {
  label: string
  operation: DropOperation
}

const short = (sha: string) => sha.slice(0, 7)
const git = (label: string, command: RepoCommand): DropAction => ({ label, operation: { type: 'git', command } })
const fileLabel = (files: WorkingFile[], lang: Lang) => (files.length === 1 ? (files[0]?.path ?? '') : translatePlural(lang, 'drop.fileCount', files.length))

/** Il commit sul branch corrente o sulle modifiche locali: cherry-pick, con ⌥ revert. */
function commitOnHead(sha: string, alt: boolean, { currentBranch, lang }: DropContext): DropAction {
  return alt
    ? git(translate(lang, 'drop.revert', { sha: short(sha) }), { kind: 'revert', sha })
    : git(translate(lang, currentBranch ? 'drop.cherryPickInto' : 'drop.cherryPick', { sha: short(sha), branch: currentBranch ?? '' }), { kind: 'cherryPick', sha })
}

/** Cosa succede rilasciando source su target (alt: ⌥ tenuto); null se il rilascio non è ammesso. Vedi la spec, tabella dei gesti. */
export function dropAction(source: DragSource, target: DropTarget, alt: boolean, ctx: DropContext): DropAction | null {
  const current = ctx.currentBranch
  const l = (key: MessageKey, params: Params) => translate(ctx.lang, key, params)
  switch (target.kind) {
    case 'branch': {
      if (target.name === current) {
        if (source.kind === 'commit') return commitOnHead(source.sha, alt, ctx)
        if (source.kind !== 'branch' && source.kind !== 'remoteBranch') return null
        const from = source.kind === 'branch' ? source.name : source.fullName
        if (from === current) return null
        return alt
          ? git(l('drop.rebase', { branch: current, onto: from }), { kind: 'rebase', onto: from })
          : git(l('drop.merge', { from, branch: current }), { kind: 'merge', ref: from, noFf: false })
      }
      if (source.kind !== 'remoteBranch') return null
      return alt
        ? git(l('drop.track', { branch: target.name, upstream: source.fullName }), { kind: 'setUpstream', branch: target.name, upstream: source.fullName })
        : git(l('drop.fastForward', { branch: target.name, from: source.fullName }), { kind: 'fastForward', branch: target.name, from: source.fullName })
    }
    case 'remote': {
      if (source.kind !== 'branch') return null
      if (!alt) return git(l('drop.push', { branch: source.name, remote: target.name }), { kind: 'pushBranch', remote: target.name, branch: source.name, remoteBranch: source.name })
      const upstream = `${target.name}/${source.name}`
      const exists = ctx.remotes.some((r) => r.name === target.name && r.branches.some((b) => b.fullName === upstream))
      return exists ? git(l('drop.track', { branch: source.name, upstream }), { kind: 'setUpstream', branch: source.name, upstream }) : null
    }
    case 'remoteBranch':
      if (source.kind !== 'branch') return null
      return alt
        ? git(l('drop.track', { branch: source.name, upstream: target.fullName }), { kind: 'setUpstream', branch: source.name, upstream: target.fullName })
        : git(l('drop.push', { branch: source.name, remote: target.fullName }), { kind: 'pushBranch', remote: target.remote, branch: source.name, remoteBranch: target.name })
    case 'branchesHeader': {
      const start =
        source.kind === 'branch' || source.kind === 'tag'
          ? source.name
          : source.kind === 'remoteBranch'
            ? source.fullName
            : source.kind === 'commit'
              ? source.sha
              : null
      if (!start) return null
      return { label: l('drop.newBranch', { start: source.kind === 'commit' ? short(start) : start }), operation: { type: 'createBranch', start } }
    }
    case 'tagsHeader':
      return source.kind === 'commit' ? { label: l('drop.newTag', { sha: short(source.sha) }), operation: { type: 'createTag', sha: source.sha } } : null
    case 'stashHeader': {
      if (source.kind !== 'files' || source.area === 'conflicted') return null
      const paths = source.files.flatMap((f) => (f.oldPath ? [f.oldPath, f.path] : [f.path]))
      return git(l('drop.stash', { files: fileLabel(source.files, ctx.lang) }), { kind: 'stashFiles', paths, untracked: source.area === 'untracked' })
    }
    case 'pullRequests':
      return source.kind === 'branch' ? { label: l('drop.pullRequest', { branch: source.name }), operation: { type: 'createPullRequest', branch: source.name } } : null
    case 'working':
      if (source.kind === 'commit') return commitOnHead(source.sha, alt, ctx)
      if (source.kind === 'stash') {
        const action = alt ? 'pop' : 'apply'
        return { label: l(alt ? 'drop.pop' : 'drop.apply', { ref: source.ref }), operation: { type: 'stash', action, ref: source.ref } }
      }
      if (source.kind === 'commitFile') {
        const name = source.path.split('/').pop() ?? source.path
        return git(l('drop.applyFile', { name }), { kind: 'applyFileChanges', sha: source.sha, path: source.path })
      }
      return null
    case 'area':
      if (source.kind !== 'files') return null
      if (target.area === 'staged' && (source.area === 'unstaged' || source.area === 'untracked')) {
        return { label: l('drop.stage', { files: fileLabel(source.files, ctx.lang) }), operation: { type: 'stage', files: source.files } }
      }
      if (target.area === 'unstaged' && source.area === 'staged') {
        return { label: l('drop.unstage', { files: fileLabel(source.files, ctx.lang) }), operation: { type: 'unstage', files: source.files } }
      }
      return null
  }
}
