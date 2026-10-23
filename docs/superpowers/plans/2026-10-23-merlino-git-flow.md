# Merlino — Git flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Git flow in Merlino come in Tower: inizializzazione, Start e Finish di feature, bugfix, release, hotfix e support (senza Finish), con il Finish in locale o via pull request.

**Architecture:**
- **Main**:
  - `src/main/git/flow.ts` legge la configurazione `gitflow.*` (le chiavi di git-flow-avh) e fa init, start e finish con comandi git normali, come tre nuove varianti di `RepoCommand` (validate, nella coda di scrittura);
  - `finishInfo` calcola destinazioni, tag e remote del Finish, sia per il riepilogo del dialog sia per l'esecuzione.
- **Shared**: `src/shared/flow.ts` con le funzioni pure usate da main e renderer.
- **Renderer**:
  - lo store del repo tiene la configurazione e il dialog aperto;
  - tre dialog (init, start, finish);
  - le azioni stanno nel pulsante "Git Flow" della barra, nella palette e nel menu dei branch.

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, Vitest, Playwright; git ≥ 2.35.

Spec: `docs/superpowers/specs/2026-10-23-merlino-git-flow-design.md`. Branch: `feature/git-flow`, che parte da `develop`.

## Global Constraints

- **Chiavi**: `gitflow.branch.master`, `gitflow.branch.develop`, `gitflow.prefix.{feature,bugfix,release,hotfix,support,versiontag}`, `gitflow.branch.<branch>.base`. Si scrivono nella config locale del repo.
- **Prefissi predefiniti**: `feature/`, `bugfix/`, `release/`, `hotfix/`, `support/`; il tag predefinito è `v`.
- **Merge**: sempre `git merge --no-ff --no-edit`. Con un conflitto il Finish si ferma e il merge resta in corso; un nuovo Finish riprende, perché ogni passo controlla se è già fatto.
- **Tag**: annotato, sul commit che ha portato il branch nella prima destinazione: `rev-list --first-parent --ancestry-path <branch>..<dest>`, il più vecchio. Se quel commit ha come primo genitore la punta del branch (fast-forward), si mette sulla punta. Verificato su git 2.50.
- **Validazione**:
  - nomi e branch con `refName`;
  - basi con `revision`;
  - prefissi vuoti o frammenti di ref (niente spazi, `..`, `~^:?*[\`, `@{`), fino a 50 caratteri, diversi fra loro se non vuoti;
  - messaggio del tag fino a 10 000 caratteri.
- **Testi**: inglese e italiano. I messaggi dei tag ("Release 0.2.0", "Hotfix 0.1.1") sono contenuto del repo, quindi in inglese.
- **Test**: finestra nascosta e nomi fittizi.

---

### Task 1: Funzioni pure e tipi

**Files:**
- Create: `src/shared/flow.ts`
- Modify: `src/shared/types.ts`
- Test: `test/unit/flow.test.ts`

**Interfaces:**
- Produces:
  - `type FlowType = 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support'`;
  - `interface FlowConfig { main; develop; prefixes: Record<FlowType, string>; versionTag: string; bases: Record<string, string> }`;
  - `interface FlowFinishInfo { branch; type: Exclude<FlowType, 'support'>; name; targets: { branch; merged: boolean; upstream: string | null; remote: string | null }[]; tag: { name; exists: boolean } | null; remote: string | null }`;
  - `FLOW_TYPES`, `DEFAULT_FLOW_PREFIXES`;
  - `flowTypeOf(branch, config): FlowType | null`, `flowName(branch, config): string`;
  - `nextVersion(tags, prefix, kind: 'release' | 'hotfix' | 'support'): string`, `latestVersionTag(tags, prefix): string | null`.

- [ ] **Step 1: Test unit**

Crea `test/unit/flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOW_PREFIXES, flowName, flowTypeOf, latestVersionTag, nextVersion } from '../../src/shared/flow'
import type { FlowConfig } from '../../src/shared/types'

const config: FlowConfig = { main: 'main', develop: 'develop', prefixes: { ...DEFAULT_FLOW_PREFIXES, hotfix: 'fix/', support: 'fix/support/' }, versionTag: 'v', bases: {} }

describe('git flow, funzioni pure', () => {
  it('tipo di un branch: il prefisso più lungo; il solo prefisso o nessun prefisso non contano', () => {
    expect(flowTypeOf('feature/login', config)).toBe('feature')
    expect(flowTypeOf('fix/0.1.1', config)).toBe('hotfix')
    expect(flowTypeOf('fix/support/0.1.x', config)).toBe('support')
    expect(flowTypeOf('feature/', config)).toBeNull()
    expect(flowTypeOf('main', config)).toBeNull()
    expect(flowTypeOf('main', { ...config, prefixes: { ...config.prefixes, bugfix: '' } })).toBeNull()
    expect(flowName('release/0.2.0', config)).toBe('0.2.0')
    expect(flowName('main', config)).toBe('main')
  })

  it('versione proposta dall\'ultimo tag X.Y.Z con il prefisso', () => {
    const tags = ['v0.1.0', 'v0.10.2', 'v0.9.9', 'demo', 'v1.0.0-beta', 'x2.0.0']
    expect(latestVersionTag(tags, 'v')).toBe('v0.10.2')
    expect(nextVersion(tags, 'v', 'release')).toBe('0.11.0')
    expect(nextVersion(tags, 'v', 'hotfix')).toBe('0.10.3')
    expect(nextVersion(tags, 'v', 'support')).toBe('0.10.x')
    expect(nextVersion([], 'v', 'release')).toBe('0.1.0')
    expect(nextVersion([], 'v', 'hotfix')).toBe('0.0.1')
    expect(nextVersion(['1.2.3'], '', 'release')).toBe('1.3.0')
    expect(latestVersionTag([], 'v')).toBeNull()
  })
})
```

Run: `npx vitest run test/unit/flow.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: Tipi**

In fondo a `src/shared/types.ts`:

```ts
export type FlowType = 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support'

/** Configurazione di git flow, nelle chiavi gitflow.* di git-flow-avh. */
export interface FlowConfig {
  /** Branch di produzione (gitflow.branch.master). */
  main: string
  develop: string
  prefixes: Record<FlowType, string>
  /** Prefisso dei tag di versione, es. "v"; può essere vuoto. */
  versionTag: string
  /** Branch → la base da cui è partito (gitflow.branch.<branch>.base). */
  bases: Record<string, string>
}

/** Cosa farà il Finish di un branch, per il riepilogo del dialog. */
export interface FlowFinishInfo {
  branch: string
  type: Exclude<FlowType, 'support'>
  /** Nome o versione, senza prefisso. */
  name: string
  /** Destinazioni in ordine; merged: contengono già il branch; upstream: es. origin/main. */
  targets: { branch: string; merged: boolean; upstream: string | null; remote: string | null }[]
  /** Tag di release e hotfix; exists: c'è già. */
  tag: { name: string; exists: boolean } | null
  /** Remote su cui c'è anche il branch; null se è solo locale. */
  remote: string | null
}
```

- [ ] **Step 3: `src/shared/flow.ts`**

```ts
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
```

Run: `npx vitest run test/unit/flow.test.ts`
Expected: PASS.

- [ ] **Step 4: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: tipi e funzioni pure di git flow (tipo di un branch, versione proposta)"
```

---

### Task 2: Init, start e finish con git

**Files:**
- Create: `src/main/git/flow.ts`
- Modify: `src/shared/types.ts` (`RepoCommand`), `src/main/validate.ts`, `src/main/git/branches.ts` (`runCommand`), `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/integration/flow.test.ts`, `test/unit/validate.test.ts`

**Interfaces:**
- Consumes: `FLOW_TYPES`, `DEFAULT_FLOW_PREFIXES`, `flowTypeOf` (Task 1).
- Produces:
  - `parseFlowConfig(out): FlowConfig | null`, `readFlowConfig(runner)`, `finishInfo(runner, branch): Promise<FlowFinishInfo>`;
  - `flowInit(runner, c)`, `flowStart(runner, c, onProgress)`, `flowFinish(runner, c, onProgress)`;
  - varianti di `RepoCommand`:

```ts
  | { kind: 'flowInit'; main: string; develop: string; prefixes: Record<FlowType, string>; versionTag: string }
  | { kind: 'flowStart'; type: FlowType; name: string; base: string; checkout: boolean; publish: string | null }
  | { kind: 'flowFinish'; branch: string; update: boolean; tagMessage: string; deleteBranch: boolean; deleteRemote: boolean; push: boolean }
```

- [ ] **Step 1: Test di integrazione**

Crea `test/integration/flow.test.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { finishInfo, flowFinish, flowInit, flowStart, readFlowConfig } from '../../src/main/git/flow'
import { GitRunner } from '../../src/main/git/runner'
import { DEFAULT_FLOW_PREFIXES } from '../../src/shared/flow'
import { cloneOf, git, makeRemotePair, makeRepo } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})
const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const current = (repo: string) => git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
const exists = (repo: string, ref: string) => {
  try {
    git(repo, 'rev-parse', '--verify', '--quiet', ref)
    return true
  } catch {
    return false
  }
}
const init = { main: 'main', develop: 'develop', prefixes: DEFAULT_FLOW_PREFIXES, versionTag: 'v' }
const finish = { update: false, tagMessage: '', deleteBranch: true, deleteRemote: true, push: false }
const noProgress = () => {}

/** Repo con git flow inizializzato (develop creato da main). */
async function flowRepo() {
  const repo = makeRepo(1)
  await flowInit(runnerFor(repo), init)
  return { repo, r: runnerFor(repo) }
}

describe('git flow', () => {
  it('init: chiavi di git-flow-avh e develop creato da main; letta di nuovo uguale', async () => {
    const { repo, r } = await flowRepo()
    expect(git(repo, 'config', 'gitflow.branch.master').trim()).toBe('main')
    expect(git(repo, 'config', 'gitflow.prefix.feature').trim()).toBe('feature/')
    expect(git(repo, 'rev-parse', 'develop').trim()).toBe(git(repo, 'rev-parse', 'main').trim())
    expect(await readFlowConfig(r)).toEqual({ ...init, bases: {} })
    expect(await readFlowConfig(runnerFor(makeRepo(1)))).toBeNull()
  })

  it('init senza develop locale ma con origin/develop: develop segue il remote', async () => {
    const { bare, clone } = makeRemotePair()
    git(clone, 'push', '-q', 'origin', 'main:develop')
    const other = cloneOf(bare)
    await flowInit(runnerFor(other), init)
    expect(git(other, 'rev-parse', '--abbrev-ref', 'develop@{u}').trim()).toBe('origin/develop')
  })

  it('start: branch dalla base, checkout, base salvata, pubblicazione', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    await flowStart(r, { type: 'feature', name: 'login', base: 'develop', checkout: true, publish: 'origin' }, noProgress)
    expect(current(clone)).toBe('feature/login')
    expect(git(clone, 'config', 'gitflow.branch.feature/login.base').trim()).toBe('develop')
    expect(git(bare, 'branch', '--list', 'feature/login').trim()).toBe('feature/login')
    expect(git(clone, 'rev-parse', '--abbrev-ref', 'feature/login@{u}').trim()).toBe('origin/feature/login')
    await flowStart(r, { type: 'support', name: '0.1.x', base: 'main', checkout: false, publish: null }, noProgress)
    expect(current(clone)).toBe('feature/login')
    expect(exists(clone, 'refs/heads/support/0.1.x')).toBe(true)
    expect(() => git(clone, 'config', 'gitflow.branch.support/0.1.x.base')).toThrow()
  })

  it('finish di una feature: merge --no-ff in develop, branch cancellato anche sul remote, si resta su develop', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    await flowStart(r, { type: 'feature', name: 'login', base: 'develop', checkout: true, publish: 'origin' }, noProgress)
    commitFile(clone, 'login.txt', 'login\n', 'Add login')
    expect(await finishInfo(r, 'feature/login')).toMatchObject({ type: 'feature', name: 'login', targets: [{ branch: 'develop', merged: false }], tag: null, remote: 'origin' })
    await flowFinish(r, { branch: 'feature/login', ...finish }, noProgress)
    expect(current(clone)).toBe('develop')
    expect(git(clone, 'log', '-1', '--format=%s %p', 'develop').trim()).toMatch(/^Merge branch 'feature\/login' into develop \w+ \w+$/)
    expect(exists(clone, 'refs/heads/feature/login')).toBe(false)
    expect(git(bare, 'branch', '--list', 'feature/login').trim()).toBe('')
    expect(() => git(clone, 'config', 'gitflow.branch.feature/login.base')).toThrow()
  })

  it('finish di una release: merge in main, tag annotato sul merge, merge in develop, push', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    git(clone, 'push', '-q', '-u', 'origin', 'develop')
    await flowStart(r, { type: 'release', name: '0.2.0', base: 'develop', checkout: true, publish: null }, noProgress)
    commitFile(clone, 'version.txt', '0.2.0\n', 'Bump version')
    await flowFinish(r, { branch: 'release/0.2.0', ...finish, tagMessage: 'Release 0.2.0', push: true }, noProgress)
    const merge = git(clone, 'rev-parse', 'main').trim()
    expect(git(clone, 'log', '-1', '--format=%s', 'main').trim()).toBe("Merge branch 'release/0.2.0'")
    expect(git(clone, 'rev-parse', 'v0.2.0^{commit}').trim()).toBe(merge)
    expect(git(clone, 'cat-file', '-t', 'v0.2.0').trim()).toBe('tag')
    expect(git(clone, 'tag', '-l', '--format=%(contents:subject)', 'v0.2.0').trim()).toBe('Release 0.2.0')
    expect(git(clone, 'merge-base', '--is-ancestor', merge, 'develop').trim()).toBe('')
    expect(current(clone)).toBe('develop')
    expect(git(bare, 'rev-parse', 'main').trim()).toBe(merge)
    expect(git(bare, 'rev-parse', 'v0.2.0^{commit}').trim()).toBe(merge)
  })

  it('hotfix con una release aperta: va in main e nella release, non in develop', async () => {
    const { repo, r } = await flowRepo()
    await flowStart(r, { type: 'release', name: '0.2.0', base: 'develop', checkout: false, publish: null }, noProgress)
    await flowStart(r, { type: 'hotfix', name: '0.1.1', base: 'main', checkout: true, publish: null }, noProgress)
    commitFile(repo, 'fix.txt', 'fix\n', 'Fix crash')
    expect((await finishInfo(r, 'hotfix/0.1.1')).targets.map((x) => x.branch)).toEqual(['main', 'release/0.2.0'])
    await flowFinish(r, { branch: 'hotfix/0.1.1', ...finish, tagMessage: 'Hotfix 0.1.1' }, noProgress)
    expect(git(repo, 'log', '--format=%s', 'release/0.2.0').split('\n')).toContain('Fix crash')
    expect(git(repo, 'log', '--format=%s', 'develop').split('\n')).not.toContain('Fix crash')
    expect(current(repo)).toBe('release/0.2.0')
  })

  it('hotfix da un branch support: merge e tag nel support, non in main né in develop', async () => {
    const { repo, r } = await flowRepo()
    git(repo, 'tag', 'v0.1.0')
    await flowStart(r, { type: 'support', name: '0.1.x', base: 'v0.1.0', checkout: false, publish: null }, noProgress)
    await flowStart(r, { type: 'hotfix', name: '0.1.1', base: 'support/0.1.x', checkout: true, publish: null }, noProgress)
    commitFile(repo, 'fix.txt', 'fix\n', 'Fix on support')
    await flowFinish(r, { branch: 'hotfix/0.1.1', ...finish, tagMessage: 'Hotfix 0.1.1' }, noProgress)
    expect(git(repo, 'rev-parse', 'v0.1.1^{commit}').trim()).toBe(git(repo, 'rev-parse', 'support/0.1.x').trim())
    expect(git(repo, 'log', '--format=%s', 'main').split('\n')).not.toContain('Fix on support')
    expect(current(repo)).toBe('support/0.1.x')
  })

  it('conflitto: il finish si ferma col merge in corso; dopo la risoluzione riprende', async () => {
    const { repo, r } = await flowRepo()
    await flowStart(r, { type: 'feature', name: 'a', base: 'develop', checkout: true, publish: null }, noProgress)
    commitFile(repo, 'file1.txt', 'feature\n', 'Change on feature')
    git(repo, 'switch', '-q', 'develop')
    commitFile(repo, 'file1.txt', 'develop\n', 'Change on develop')
    await expect(flowFinish(r, { branch: 'feature/a', ...finish }, noProgress)).rejects.toThrow()
    expect(exists(repo, 'MERGE_HEAD')).toBe(true)
    writeFileSync(join(repo, 'file1.txt'), 'both\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '--no-edit')
    await flowFinish(r, { branch: 'feature/a', ...finish }, noProgress)
    expect(exists(repo, 'refs/heads/feature/a')).toBe(false)
  })

  it('release già unita in main via PR sul server: tag sul merge della PR, poi develop', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    git(clone, 'push', '-q', '-u', 'origin', 'develop')
    await flowStart(r, { type: 'release', name: '0.3.0', base: 'develop', checkout: true, publish: 'origin' }, noProgress)
    commitFile(clone, 'notes.txt', 'notes\n', 'Release notes')
    git(clone, 'push', '-q')
    // Il "server" unisce la PR in main e qualcuno aggiunge un commit dopo
    const server = cloneOf(bare)
    git(server, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #7', 'origin/release/0.3.0')
    const prMerge = git(server, 'rev-parse', 'HEAD').trim()
    commitFile(server, 'later.txt', 'later\n', 'Later work')
    git(server, 'push', '-q', 'origin', 'main')
    expect((await finishInfo(r, 'release/0.3.0')).targets[0]).toMatchObject({ branch: 'main', merged: false, upstream: 'origin/main' })
    await flowFinish(r, { branch: 'release/0.3.0', ...finish, update: true, tagMessage: 'Release 0.3.0' }, noProgress)
    expect(git(clone, 'rev-parse', 'v0.3.0^{commit}').trim()).toBe(prMerge)
    expect(git(clone, 'log', '-1', '--format=%s', 'main').trim()).toBe('Later work')
    expect(git(clone, 'merge-base', '--is-ancestor', 'release/0.3.0@{u}', 'develop').trim()).toBe('')
  })

  it('destinazione separata dal suo upstream: errore chiaro', async () => {
    const { bare, clone } = makeRemotePair()
    const r = runnerFor(clone)
    await flowInit(r, init)
    git(clone, 'push', '-q', '-u', 'origin', 'develop')
    await flowStart(r, { type: 'feature', name: 'b', base: 'develop', checkout: true, publish: null }, noProgress)
    commitFile(clone, 'b.txt', 'b\n', 'B')
    const other = cloneOf(bare)
    git(other, 'switch', '-q', 'develop')
    commitFile(other, 'o.txt', 'o\n', 'Other')
    git(other, 'push', '-q')
    git(clone, 'switch', '-q', 'develop')
    commitFile(clone, 'l.txt', 'l\n', 'Local')
    await expect(flowFinish(r, { branch: 'feature/b', ...finish, update: true }, noProgress)).rejects.toThrow(/develop and origin\/develop have diverged/)
  })
})
```

In `test/unit/validate.test.ts`, nel `describe`:

```ts
  it('comandi di git flow', () => {
    const prefixes = { feature: 'feature/', bugfix: 'bugfix/', release: 'release/', hotfix: 'hotfix/', support: 'support/' }
    expect(repoCommand({ kind: 'flowInit', main: 'main', develop: 'develop', prefixes, versionTag: '' })).toEqual({ kind: 'flowInit', main: 'main', develop: 'develop', prefixes, versionTag: '' })
    for (const bad of [{ ...prefixes, feature: 'a b' }, { ...prefixes, bugfix: 'feature/' }, { ...prefixes, release: 'x'.repeat(51) }]) {
      expect(() => repoCommand({ kind: 'flowInit', main: 'main', develop: 'develop', prefixes: bad, versionTag: 'v' })).toThrow()
    }
    expect(repoCommand({ kind: 'flowStart', type: 'release', name: '0.2.0', base: 'develop', checkout: 1, publish: null })).toEqual({
      kind: 'flowStart',
      type: 'release',
      name: '0.2.0',
      base: 'develop',
      checkout: false,
      publish: null,
    })
    expect(() => repoCommand({ kind: 'flowStart', type: 'epic', name: 'x', base: 'develop', publish: null })).toThrow()
    expect(() => repoCommand({ kind: 'flowStart', type: 'feature', name: '--x', base: 'develop', publish: null })).toThrow()
    expect(repoCommand({ kind: 'flowFinish', branch: 'feature/a', update: true, deleteBranch: true })).toEqual({
      kind: 'flowFinish',
      branch: 'feature/a',
      update: true,
      tagMessage: '',
      deleteBranch: true,
      deleteRemote: false,
      push: false,
    })
  })
```

Run: `npx vitest run test/integration/flow.test.ts test/unit/validate.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `flow.notInitialized` | Git flow is not initialized in this repository | Git flow non è inizializzato in questo repository |
| `flow.notFinishable` | {branch} is not a git flow branch that can be finished | {branch} non è un branch di git flow da finire |
| `flow.noMain` | The branch {branch} does not exist | Il branch {branch} non esiste |
| `flow.diverged` | {branch} and {upstream} have diverged: pull or push first | {branch} e {upstream} si sono separati: prima fai pull o push |
| `validation.flowPrefix` | Invalid prefix: {value} | Prefisso non valido: {value} |
| `validation.flowPrefixes` | The branch prefixes must be different from each other | I prefissi dei branch devono essere diversi fra loro |

- [ ] **Step 3: Tipi e validazione**

In `src/shared/types.ts`, dentro `RepoCommand` (prima di `| { kind: 'rebaseInteractive'; … }`), le tre varianti di **Interfaces**.

In `src/main/validate.ts` (con gli import di `FLOW_TYPES` da `../shared/flow` e di `FlowType` dai tipi):

```ts
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
```

e nello `switch` di `repoCommand`, prima di `case 'rebaseInteractive':`:

```ts
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
```

- [ ] **Step 4: `src/main/git/flow.ts`**

```ts
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
  const [own, remotes] = await Promise.all([upstreamOf(r, branch), remotesWith(r, branch)])
  return {
    branch,
    type,
    name,
    targets: await Promise.all(
      targets.map(async (target) => {
        const up = await upstreamOf(r, target)
        return { branch: target, merged: await isAncestor(r, branch, target), upstream: up?.ref ?? null, remote: up?.remote ?? null }
      }),
    ),
    tag: tag ? { name: tag, exists: await exists(r, `refs/tags/${tag}`) } : null,
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
  for (const x of targets) {
    if (await isAncestor(r, o.branch, x.branch)) continue
    await r.run(['switch', x.branch], write)
    // Con un conflitto ci si ferma qui: il merge resta in corso
    await r.run(['merge', '--no-ff', '--no-edit', o.branch], write)
  }
  const first = targets[0]?.branch ?? ''
  if (info.tag && !(await exists(r, `refs/tags/${info.tag.name}`))) {
    await r.run(['tag', '-a', info.tag.name, '-m', o.tagMessage.trim() || info.tag.name, await mergePoint(r, o.branch, first)], write)
  }
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
  await r.run(['branch', '-d', o.branch], write)
  if (o.deleteRemote && info.remote) await r.run(['push', '--progress', info.remote, '--delete', o.branch], { ...write, onProgress })
  // exit 5: la chiave non c'era
  await r.run(['config', '--unset', `gitflow.branch.${o.branch}.base`], { ...write, okCodes: [0, 5] })
}
```


In `src/main/git/branches.ts`:
- importa `flowFinish`, `flowInit`, `flowStart` da `./flow`;
- in `runCommand`, prima di `case 'rebaseInteractive':`:

```ts
    case 'flowInit':
      return flowInit(r, c)
    case 'flowStart':
      return flowStart(r, c, onProgress)
    case 'flowFinish':
      return flowFinish(r, c, onProgress)
```

Run: `npx vitest run test/integration/flow.test.ts test/unit/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: init, start e finish di git flow con comandi git (chiavi di git-flow-avh)"
```

---

### Task 3: Canali e store

**Files:**
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts`, `src/renderer/stores/repo.ts`, `src/renderer/stores/pull-requests.ts`, `src/renderer/components/CreatePullRequestDialog.vue`

**Interfaces:**
- Produces:
  - `Api.flowConfig(root): Promise<Result<FlowConfig | null>>`, `Api.flowFinishInfo(root, branch): Promise<Result<FlowFinishInfo>>`;
  - nello store del repo: `flow: FlowConfig | null` (letto a ogni refresh), `flowDialog: FlowDialog | null`, `openFlow(dialog)` e il tipo esportato `FlowDialog = { kind: 'init'; then?: FlowDialog } | { kind: 'start'; type: FlowType } | { kind: 'finish'; branch: string }`;
  - `prs.creating: { branch: string; base?: string; title?: string } | null`.

- [ ] **Step 1: Canali**

In `src/shared/ipc.ts`: `flowConfig: 'flow:config'`, `flowFinishInfo: 'flow:finish-info'` in `Channels`, e nell'`Api`:

```ts
  /** Configurazione di git flow del repo; null se non è inizializzato. */
  flowConfig(root: string): Promise<Result<FlowConfig | null>>
  /** Destinazioni, tag e remote del Finish di un branch, per il riepilogo del dialog. */
  flowFinishInfo(root: string, branch: string): Promise<Result<FlowFinishInfo>>
```

In `src/preload/index.ts`:

```ts
  flowConfig: (root) => ipcRenderer.invoke(Channels.flowConfig, root),
  flowFinishInfo: (root, branch) => ipcRenderer.invoke(Channels.flowFinishInfo, root, branch),
```

In `src/main/ipc-handlers.ts` (import di `finishInfo` e `readFlowConfig` da `./git/flow`):

```ts
  ipcMain.handle(Channels.flowConfig, (_e, root: unknown) => withSession(root, (s) => readFlowConfig(s.runner)))
  ipcMain.handle(Channels.flowFinishInfo, (_e, root: unknown, branch: unknown) => withSession(root, (s) => finishInfo(s.runner, refName(branch))))
```

- [ ] **Step 2: Store del repo**

In `src/renderer/stores/repo.ts`:

```ts
/** Dialog di git flow aperto; init può avere un dialog da aprire dopo (prima azione su un repo non inizializzato). */
export type FlowDialog = { kind: 'init'; then?: FlowDialog } | { kind: 'start'; type: FlowType } | { kind: 'finish'; branch: string }
```

e nello store, vicino a `rebasePlan`:

```ts
    /** Configurazione di git flow; null se il repo non è inizializzato. */
    const flow = shallowRef<FlowConfig | null>(null)
    const flowDialog = shallowRef<FlowDialog | null>(null)

    async function loadFlow() {
      const r = await window.api.flowConfig(root)
      if (r.ok) flow.value = r.value
    }

    /** Apre un dialog di git flow; su un repo non inizializzato prima quello di init. */
    function openFlow(dialog: FlowDialog) {
      flowDialog.value = flow.value || dialog.kind === 'init' ? dialog : { kind: 'init', then: dialog }
    }
```

`loadFlow()` entra nel `Promise.all` di `refresh`; `flow`, `flowDialog`, `openFlow` nel `return`.

- [ ] **Step 3: Destinazione e titolo proposti per una nuova pull request**

In `src/renderer/stores/pull-requests.ts`: `const creating = shallowRef<{ branch: string; base?: string; title?: string } | null>(null)`.

In `CreatePullRequestDialog.vue`:
- `const base = ref(prs.creating?.base ?? '')`, `const title = ref(prs.creating?.title ?? '')`, `const edited = ref(!!prs.creating?.title)`;
- all'apertura il branch principale del server si carica solo se non c'è una destinazione proposta:

```ts
onMounted(() => {
  dialog.value?.showModal()
  if (base.value) void propose()
  else void loadBase()
})
```

Run: `npm run lint && npm run typecheck && npm test && npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: tutto verde.

- [ ] **Step 3b: Commit**

```bash
git add src
git commit -m "feat: configurazione e riepilogo del finish di git flow nel renderer; nuova PR con destinazione e titolo proposti"
```

---

### Task 4: Dialog e azioni

**Files:**
- Create: `src/renderer/components/FlowInitDialog.vue`, `FlowStartDialog.vue`, `FlowFinishDialog.vue`, `src/renderer/actions/flow.ts`, `test/e2e/flow.spec.ts`
- Modify: `src/renderer/components/RepoView.vue`, `src/renderer/actions/branches.ts`, `src/renderer/App.vue`, `src/shared/i18n/en.ts`, `it.ts`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `flowMenu(repo)` (menu del pulsante), `registerFlowActions()`;
  - `data-testid`:
    - `flow-button`;
    - init: `flow-init-dialog`, `flow-main`, `flow-develop`, `flow-prefix-<tipo>`, `flow-version-tag`, `flow-init-save`;
    - start: `flow-start-dialog`, `flow-name`, `flow-base`, `flow-checkout`, `flow-publish`, `flow-start`;
    - finish: `flow-finish-dialog`, `flow-way-local`, `flow-way-pr`, `flow-update`, `flow-tag-message`, `flow-delete`, `flow-delete-remote`, `flow-push`, `flow-steps`, `flow-finish`.

- [ ] **Step 1: E2E**

Crea `test/e2e/flow.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Api } from '../../src/shared/ipc'
import { git } from '../helpers/repo'
import { demoPulls, demoRepo, fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'
import { chooseNextMenuItem } from './menu'

type Win = { api: Api }

test('git flow: initialize, start di una feature, finish locale dal menu del branch', async () => {
  const repo = demoRepo('git.example.com', (n) => `refs/pull/${n}/head`)
  const { app, page } = await launch([repo.clone], tempUserData())
  await expect(page.getByTestId('commit-row').first()).toBeVisible()

  await chooseNextMenuItem(app, 'Initialize Git Flow…')
  await page.getByTestId('flow-button').click()
  await expect(page.getByTestId('flow-main')).toHaveValue('main')
  await expect(page.getByTestId('flow-develop')).toHaveValue('develop')
  await page.getByTestId('flow-init-save').click()
  await expect.poll(() => git(repo.clone, 'config', 'gitflow.branch.develop').trim()).toBe('develop')

  await chooseNextMenuItem(app, 'Start Feature…')
  await page.getByTestId('flow-button').click()
  await page.getByTestId('flow-name').fill('search')
  await page.getByTestId('flow-start').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('feature/search')

  writeFileSync(join(repo.clone, 'search.txt'), 'search\n')
  git(repo.clone, 'add', '.')
  git(repo.clone, 'commit', '-q', '-m', 'Add search')
  await page.getByTestId('repo-refresh').click()

  await chooseNextMenuItem(app, 'Finish Feature search…')
  await page.getByTestId('branch-item').filter({ hasText: /^search$/ }).click({ button: 'right' })
  await expect(page.getByTestId('flow-steps')).toContainText('Merge feature/search into develop')
  await page.getByTestId('flow-finish').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('develop')
  expect(git(repo.clone, 'log', '-1', '--format=%s', 'develop').trim()).toBe("Merge branch 'feature/search' into develop")
  expect(git(repo.clone, 'branch', '--list', 'feature/search').trim()).toBe('')
  await app.close()
})

test('git flow: finish via pull request apre la nuova PR verso develop', async () => {
  const repo = demoRepo('git.example.com', (n) => `refs/pull/${n}/head`)
  const server = await fakeHosting(demoPulls(repo))
  const { app, page } = await launch([repo.clone], tempUserData(), { MERLINO_E2E_API: server.url })
  await page.evaluate(() => (globalThis as unknown as Win).api.addAccount('github', 'git.example.com', 'good-token'))
  git(repo.clone, 'config', 'gitflow.branch.master', 'main')
  git(repo.clone, 'config', 'gitflow.branch.develop', 'develop')
  git(repo.clone, 'branch', 'develop', 'main')
  git(repo.clone, 'switch', '-q', '-c', 'feature/export')
  writeFileSync(join(repo.clone, 'export.txt'), 'export\n')
  git(repo.clone, 'add', '.')
  git(repo.clone, 'commit', '-q', '-m', 'Add export')
  await expect(page.getByTestId('commit-row').first()).toBeVisible()
  await page.getByTestId('repo-refresh').click()

  await chooseNextMenuItem(app, 'Finish Feature export…')
  await page.getByTestId('flow-button').click()
  await page.getByTestId('flow-way-pr').check()
  await page.getByTestId('flow-finish').click()
  await expect(page.getByTestId('create-base')).toHaveValue('develop')
  await expect(page.getByTestId('create-head')).toHaveValue('feature/export')
  await app.close()
  await server.close()
})
```

Il pulsante ↻ della barra riceve `data-testid="repo-refresh"`.

Run: `npx electron-vite build && npx playwright test test/e2e/flow.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `flow.button` | Git Flow | Git Flow |
| `flow.initialize` | Initialize Git Flow… | Inizializza Git Flow… |
| `flow.settings` | Git Flow Settings… | Impostazioni di Git Flow… |
| `flow.start.feature` | Start Feature… | Nuova feature… |
| `flow.start.bugfix` | Start Bugfix… | Nuovo bugfix… |
| `flow.start.release` | Start Release… | Nuova release… |
| `flow.start.hotfix` | Start Hotfix… | Nuovo hotfix… |
| `flow.start.support` | Start Support… | Nuovo support… |
| `flow.finish.feature` | Finish Feature {name}… | Finisci la feature {name}… |
| `flow.finish.bugfix` | Finish Bugfix {name}… | Finisci il bugfix {name}… |
| `flow.finish.release` | Finish Release {name}… | Finisci la release {name}… |
| `flow.finish.hotfix` | Finish Hotfix {name}… | Finisci l'hotfix {name}… |
| `action.flow.init` | Git Flow: Initialize… | Git Flow: inizializza… |
| `action.flow.start.feature` | Git Flow: Start Feature… | Git Flow: nuova feature… |
| `action.flow.start.bugfix` | Git Flow: Start Bugfix… | Git Flow: nuovo bugfix… |
| `action.flow.start.release` | Git Flow: Start Release… | Git Flow: nuova release… |
| `action.flow.start.hotfix` | Git Flow: Start Hotfix… | Git Flow: nuovo hotfix… |
| `action.flow.start.support` | Git Flow: Start Support… | Git Flow: nuovo support… |
| `action.flow.finish` | Git Flow: Finish Current Branch… | Git Flow: finisci il branch corrente… |
| `flow.initTitle` | Git Flow | Git Flow |
| `flow.mainBranch` | Production branch | Branch di produzione |
| `flow.developBranch` | Development branch | Branch di sviluppo |
| `flow.developMissing` | It does not exist yet: Merlino creates it from {main}. | Non esiste ancora: Merlino lo crea da {main}. |
| `flow.prefixes` | Branch prefixes | Prefissi dei branch |
| `flow.versionTag` | Version tag prefix | Prefisso dei tag di versione |
| `flow.type.feature` | Feature | Feature |
| `flow.type.bugfix` | Bugfix | Bugfix |
| `flow.type.release` | Release | Release |
| `flow.type.hotfix` | Hotfix | Hotfix |
| `flow.type.support` | Support | Support |
| `flow.save` | Save | Salva |
| `flow.startTitle.feature` | Start a feature | Nuova feature |
| `flow.startTitle.bugfix` | Start a bugfix | Nuovo bugfix |
| `flow.startTitle.release` | Start a release | Nuova release |
| `flow.startTitle.hotfix` | Start a hotfix | Nuovo hotfix |
| `flow.startTitle.support` | Start a support branch | Nuovo branch support |
| `flow.name` | Name | Nome |
| `flow.version` | Version | Versione |
| `flow.base` | Start from | Parte da |
| `flow.publish` | Publish to {remote} | Pubblica su {remote} |
| `flow.willCreate` | Creates {branch} from {base}. | Crea {branch} da {base}. |
| `flow.start` | Start | Inizia |
| `flow.finishTitle.feature` | Finish feature {name} | Finisci la feature {name} |
| `flow.finishTitle.bugfix` | Finish bugfix {name} | Finisci il bugfix {name} |
| `flow.finishTitle.release` | Finish release {name} | Finisci la release {name} |
| `flow.finishTitle.hotfix` | Finish hotfix {name} | Finisci l'hotfix {name} |
| `flow.wayLocal` | Merge locally | Merge in locale |
| `flow.wayPr` | Open a pull request | Apri una pull request |
| `flow.update` | Update {branches} from {remote} first | Prima aggiorna {branches} da {remote} |
| `flow.tagMessage` | Tag message | Messaggio del tag |
| `flow.deleteBranch` | Delete the branch | Cancella il branch |
| `flow.deleteRemote` | also on {remote} | anche su {remote} |
| `flow.push` | Push {branches} to {remote} | Push di {branches} su {remote} |
| `flow.pushTag` | Push {branches} and the tag to {remote} | Push di {branches} e del tag su {remote} |
| `flow.step.update` | Update {branch} from {upstream} | Aggiorna {branch} da {upstream} |
| `flow.step.merge` | Merge {branch} into {into} | Merge di {branch} in {into} |
| `flow.step.tag` | Tag {tag} | Tag {tag} |
| `flow.step.delete` | Delete {branch} | Cancella {branch} |
| `flow.step.push` | Push to {remote} | Push su {remote} |
| `flow.prHint` | After the pull request is merged, Finish again: Merlino tags {tag}, merges into {develop} and cleans up. | Dopo il merge della pull request, rifai Finish: Merlino mette il tag {tag}, fa il merge in {develop} e fa pulizia. |
| `flow.finish` | Finish | Finisci |
| `flow.continue` | Continue | Continua |

- [ ] **Step 3: `actions/flow.ts`**

```ts
import { FLOW_TYPES, flowName, flowTypeOf } from '../../shared/flow'
import type { MessageKey } from '../../shared/i18n'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { popup } from './branches'
import { registry } from './builtin'

type Repo = ReturnType<typeof useRepoStore>

/** Il branch corrente, se è di git flow e si può finire. */
export function finishableBranch(repo: Repo): string | null {
  const branch = repo.info?.branch
  const type = branch && repo.flow ? flowTypeOf(branch, repo.flow) : null
  return branch && type && type !== 'support' ? branch : null
}

/** Voce "Finish <Tipo> <nome>…" per un branch di git flow, o null. */
export function finishEntry(repo: Repo, branch: string) {
  const type = repo.flow ? flowTypeOf(branch, repo.flow) : null
  if (!repo.flow || !type || type === 'support') return null
  return { label: t(`flow.finish.${type}` as MessageKey, { name: flowName(branch, repo.flow) }), run: () => repo.openFlow({ kind: 'finish', branch }) }
}

/** Menu del pulsante Git Flow della barra. */
export function flowMenu(repo: Repo) {
  if (!repo.flow) return popup([{ label: t('flow.initialize'), run: () => repo.openFlow({ kind: 'init' }) }])
  const current = finishableBranch(repo)
  const finish = current ? finishEntry(repo, current) : null
  return popup([
    ...FLOW_TYPES.map((type) => ({ label: t(`flow.start.${type}`), run: () => repo.openFlow({ kind: 'start', type }) })),
    ...(finish ? [null, finish] : []),
    null,
    { label: t('flow.settings'), run: () => repo.openFlow({ kind: 'init' }) },
  ])
}

export function registerFlowActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const idle = () => repo()?.busy === null
  registry.register(
    { id: 'flow.init', get title() { return t('action.flow.init') }, when: idle, run: () => repo()?.openFlow({ kind: 'init' }) },
    ...FLOW_TYPES.map((type) => ({
      id: `flow.start.${type}`,
      get title() { return t(`action.flow.start.${type}`) },
      when: idle,
      run: () => repo()?.openFlow({ kind: 'start', type }),
    })),
    {
      id: 'flow.finish',
      get title() { return t('action.flow.finish') },
      when: () => idle() && !!repo() && !!finishableBranch(repo()!),
      run: () => {
        const r = repo()
        const branch = r && finishableBranch(r)
        if (r && branch) r.openFlow({ kind: 'finish', branch })
      },
    },
  )
}
```

`App.vue` chiama `registerFlowActions()` dopo `registerPullRequestActions()`.

In `src/renderer/actions/branches.ts`, in `branchMenu`, l'ultima voce del Finish (senza importare `actions/flow.ts`, che importa questo file):

```ts
  const type = repo.flow ? flowTypeOf(b.name, repo.flow) : null
  const finish =
    repo.flow && type && type !== 'support'
      ? [null, { label: t(`flow.finish.${type}`, { name: flowName(b.name, repo.flow) }), run: () => repo.openFlow({ kind: 'finish', branch: b.name }) }]
      : []
```

e `...finish` in fondo alla lista del `popup`. Import di `flowName`, `flowTypeOf` da `../../shared/flow`.

- [ ] **Step 4: `FlowInitDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DEFAULT_FLOW_PREFIXES, FLOW_TYPES } from '../../shared/flow'
import { t } from '../i18n'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const branches = computed(() => repo.refs?.branches.map((b) => b.name) ?? [])
const current = repo.flow
const guessMain = () => ['main', 'master'].find((n) => branches.value.includes(n)) ?? repo.info?.branch ?? 'main'
const form = reactive({
  main: current?.main ?? guessMain(),
  develop: current?.develop ?? 'develop',
  prefixes: { ...(current?.prefixes ?? DEFAULT_FLOW_PREFIXES) },
  versionTag: current?.versionTag ?? 'v',
})
const developMissing = computed(() => !branches.value.includes(form.develop.trim()))
onMounted(() => dialog.value?.showModal())

function close() {
  repo.flowDialog = null
}

async function save() {
  const then = repo.flowDialog?.kind === 'init' ? repo.flowDialog.then : undefined
  close()
  const ok = await repo.git({ kind: 'flowInit', main: form.main.trim(), develop: form.develop.trim(), prefixes: { ...form.prefixes }, versionTag: form.versionTag.trim() })
  if (ok && then) repo.openFlow(then)
}
</script>

<template>
  <dialog ref="dialog" data-testid="flow-init-dialog" @cancel.prevent="close">
    <form @submit.prevent="save">
      <h2>{{ t('flow.initTitle') }}</h2>
      <label class="field">
        <span>{{ t('flow.mainBranch') }}</span>
        <input v-model="form.main" list="flow-branches" data-testid="flow-main" />
      </label>
      <label class="field">
        <span>{{ t('flow.developBranch') }}</span>
        <input v-model="form.develop" list="flow-branches" data-testid="flow-develop" />
      </label>
      <p v-if="developMissing" class="hint">{{ t('flow.developMissing', { main: form.main }) }}</p>
      <datalist id="flow-branches"><option v-for="b in branches" :key="b" :value="b" /></datalist>
      <h3>{{ t('flow.prefixes') }}</h3>
      <div class="prefixes">
        <label v-for="type in FLOW_TYPES" :key="type" class="field">
          <span>{{ t(`flow.type.${type}`) }}</span>
          <input v-model="form.prefixes[type]" :data-testid="`flow-prefix-${type}`" />
        </label>
        <label class="field">
          <span>{{ t('flow.versionTag') }}</span>
          <input v-model="form.versionTag" data-testid="flow-version-tag" />
        </label>
      </div>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="flow-init-save" :disabled="!form.main.trim() || !form.develop.trim()">{{ t('flow.save') }}</button>
      </footer>
    </form>
  </dialog>
</template>
```

Stile: `dialog` largo 480 px; `.prefixes` in griglia a tre colonne; `h3` piccolo come i sottotitoli delle Impostazioni; `.hint` come negli altri dialog.

- [ ] **Step 5: `FlowStartDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { latestVersionTag, nextVersion } from '../../shared/flow'
import type { FlowType } from '../../shared/types'
import { t } from '../i18n'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const type: FlowType = repo.flowDialog?.kind === 'start' ? repo.flowDialog.type : 'feature'
const config = repo.flow
const tags = repo.refs?.tags.map((x) => x.name) ?? []
const versioned = type === 'release' || type === 'hotfix' || type === 'support'
const name = ref(config && versioned ? nextVersion(tags, config.versionTag, type) : '')
const local = repo.refs?.branches.map((b) => b.name) ?? []
/** Basi proposte: per i support qualunque tag o commit (testo libero con i tag come suggerimento). */
const bases = computed(() => {
  if (!config) return []
  if (type === 'release') return [config.develop]
  if (type === 'hotfix') return [config.main, ...local.filter((b) => b.startsWith(config.prefixes.support))]
  if (type === 'support') return tags
  return [config.develop, ...local.filter((b) => b !== config.develop)]
})
const base = ref(!config ? '' : type === 'hotfix' ? config.main : type === 'support' ? (latestVersionTag(tags, config.versionTag) ?? config.main) : config.develop)
const checkout = ref(true)
const remotes = repo.refs?.remotes.map((r) => r.name) ?? []
const remote = remotes.includes('origin') ? 'origin' : (remotes[0] ?? null)
const publish = ref(false)
const branch = computed(() => `${config?.prefixes[type] ?? ''}${name.value.trim()}`)
onMounted(() => dialog.value?.showModal())

function close() {
  repo.flowDialog = null
}

async function start() {
  if (!name.value.trim() || !base.value.trim()) return
  close()
  await repo.git({ kind: 'flowStart', type, name: name.value.trim(), base: base.value.trim(), checkout: checkout.value, publish: publish.value ? remote : null })
}
</script>

<template>
  <dialog ref="dialog" data-testid="flow-start-dialog" @cancel.prevent="close">
    <form @submit.prevent="start">
      <h2>{{ t(`flow.startTitle.${type}`) }}</h2>
      <label class="field">
        <span>{{ versioned ? t('flow.version') : t('flow.name') }}</span>
        <input v-model="name" data-testid="flow-name" />
      </label>
      <label class="field">
        <span>{{ t('flow.base') }}</span>
        <input v-if="type === 'support'" v-model="base" list="flow-bases" data-testid="flow-base" />
        <select v-else v-model="base" data-testid="flow-base">
          <option v-for="b in bases" :key="b" :value="b">{{ b }}</option>
        </select>
        <datalist id="flow-bases"><option v-for="b in bases" :key="b" :value="b" /></datalist>
      </label>
      <p v-if="name.trim()" class="hint">{{ t('flow.willCreate', { branch, base }) }}</p>
      <label class="check"><input v-model="checkout" type="checkbox" data-testid="flow-checkout" /> {{ t('branch.checkoutNew') }}</label>
      <label v-if="remote" class="check"><input v-model="publish" type="checkbox" data-testid="flow-publish" /> {{ t('flow.publish', { remote }) }}</label>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="flow-start" :disabled="!name.trim() || !base.trim() || !!repo.busy">{{ t('flow.start') }}</button>
      </footer>
    </form>
  </dialog>
</template>
```

- [ ] **Step 6: `FlowFinishDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { FlowFinishInfo } from '../../shared/types'
import { t } from '../i18n'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const prs = usePullRequestStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const branch = repo.flowDialog?.kind === 'finish' ? repo.flowDialog.branch : ''
const info = shallowRef<FlowFinishInfo | null>(null)
const failed = ref<string | null>(null)
/** Preferenze del dialog, per repository (una comodità locale). */
const key = (name: string) => `merlino.flow:${props.root}:${name}`
const canPr = computed(() => prs.withAccount.length > 0)
const way = ref<'local' | 'pr'>(localStorage.getItem(key('way')) === 'pr' ? 'pr' : 'local')
const update = ref(true)
const tagMessage = ref('')
const deleteBranch = ref(true)
const deleteRemote = ref(true)
const push = ref(localStorage.getItem(key('push')) === '1')

const tracked = computed(() => info.value?.targets.filter((x) => x.upstream) ?? [])
const remote = computed(() => tracked.value[0]?.remote ?? null)
const names = (list: { branch: string }[]) => list.map((x) => x.branch).join(', ')
const kind = computed(() => (info.value?.type === 'release' ? 'Release' : 'Hotfix'))
/** I passi che farà il merge locale, con le opzioni scelte. */
const steps = computed(() => {
  const i = info.value
  if (!i) return []
  const lines: string[] = []
  if (update.value) for (const x of tracked.value) lines.push(t('flow.step.update', { branch: x.branch, upstream: x.upstream ?? '' }))
  for (const x of i.targets) if (!x.merged) lines.push(t('flow.step.merge', { branch: i.branch, into: x.branch }))
  if (i.tag && !i.tag.exists) lines.push(t('flow.step.tag', { tag: i.tag.name }))
  if (push.value && remote.value) lines.push(t('flow.step.push', { remote: remote.value }))
  if (deleteBranch.value) lines.push(t('flow.step.delete', { branch: i.branch }))
  return lines
})

onMounted(async () => {
  dialog.value?.showModal()
  const r = await window.api.flowFinishInfo(props.root, branch)
  if (!r.ok) {
    failed.value = r.error.message
    return
  }
  info.value = r.value
  tagMessage.value = `${r.value.type === 'release' ? 'Release' : 'Hotfix'} ${r.value.name}`
  if (!canPr.value) way.value = 'local'
})

function close() {
  repo.flowDialog = null
}

async function finish() {
  const i = info.value
  if (!i) return
  localStorage.setItem(key('way'), way.value)
  close()
  if (way.value === 'pr') {
    const first = i.targets[0]?.branch ?? ''
    prs.creating = { branch: i.branch, base: first, ...(i.tag ? { title: `${kind.value} ${i.name}` } : {}) }
    return
  }
  localStorage.setItem(key('push'), push.value ? '1' : '0')
  await repo.git({
    kind: 'flowFinish',
    branch: i.branch,
    update: update.value && tracked.value.length > 0,
    tagMessage: tagMessage.value,
    deleteBranch: deleteBranch.value,
    deleteRemote: deleteRemote.value && !!i.remote,
    push: push.value && !!remote.value,
  })
}
</script>

<template>
  <dialog ref="dialog" data-testid="flow-finish-dialog" @cancel.prevent="close">
    <form @submit.prevent="finish">
      <h2>{{ info ? t(`flow.finishTitle.${info.type}`, { name: info.name }) : branch }}</h2>
      <p v-if="failed" class="error">{{ failed }}</p>
      <template v-if="info">
        <div v-if="canPr" class="ways">
          <label class="check"><input v-model="way" type="radio" value="local" data-testid="flow-way-local" /> {{ t('flow.wayLocal') }}</label>
          <label class="check"><input v-model="way" type="radio" value="pr" data-testid="flow-way-pr" /> {{ t('flow.wayPr') }}</label>
        </div>
        <template v-if="way === 'local'">
          <label v-if="tracked.length && remote" class="check">
            <input v-model="update" type="checkbox" data-testid="flow-update" /> {{ t('flow.update', { branches: names(tracked), remote }) }}
          </label>
          <label v-if="info.tag && !info.tag.exists" class="field">
            <span>{{ t('flow.tagMessage') }} ({{ info.tag.name }})</span>
            <input v-model="tagMessage" data-testid="flow-tag-message" />
          </label>
          <div class="check">
            <label class="check"><input v-model="deleteBranch" type="checkbox" data-testid="flow-delete" /> {{ t('flow.deleteBranch') }}</label>
            <label v-if="deleteBranch && info.remote" class="check"><input v-model="deleteRemote" type="checkbox" data-testid="flow-delete-remote" /> {{ t('flow.deleteRemote', { remote: info.remote }) }}</label>
          </div>
          <label v-if="remote" class="check">
            <input v-model="push" type="checkbox" data-testid="flow-push" />
            {{ info.tag ? t('flow.pushTag', { branches: names(tracked), remote }) : t('flow.push', { branches: names(tracked), remote }) }}
          </label>
          <ol class="steps" data-testid="flow-steps">
            <li v-for="s in steps" :key="s">{{ s }}</li>
          </ol>
        </template>
        <p v-else-if="info.tag" class="hint">{{ t('flow.prHint', { tag: info.tag.name, develop: info.targets[1]?.branch ?? '' }) }}</p>
      </template>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="flow-finish" :disabled="!info || !!repo.busy">{{ way === 'pr' ? t('flow.continue') : t('flow.finish') }}</button>
      </footer>
    </form>
  </dialog>
</template>
```

Stile: `dialog` largo 520 px; `.ways` in riga; `.steps` piccolo e grigio, con i numeri.

- [ ] **Step 7: Barra e `RepoView`**

In `RepoView.vue`:
- import di `flowMenu` (`../actions/flow`) e dei tre dialog;
- prima di Fetch: `<button data-testid="flow-button" :disabled="!!repo.busy" @click="flowMenu(repo)">{{ t('flow.button') }}</button>`;
- al pulsante ↻: `data-testid="repo-refresh"`;
- dopo `CreatePullRequestDialog`:

```vue
    <FlowInitDialog v-if="repo.flowDialog?.kind === 'init'" :root="root" />
    <FlowStartDialog v-else-if="repo.flowDialog?.kind === 'start'" :root="root" />
    <FlowFinishDialog v-else-if="repo.flowDialog?.kind === 'finish'" :root="root" />
```

Run: `npx electron-vite build && npx playwright test test/e2e/flow.spec.ts`
Expected: PASS.

- [ ] **Step 8: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: git flow nell'interfaccia (pulsante Git Flow, palette, menu dei branch, dialog di init, start e finish)"
```

---

### Task 5: README, verifica e note

- [ ] **Step 1: README**
  - "What you get", riga "Branches and remotes": "Git flow: initialize, start and finish features, bugfixes, releases and hotfixes (locally or through a pull request), and support branches; compatible with the `git flow` command line."
  - Roadmap: `- [x] Git flow` e la riga dei sottomoduli diventa "Submodules, worktrees and custom commands".

- [ ] **Step 2: Verifica completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde, con la finestra nascosta.

Screenshot nascosti dei tre dialog in inglese e in italiano (spec temporanea, non committata).

- [ ] **Step 3: Note di esecuzione e commit**

```bash
git add README.md docs
git commit -m "docs: git flow nel README e note di esecuzione"
```
