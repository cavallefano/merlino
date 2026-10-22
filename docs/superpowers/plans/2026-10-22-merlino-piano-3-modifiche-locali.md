# Merlino — Piano 3: Modifiche locali — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- In cima alla storia compare "Modifiche locali (N)". Selezionandola, a destra si vedono il messaggio di commit e le sezioni In stage, Modificati, Non tracciati e In conflitto.
- Si fanno stage, unstage e scarto per file, per blocco o per singole righe, si aggiunge un file al `.gitignore`, si fa commit con ⌘↩ (anche amend).
- Gli stash si creano, applicano, applicano ed eliminano (pop) ed eliminano, da una sidebar a sinistra.

**Architecture:**
- **Main**: lo stato arriva da `git status --porcelain=v2 -z`. Le operazioni sono comandi git in coda di scrittura.
- **Righe e blocchi**: il renderer costruisce una patch dalle righe scelte nel diff che l'utente vede (`src/shared/patch.ts`, funzione pura) e il main la applica con `git apply --cached/--reverse --recount`. Se nel frattempo il file è cambiato, git rifiuta la patch, quindi non si applica mai a righe diverse da quelle viste.

**Tech Stack:** quello dei piani 1–2.

Spec: `docs/superpowers/specs/2026-10-22-merlino-v1-design.md`, parte 3. Parte dal branch `feature/piano-2-storia`.

## Global Constraints

Valgono quelle dei piani 1–2, più:
- **Operazioni distruttive** (scarto di file, blocchi o righe; eliminazione di un file non tracciato; drop di uno stash): chiedono conferma con `window.confirm`.
- **Righe e blocchi** solo per file in stato `M`, e solo con "Ignora spazi" spento. File nuovi, cancellati, rinominati e non tracciati si gestiscono interi.
- **Percorsi dal renderer**: relativi, senza `..`, non assoluti.
- **Ref degli stash**: `/^stash@\{\d+\}$/`.
- **Messaggio del commit**: passato via stdin (`commit -F -`). Hook e firma seguono la config di git.

## Struttura dei file

```
src/shared/types.ts           + WorkingArea, WorkingFile, WorkingStatus, StashEntry, PatchMode; DiffLine.noNewline
src/shared/patch.ts           patch dalle righe scelte (pura, usata dal renderer)
src/shared/ipc.ts             + operazioni sulle modifiche locali e sugli stash
src/shared/shortcuts.ts       + working.commit (⌘↩ / Ctrl+Enter)
src/main/git/diff.ts          parser: segna noNewline
src/main/git/status.ts        parser di status v2
src/main/git/working.ts       diff locali, stage/unstage/scarto, patch, commit, stash, .gitignore
src/main/ipc-handlers.ts      + handler e validazione
src/preload/index.ts          + operazioni
src/renderer/stores/repo.ts   + stato locale, vista, selezione delle righe, commit, stash
src/renderer/actions/working.ts  azioni della palette
src/renderer/components/      RepoSidebar, WorkingView, StageDiff; HistoryView (riga "Modifiche locali"); RepoView (3 colonne)
test/unit/                    status, patch
test/integration/             working, patch-apply
test/e2e/                     working.spec.ts
```

---

### Task 1: Righe senza a capo finale, stato locale e patch

**Files:**
- Modify: `src/shared/types.ts`, `src/main/git/diff.ts`, `test/unit/diff-parse.test.ts`
- Create: `src/main/git/status.ts`, `src/shared/patch.ts`
- Test: `test/unit/status.test.ts`, `test/unit/patch.test.ts`

**Interfaces:**
- Produces:
  - `DiffLine.noNewline?: boolean`;
  - `parseStatus(out: string): WorkingStatus`;
  - `lineKey(hunk, line): string`;
  - `changedKeys(diff, hunk?): Set<string>`;
  - `buildPatch(diff: FileDiff, selected: ReadonlySet<string>, reverse: boolean): string | null`.

- [ ] **Step 1: Aggiungi i tipi**

In `src/shared/types.ts`, dentro `DiffLine`, dopo `newNo`:
```ts
  /** La riga è l'ultima del file e non ha a capo ("\ No newline at end of file"). */
  noNewline?: boolean
```
In fondo al file:
```ts
export type WorkingArea = 'staged' | 'unstaged' | 'untracked' | 'conflicted'

export interface WorkingFile {
  path: string
  /** Solo per le rinomine in stage. */
  oldPath?: string
  /** '?' per i non tracciati. */
  status: FileStatus | '?'
}

export interface WorkingStatus {
  staged: WorkingFile[]
  unstaged: WorkingFile[]
  untracked: WorkingFile[]
  conflicted: WorkingFile[]
  upstream: string | null
  ahead: number
  behind: number
}

export interface StashEntry {
  /** stash@{n} */
  ref: string
  sha: string
  time: number
  message: string
}

/** stage: index ← righe scelte; unstage: index → le toglie; discard: le toglie dalla cartella di lavoro. */
export type PatchMode = 'stage' | 'unstage' | 'discard'
```

- [ ] **Step 2: Scrivi i test che falliscono**

In `test/unit/diff-parse.test.ts`, dentro `describe('parseFileDiff')`:
```ts
  it("segna la riga senza a capo finale", () => {
    const d = parseFileDiff('@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n', 'f')
    expect(d.hunks[0].lines).toEqual([
      { type: 'del', text: 'a', oldNo: 1, newNo: null, noNewline: true },
      { type: 'add', text: 'b', oldNo: null, newNo: 1, noNewline: true },
    ])
  })
```

`test/unit/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseStatus } from '../../src/main/git/status'

const out = [
  '# branch.oid b3956d586c154a64609ac3a3bc327c24cf8df3a8',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 08fe 08fe a.txt',
  '1 MM N... 100644 100644 100644 08fe 08fe con spazio.txt',
  '2 R. N... 100644 100644 100644 587b 587b R100 new name.txt',
  'old.txt',
  'u UU N... 100644 100644 100644 100644 1111 2222 3333 conflitto.txt',
  '? unt racked.txt',
  '',
].join('\0')

describe('parseStatus', () => {
  it('stage, modificati, non tracciati, conflitti, upstream e avanti/indietro', () => {
    expect(parseStatus(out)).toEqual({
      staged: [
        { path: 'con spazio.txt', status: 'M' },
        { path: 'new name.txt', oldPath: 'old.txt', status: 'R' },
      ],
      unstaged: [
        { path: 'a.txt', status: 'M' },
        { path: 'con spazio.txt', status: 'M' },
      ],
      untracked: [{ path: 'unt racked.txt', status: '?' }],
      conflicted: [{ path: 'conflitto.txt', status: 'U' }],
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
    })
  })
})
```

`test/unit/patch.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildPatch, changedKeys, lineKey } from '../../src/shared/patch'
import type { FileDiff } from '../../src/shared/types'

const diff: FileDiff = {
  path: 'a.txt',
  binary: false,
  tooLarge: false,
  hunks: [
    {
      header: '@@ -1,4 +1,4 @@',
      lines: [
        { type: 'context', text: '1', oldNo: 1, newNo: 1 },
        { type: 'del', text: '2', oldNo: 2, newNo: null },
        { type: 'add', text: 'DUE', oldNo: null, newNo: 2 },
        { type: 'add', text: 'extra', oldNo: null, newNo: 3 },
        { type: 'context', text: '3', oldNo: 3, newNo: 4 },
      ],
    },
  ],
}

const header = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n'

describe('buildPatch', () => {
  it('stage di una sola riga aggiunta: la riga tolta non scelta resta come contesto', () => {
    expect(buildPatch(diff, new Set([lineKey(0, 3)]), false)).toBe(header + '@@ -1,3 +1,4 @@\n 1\n 2\n+extra\n 3\n')
  })

  it('al contrario (unstage/scarto): le aggiunte non scelte restano, le tolte non scelte spariscono', () => {
    expect(buildPatch(diff, new Set([lineKey(0, 1)]), true)).toBe(header + '@@ -1,5 +1,4 @@\n 1\n-2\n DUE\n extra\n 3\n')
  })

  it('nessuna riga cambiata scelta: nessuna patch', () => {
    expect(buildPatch(diff, new Set([lineKey(0, 0)]), false)).toBeNull()
  })

  it('changedKeys: le righe cambiate di un blocco', () => {
    expect([...changedKeys(diff, 0)]).toEqual(['0:1', '0:2', '0:3'])
  })

  it('percorsi con caratteri speciali tra virgolette, come fa git', () => {
    const patch = buildPatch({ ...diff, path: 'caffè "x".txt' }, changedKeys(diff), false)
    expect(patch?.split('\n')[0]).toBe('diff --git "a/caff\\303\\250 \\"x\\".txt" "b/caff\\303\\250 \\"x\\".txt"')
  })

  it('riga senza a capo finale', () => {
    const last: FileDiff = {
      path: 'f',
      binary: false,
      tooLarge: false,
      hunks: [{ header: '@@ -1 +1 @@', lines: [
        { type: 'del', text: 'a', oldNo: 1, newNo: null, noNewline: true },
        { type: 'add', text: 'b', oldNo: null, newNo: 1, noNewline: true },
      ] }],
    }
    expect(buildPatch(last, changedKeys(last), false)).toBe(
      'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n',
    )
  })
})
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit/diff-parse.test.ts test/unit/status.test.ts test/unit/patch.test.ts`
Expected: FAIL, perché mancano i moduli `status` e `patch`, e `noNewline` non viene ancora impostato.

- [ ] **Step 4: Implementa**

In `src/main/git/diff.ts`, nel ramo dentro l'hunk, sostituisci il commento `// "\ No newline at end of file": nessuna riga` con:
```ts
      else if (raw[0] === '\\' && hunk.lines.length) hunk.lines[hunk.lines.length - 1].noNewline = true
```
Lo stesso marcatore può arrivare a hunk già chiuso, dopo l'ultima riga. Nel ramo fuori dall'hunk, prima di `const m = HUNK.exec(raw)`:
```ts
    if (raw.startsWith('\\ ') && hunk?.lines.length) {
      hunk.lines[hunk.lines.length - 1].noNewline = true
      continue
    }
```

`src/main/git/status.ts`:
```ts
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
```

`src/shared/patch.ts`:
```ts
import type { DiffLine, FileDiff } from './types'

/** Chiave di una riga di un diff: "blocco:riga". */
export const lineKey = (hunk: number, line: number): string => `${hunk}:${line}`

/** Le righe cambiate (aggiunte e tolte) di un blocco, o di tutto il diff. */
export function changedKeys(diff: FileDiff, hunk?: number): Set<string> {
  const keys = new Set<string>()
  diff.hunks.forEach((h, i) => {
    if (hunk !== undefined && hunk !== i) return
    h.lines.forEach((l, j) => {
      if (l.type !== 'context') keys.add(lineKey(i, j))
    })
  })
  return keys
}

/**
 * Patch con le sole righe scelte, da applicare con git apply --recount.
 * reverse=false (stage, dal diff index→cartella): le righe tolte non scelte restano come contesto,
 * le aggiunte non scelte spariscono. reverse=true (unstage o scarto, applicata con --reverse): l'opposto.
 */
export function buildPatch(diff: FileDiff, selected: ReadonlySet<string>, reverse: boolean): string | null {
  const hunks: string[] = []
  diff.hunks.forEach((hunk, h) => {
    const lines: string[] = []
    let changes = 0
    const push = (sign: string, line: DiffLine) => {
      lines.push(sign + line.text)
      if (line.noNewline) lines.push('\\ No newline at end of file')
    }
    hunk.lines.forEach((line, l) => {
      if (line.type === 'context') push(' ', line)
      else if (selected.has(lineKey(h, l))) {
        push(line.type === 'add' ? '+' : '-', line)
        changes++
      } else if ((line.type === 'del') !== reverse) push(' ', line)
      // altrimenti la riga non esiste sul lato a cui si applica la patch: si omette
    })
    if (!changes) return
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(hunk.header)
    const count = (signs: string) => lines.filter((x) => signs.includes(x[0] ?? '')).length
    hunks.push(`@@ -${m?.[1] ?? 1},${count(' -')} +${m?.[2] ?? 1},${count(' +')} @@`, ...lines)
  })
  if (!hunks.length) return null
  const from = quote(`a/${diff.oldPath ?? diff.path}`)
  const to = quote(`b/${diff.path}`)
  return `diff --git ${from} ${to}\n--- ${from}\n+++ ${to}\n${hunks.join('\n')}\n`
}

/** Virgolette in stile git per i percorsi con caratteri speciali o non ASCII (byte UTF-8 in ottale). */
function quote(path: string): string {
  if (!/[^\x20-\x7e]|["\\]/.test(path)) return path
  let out = '"'
  for (const byte of new TextEncoder().encode(path)) {
    if (byte === 0x22) out += '\\"'
    else if (byte === 0x5c) out += '\\\\'
    else if (byte === 0x0a) out += '\\n'
    else if (byte === 0x09) out += '\\t'
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(byte)
  }
  return `${out}"`
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit/diff-parse.test.ts test/unit/status.test.ts test/unit/patch.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 6: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: stato locale, patch dalle righe scelte e righe senza a capo finale" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Operazioni sulle modifiche locali (main)

**Files:**
- Create: `src/main/git/working.ts`
- Test: `test/integration/working.test.ts`, `test/integration/patch-apply.test.ts`

**Interfaces:**
- Consumes: `readStatus` e `buildPatch` (Task 1), `limitedDiff` e `DiffRequest` (piano 2).
- Produces, tutte con `runner: GitRunner` come primo argomento:
  - `readWorkingDiff(runner, file: DiffRequest, area: WorkingArea, options: DiffOptions): Promise<FileDiff>`;
  - `stageFiles(runner, paths: string[]): Promise<void>` e `unstageFiles(runner, paths: string[]): Promise<void>`;
  - `discardFiles(runner, tracked: string[], untracked: string[]): Promise<void>`;
  - `stageAll(runner)` e `unstageAll(runner)`;
  - `applyPatch(runner, patch: string, mode: PatchMode): Promise<void>`;
  - `commit(runner, message: string, amend: boolean): Promise<void>` e `lastCommitMessage(runner): Promise<string>`;
  - `parseStashList(out): StashEntry[]` e `readStashes(runner)`;
  - `stashPush(runner, message: string, includeUntracked: boolean)` e `stashAction(runner, action: 'apply' | 'pop' | 'drop', ref: string)`;
  - `addToGitignore(root: string, path: string): void`.

- [ ] **Step 1: Isola i test dalla config git dell'utente e scrivi i test che falliscono**

I test fanno commit con il GitRunner, che eredita l'ambiente del processo: senza isolamento userebbero firma GPG, hook e identità dell'utente (o fallirebbero in CI senza identità).

`test/setup-env.ts`:
```ts
import { devNull } from 'node:os'

// Commit dei test indipendenti dalla config dell'utente (firma, hook, identità)
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
})
```
In `vitest.config.ts`, dentro `test`: `setupFiles: ['test/setup-env.ts'],`. In `test/e2e/launch.ts` importa `import './../setup-env'` come primo import: l'app avviata eredita `process.env`.

`test/integration/working.test.ts`:
```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { readStatus } from '../../src/main/git/status'
import {
  addToGitignore,
  commit,
  discardFiles,
  lastCommitMessage,
  parseStashList,
  readStashes,
  readWorkingDiff,
  stageAll,
  stageFiles,
  stashAction,
  stashPush,
  unstageAll,
  unstageFiles,
} from '../../src/main/git/working'
import { git, makeRepo } from '../helpers/repo'

const setup = (commits = 1) => {
  const repo = makeRepo(commits)
  return { repo, runner: new GitRunner(() => 'git', repo, () => {}) }
}
const options = { ignoreWhitespace: false, force: false }

describe('modifiche locali', () => {
  it('stage, unstage e scarto di file tracciati e non tracciati', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
    writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
    await stageFiles(runner, ['file1.txt', 'nuovo.txt'])
    expect((await readStatus(runner)).staged.map((f) => f.path)).toEqual(['file1.txt', 'nuovo.txt'])
    await unstageFiles(runner, ['file1.txt'])
    const s = await readStatus(runner)
    expect(s.staged.map((f) => f.path)).toEqual(['nuovo.txt'])
    expect(s.unstaged.map((f) => f.path)).toEqual(['file1.txt'])

    await unstageAll(runner)
    await discardFiles(runner, ['file1.txt'], ['nuovo.txt'])
    expect(await readStatus(runner)).toMatchObject({ staged: [], unstaged: [], untracked: [] })
    expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('1\n')
  })

  it('unstage e stageAll in un repo senza commit', async () => {
    const { repo, runner } = setup(0)
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    await stageAll(runner)
    expect((await readStatus(runner)).staged).toEqual([{ path: 'a.txt', status: 'A' }])
    await unstageFiles(runner, ['a.txt'])
    expect((await readStatus(runner)).untracked).toEqual([{ path: 'a.txt', status: '?' }])
  })

  it('diff dei file in stage, modificati e non tracciati', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), '1\ndue\n')
    expect((await readWorkingDiff(runner, { path: 'file1.txt' }, 'unstaged', options)).hunks[0].lines[1]).toMatchObject({ type: 'add', text: 'due' })
    await stageFiles(runner, ['file1.txt'])
    expect((await readWorkingDiff(runner, { path: 'file1.txt' }, 'staged', options)).hunks).toHaveLength(1)
    expect((await readWorkingDiff(runner, { path: 'file1.txt' }, 'unstaged', options)).hunks).toEqual([])
    writeFileSync(join(repo, 'nuovo file.txt'), 'x\ny\n')
    const untracked = await readWorkingDiff(runner, { path: 'nuovo file.txt' }, 'untracked', options)
    expect(untracked.hunks[0].lines.map((l) => l.text)).toEqual(['x', 'y'])
  })

  it('commit con messaggio da stdin e amend', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
    await stageFiles(runner, ['file1.txt'])
    await commit(runner, 'oggetto\n\ncorpo', false)
    expect(await lastCommitMessage(runner)).toBe('oggetto\n\ncorpo')
    await commit(runner, 'oggetto corretto', true)
    expect(git(repo, 'log', '--format=%s')).toBe('oggetto corretto\ncommit 1\n')
  })

  it('stash: crea, elenca, applica ed elimina', async () => {
    const { repo, runner } = setup()
    writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
    writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
    await stashPush(runner, 'mio stash', true)
    expect(await readStatus(runner)).toMatchObject({ unstaged: [], untracked: [] })
    const [entry] = await readStashes(runner)
    expect(entry).toMatchObject({ ref: 'stash@{0}', message: 'On main: mio stash' })
    await stashAction(runner, 'pop', entry.ref)
    expect((await readStatus(runner)).untracked).toEqual([{ path: 'nuovo.txt', status: '?' }])
    expect(await readStashes(runner)).toEqual([])
  })

  it('parseStashList', () => {
    // join: in un letterale '\0100' verrebbe letto come escape ottale
    expect(parseStashList(['stash@{0}', 'abc', '100', 'On main: x', ''].join('\0'))).toEqual([{ ref: 'stash@{0}', sha: 'abc', time: 100, message: 'On main: x' }])
  })

  it('aggiunge un percorso al .gitignore con i caratteri speciali protetti', () => {
    const { repo } = setup()
    writeFileSync(join(repo, '.gitignore'), 'node_modules')
    addToGitignore(repo, 'logs/a[1].log')
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('node_modules\n/logs/a\\[1\\].log\n')
  })
})
```

`test/integration/patch-apply.test.ts`:
```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { applyPatch, readWorkingDiff, stageFiles } from '../../src/main/git/working'
import { buildPatch, changedKeys, lineKey } from '../../src/shared/patch'
import { git, makeRepo } from '../helpers/repo'

const options = { ignoreWhitespace: false, force: false }
const lines = (n: number) => Array.from({ length: n }, (_, i) => `riga ${i + 1}`)

function setup(name = 'f.txt') {
  const repo = makeRepo(0)
  writeFileSync(join(repo, name), lines(20).join('\n') + '\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'base')
  const changed = lines(20)
  changed[1] = 'DUE'
  changed[17] = 'DICIOTTO'
  writeFileSync(join(repo, name), changed.join('\n') + '\n')
  return { repo, runner: new GitRunner(() => 'git', repo, () => {}) }
}

describe('stage e scarto di righe e blocchi con git vero', () => {
  it('stage di una sola riga aggiunta: in stage c’è solo quella', async () => {
    const { repo, runner } = setup()
    const diff = await readWorkingDiff(runner, { path: 'f.txt' }, 'unstaged', options)
    expect(diff.hunks).toHaveLength(2)
    const addLine = diff.hunks[0].lines.findIndex((l) => l.type === 'add')
    await applyPatch(runner, buildPatch(diff, new Set([lineKey(0, addLine)]), false)!, 'stage')
    // git aggiunge all'intestazione il contesto della funzione: "@@ -2,0 +3 @@ riga 2"
    expect(git(repo, 'diff', '--cached', '-U0')).toMatch(/@@ -2,0 \+3 @@.*\n\+DUE\n/)
    expect(git(repo, 'diff', '--cached', '-U0')).not.toContain('DICIOTTO')
  })

  it('unstage di un blocco e scarto di un blocco', async () => {
    const { repo, runner } = setup('con spazio è.txt')
    await stageFiles(runner, ['con spazio è.txt'])
    const staged = await readWorkingDiff(runner, { path: 'con spazio è.txt' }, 'staged', options)
    await applyPatch(runner, buildPatch(staged, changedKeys(staged, 1), true)!, 'unstage')
    expect(git(repo, 'diff', '--cached')).toContain('+DUE')
    expect(git(repo, 'diff', '--cached')).not.toContain('DICIOTTO')

    const unstaged = await readWorkingDiff(runner, { path: 'con spazio è.txt' }, 'unstaged', options)
    await applyPatch(runner, buildPatch(unstaged, changedKeys(unstaged, 0), true)!, 'discard')
    expect(git(repo, 'diff')).toBe('')
    expect(git(repo, 'diff', '--cached')).toContain('+DUE')
  })

  it("ultima riga senza a capo", async () => {
    const repo = makeRepo(0)
    writeFileSync(join(repo, 'f.txt'), 'a\nb')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'base')
    writeFileSync(join(repo, 'f.txt'), 'a\nB')
    const runner = new GitRunner(() => 'git', repo, () => {})
    const diff = await readWorkingDiff(runner, { path: 'f.txt' }, 'unstaged', options)
    await applyPatch(runner, buildPatch(diff, changedKeys(diff), false)!, 'stage')
    expect(git(repo, 'diff')).toBe('')
    expect(git(repo, 'show', ':f.txt')).toBe('a\nB')
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/integration/working.test.ts test/integration/patch-apply.test.ts`
Expected: FAIL, perché il modulo `working` non esiste.

- [ ] **Step 3: Implementa**

`src/main/git/working.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiffOptions, FileDiff, PatchMode, StashEntry, WorkingArea } from '../../shared/types'
import { type DiffRequest, limitedDiff } from './diff'
import type { GitRunner } from './runner'

const write = { write: true }

export async function readWorkingDiff(runner: GitRunner, file: DiffRequest, area: WorkingArea, options: DiffOptions): Promise<FileDiff> {
  const base = ['--no-color', '--no-ext-diff', '-U3', ...(options.ignoreWhitespace ? ['-w'] : [])]
  const paths = file.oldPath ? [file.oldPath, file.path] : [file.path]
  // Il file non tracciato si confronta con un file vuoto: git esce con 1 quando c'è una differenza
  const out =
    area === 'untracked'
      ? await runner.run(['diff', ...base, '--no-index', '--', '/dev/null', file.path], { okCodes: [0, 1] })
      : await runner.run(['diff', ...(area === 'staged' ? ['--cached', '-M'] : []), ...base, '--', ...paths])
  return limitedDiff(out.stdout, file, options.force)
}

const hasHead = async (runner: GitRunner) =>
  (await runner.run(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] })).exitCode === 0

export async function stageFiles(runner: GitRunner, paths: string[]): Promise<void> {
  await runner.run(['add', '-A', '--', ...paths], write)
}

/** In un repo senza commit non c'è HEAD da cui ripristinare l'index: si toglie il file dall'index. */
export async function unstageFiles(runner: GitRunner, paths: string[]): Promise<void> {
  if (await hasHead(runner)) await runner.run(['restore', '--staged', '--', ...paths], write)
  else await runner.run(['rm', '--cached', '-r', '-q', '--', ...paths], write)
}

export async function discardFiles(runner: GitRunner, tracked: string[], untracked: string[]): Promise<void> {
  if (tracked.length) await runner.run(['restore', '--', ...tracked], write)
  if (untracked.length) await runner.run(['clean', '-f', '-q', '--', ...untracked], write)
}

export async function stageAll(runner: GitRunner): Promise<void> {
  await runner.run(['add', '-A'], write)
}

export async function unstageAll(runner: GitRunner): Promise<void> {
  if (await hasHead(runner)) await runner.run(['reset', '-q'], write)
  else await runner.run(['rm', '--cached', '-r', '-q', '.'], write)
}

const APPLY: Record<PatchMode, string[]> = {
  stage: ['--cached'],
  unstage: ['--cached', '--reverse'],
  discard: ['--reverse'],
}

export async function applyPatch(runner: GitRunner, patch: string, mode: PatchMode): Promise<void> {
  await runner.run(['apply', ...APPLY[mode], '--recount', '--whitespace=nowarn', '-'], { ...write, stdin: patch })
}

export async function commit(runner: GitRunner, message: string, amend: boolean): Promise<void> {
  await runner.run(['commit', '-F', '-', ...(amend ? ['--amend'] : [])], { ...write, stdin: message })
}

export async function lastCommitMessage(runner: GitRunner): Promise<string> {
  const r = await runner.run(['log', '-1', '--format=%B'], { okCodes: [0, 128] })
  return r.exitCode === 0 ? r.stdout.trimEnd() : ''
}

export function parseStashList(out: string): StashEntry[] {
  const parts = out.split('\0')
  const stashes: StashEntry[] = []
  for (let i = 0; i + 4 <= parts.length; i += 4) {
    const [ref, sha, time, message] = parts.slice(i, i + 4)
    stashes.push({ ref, sha, time: Number(time), message })
  }
  return stashes
}

export async function readStashes(runner: GitRunner): Promise<StashEntry[]> {
  return parseStashList((await runner.run(['stash', 'list', '-z', '--format=%gd%x00%H%x00%ct%x00%s'])).stdout)
}

export async function stashPush(runner: GitRunner, message: string, includeUntracked: boolean): Promise<void> {
  await runner.run(['stash', 'push', ...(includeUntracked ? ['-u'] : []), ...(message ? ['-m', message] : [])], write)
}

export async function stashAction(runner: GitRunner, action: 'apply' | 'pop' | 'drop', ref: string): Promise<void> {
  await runner.run(['stash', action, '-q', ref], write)
}

/** Aggiunge "/percorso" al .gitignore della radice, proteggendo i caratteri speciali dei pattern. */
export function addToGitignore(root: string, path: string): void {
  const file = join(root, '.gitignore')
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  writeFileSync(file, `${current}${separator}/${path.replace(/[*?[\]\\]/g, '\\$&')}\n`)
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/integration/working.test.ts test/integration/patch-apply.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: stage/unstage/scarto, patch parziali, commit, amend, stash e .gitignore" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: IPC delle modifiche locali

**Files:**
- Modify: `src/shared/ipc.ts`, `src/main/ipc-handlers.ts`, `src/preload/index.ts`
- Test: `test/e2e/working-api.spec.ts`

**Interfaces:**
- Produces, in `Api`, operazioni che restituiscono tutte `Promise<Result<…>>`:
  - `workingStatus(root)` → `WorkingStatus`;
  - `workingDiff(root, file, area, options)` → `FileDiff`;
  - `stage(root, paths)`, `unstage(root, files: { path; oldPath? }[])` e `discard(root, files: { path; untracked: boolean }[])` → `void`;
  - `stageAll(root)` e `unstageAll(root)` → `void`;
  - `applyPatch(root, patch, mode)` → `void`;
  - `commit(root, message, amend)` → `void` e `lastCommitMessage(root)` → `string`;
  - `stashList(root)` → `StashEntry[]`, `stashPush(root, message, includeUntracked)` e `stashAction(root, action, ref)` → `void`;
  - `ignorePath(root, path)` → `void`.

- [ ] **Step 1: Scrivi il test E2E che fallisce**

`test/e2e/working-api.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Api } from '../../src/shared/ipc'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: stato, stage, commit e percorsi non validi', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch()
  await page.evaluate((r) => (globalThis as unknown as Win).api.openRepo(r), repo)

  const status = await page.evaluate((r) => (globalThis as unknown as Win).api.workingStatus(r), repo)
  expect(status).toMatchObject({ ok: true, value: { unstaged: [{ path: 'file1.txt', status: 'M' }] } })

  expect(await page.evaluate((r) => (globalThis as unknown as Win).api.stage(r, ['file1.txt']), repo)).toMatchObject({ ok: true })
  expect(await page.evaluate((r) => (globalThis as unknown as Win).api.commit(r, 'dalla ui', false), repo)).toMatchObject({ ok: true })
  expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe('dalla ui')

  const outside = await page.evaluate((r) => (globalThis as unknown as Win).api.stage(r, ['../fuori.txt']), repo)
  expect(outside.ok).toBe(false)
  const badRef = await page.evaluate((r) => (globalThis as unknown as Win).api.stashAction(r, 'drop', '--all'), repo)
  expect(badRef.ok).toBe(false)
  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: FAIL, perché `workingStatus` non esiste su `Api`.

- [ ] **Step 3: Contratto IPC**

In `src/shared/ipc.ts`, aggiungi agli import dei tipi `PatchMode`, `StashEntry`, `WorkingArea` e `WorkingStatus`. In `Channels`:
```ts
  workingStatus: 'working:status',
  workingDiff: 'working:diff',
  stage: 'working:stage',
  unstage: 'working:unstage',
  discard: 'working:discard',
  stageAll: 'working:stage-all',
  unstageAll: 'working:unstage-all',
  applyPatch: 'working:apply-patch',
  commit: 'working:commit',
  lastCommitMessage: 'working:last-message',
  stashList: 'stash:list',
  stashPush: 'stash:push',
  stashAction: 'stash:action',
  ignorePath: 'working:ignore',
```
In `Api`:
```ts
  workingStatus(root: string): Promise<Result<WorkingStatus>>
  workingDiff(root: string, file: { path: string; oldPath?: string }, area: WorkingArea, options: DiffOptions): Promise<Result<FileDiff>>
  stage(root: string, paths: string[]): Promise<Result<void>>
  unstage(root: string, files: { path: string; oldPath?: string }[]): Promise<Result<void>>
  discard(root: string, files: { path: string; untracked: boolean }[]): Promise<Result<void>>
  stageAll(root: string): Promise<Result<void>>
  unstageAll(root: string): Promise<Result<void>>
  /** Patch costruita dal renderer con buildPatch sulle righe scelte. */
  applyPatch(root: string, patch: string, mode: PatchMode): Promise<Result<void>>
  commit(root: string, message: string, amend: boolean): Promise<Result<void>>
  lastCommitMessage(root: string): Promise<Result<string>>
  stashList(root: string): Promise<Result<StashEntry[]>>
  stashPush(root: string, message: string, includeUntracked: boolean): Promise<Result<void>>
  stashAction(root: string, action: 'apply' | 'pop' | 'drop', ref: string): Promise<Result<void>>
  ignorePath(root: string, path: string): Promise<Result<void>>
```

- [ ] **Step 4: Handler e preload**

In `src/main/ipc-handlers.ts`:
- Import: `import { isAbsolute } from 'node:path'`, `import type { PatchMode, WorkingArea } from '../shared/types'`, `import { readStatus } from './git/status'` e:
```ts
import {
  addToGitignore, applyPatch, commit, discardFiles, lastCommitMessage, readStashes, readWorkingDiff,
  stageAll, stageFiles, stashAction, stashPush, unstageAll, unstageFiles,
} from './git/working'
```
- Validazione, dopo `diffOptions()`:
```ts
const MAX_TEXT = 50 * 1024 * 1024

/** Percorso relativo dentro il repo. */
function relPath(value: unknown): string {
  const p = str(value, 'path')
  if (isAbsolute(p) || p.split(/[\\/]/).includes('..')) throw new TypeError(`percorso non valido: ${p}`)
  return p
}

function list<T>(value: unknown, item: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) throw new TypeError('elenco non valido')
  return value.map(item)
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new TypeError(`${name} non valido`)
  return value
}

function oneOf<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (!options.includes(value as T)) throw new TypeError(`${name} non valido`)
  return value as T
}

function stashRef(value: unknown): string {
  const ref = str(value, 'ref')
  if (!/^stash@\{\d+\}$/.test(ref)) throw new TypeError('stash non valido')
  return ref
}

const fileWithOld = (v: unknown) => {
  const f = fileRequest(v)
  return f.oldPath ? [relPath(f.oldPath), relPath(f.path)] : [relPath(f.path)]
}
```
- Handler, dopo quelli della storia:
```ts
  ipcMain.handle(Channels.workingStatus, (_e, root: unknown) => withSession(root, (s) => readStatus(s.runner)))
  ipcMain.handle(Channels.workingDiff, (_e, root: unknown, file: unknown, area: unknown, options: unknown) =>
    withSession(root, (s) => {
      const f = fileRequest(file)
      relPath(f.path)
      if (f.oldPath) relPath(f.oldPath)
      return readWorkingDiff(s.runner, f, oneOf<WorkingArea>(area, ['staged', 'unstaged', 'untracked', 'conflicted'], 'area'), diffOptions(options))
    }),
  )
  ipcMain.handle(Channels.stage, (_e, root: unknown, paths: unknown) => withSession(root, (s) => stageFiles(s.runner, list(paths, relPath))))
  ipcMain.handle(Channels.unstage, (_e, root: unknown, files: unknown) =>
    withSession(root, (s) => unstageFiles(s.runner, list(files, fileWithOld).flat())),
  )
  ipcMain.handle(Channels.discard, (_e, root: unknown, files: unknown) =>
    withSession(root, (s) => {
      const items = list(files, (v) => ({ path: relPath((v as { path?: unknown })?.path), untracked: (v as { untracked?: unknown })?.untracked === true }))
      return discardFiles(s.runner, items.filter((f) => !f.untracked).map((f) => f.path), items.filter((f) => f.untracked).map((f) => f.path))
    }),
  )
  ipcMain.handle(Channels.stageAll, (_e, root: unknown) => withSession(root, (s) => stageAll(s.runner)))
  ipcMain.handle(Channels.unstageAll, (_e, root: unknown) => withSession(root, (s) => unstageAll(s.runner)))
  ipcMain.handle(Channels.applyPatch, (_e, root: unknown, patch: unknown, mode: unknown) =>
    withSession(root, (s) => applyPatch(s.runner, text(patch, 'patch'), oneOf<PatchMode>(mode, ['stage', 'unstage', 'discard'], 'mode'))),
  )
  ipcMain.handle(Channels.commit, (_e, root: unknown, message: unknown, amend: unknown) =>
    withSession(root, (s) => {
      const m = text(message, 'message')
      if (!m.trim()) throw new TypeError('Il messaggio di commit è vuoto')
      return commit(s.runner, m, amend === true)
    }),
  )
  ipcMain.handle(Channels.lastCommitMessage, (_e, root: unknown) => withSession(root, (s) => lastCommitMessage(s.runner)))
  ipcMain.handle(Channels.stashList, (_e, root: unknown) => withSession(root, (s) => readStashes(s.runner)))
  ipcMain.handle(Channels.stashPush, (_e, root: unknown, message: unknown, untracked: unknown) =>
    withSession(root, (s) => stashPush(s.runner, text(message, 'message').trim(), untracked === true)),
  )
  ipcMain.handle(Channels.stashAction, (_e, root: unknown, action: unknown, ref: unknown) =>
    withSession(root, (s) => stashAction(s.runner, oneOf(action, ['apply', 'pop', 'drop'] as const, 'action'), stashRef(ref))),
  )
  ipcMain.handle(Channels.ignorePath, (_e, root: unknown, path: unknown) =>
    withSession(root, (s) => addToGitignore(s.root, relPath(path))),
  )
```

In `src/preload/index.ts`, dopo `commitFileDiff`:
```ts
  workingStatus: (root) => ipcRenderer.invoke(Channels.workingStatus, root),
  workingDiff: (root, file, area, options) => ipcRenderer.invoke(Channels.workingDiff, root, file, area, options),
  stage: (root, paths) => ipcRenderer.invoke(Channels.stage, root, paths),
  unstage: (root, files) => ipcRenderer.invoke(Channels.unstage, root, files),
  discard: (root, files) => ipcRenderer.invoke(Channels.discard, root, files),
  stageAll: (root) => ipcRenderer.invoke(Channels.stageAll, root),
  unstageAll: (root) => ipcRenderer.invoke(Channels.unstageAll, root),
  applyPatch: (root, patch, mode) => ipcRenderer.invoke(Channels.applyPatch, root, patch, mode),
  commit: (root, message, amend) => ipcRenderer.invoke(Channels.commit, root, message, amend),
  lastCommitMessage: (root) => ipcRenderer.invoke(Channels.lastCommitMessage, root),
  stashList: (root) => ipcRenderer.invoke(Channels.stashList, root),
  stashPush: (root, message, untracked) => ipcRenderer.invoke(Channels.stashPush, root, message, untracked),
  stashAction: (root, action, ref) => ipcRenderer.invoke(Channels.stashAction, root, action, ref),
  ignorePath: (root, path) => ipcRenderer.invoke(Channels.ignorePath, root, path),
```

- [ ] **Step 5: Esegui i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 10 test.

- [ ] **Step 6: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: IPC delle modifiche locali e degli stash con validazione dei percorsi" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Store, vista delle modifiche locali, sidebar e azioni

**Files:**
- Modify: `src/renderer/stores/repo.ts`, `src/renderer/components/HistoryView.vue`, `src/renderer/components/CommitList.vue`, `src/renderer/components/RepoView.vue`, `src/renderer/App.vue`, `src/shared/shortcuts.ts`
- Create: `src/renderer/components/WorkingView.vue`, `src/renderer/components/StageDiff.vue`, `src/renderer/components/Sidebar.vue`, `src/renderer/actions/working.ts`
- Test: `test/e2e/working.spec.ts`

**Interfaces:**
- Consumes: le operazioni di `window.api` (Task 3), `buildPatch`, `changedKeys` e `lineKey` (Task 1).
- Produces:
  - nello store: `status`, `stashes`, `view: 'commit' | 'working'`, `working`, `workingDiff`, `selectedLines`, `subject`, `body`, `amend`, `changeCount` e `canCommit`;
  - sempre nello store, i metodi `selectWorking`, `selectWorkingFile`, `stage`, `unstage`, `discard`, `stageEverything`, `unstageEverything`, `applyLines`, `toggleLine`, `ignore`, `commitChanges`, `setAmend`, `stashPush` e `stashAction`;
  - i `data-testid` elencati nel test E2E.

Il codice completo dei componenti è nel repository, allo stesso commit di questo task. Il comportamento atteso è descritto qui sotto e verificato dal test E2E.
- **Store**:
  - `refresh()` ricarica in parallelo info, stato, stash e storia, poi il diff del file locale selezionato.
  - Ogni operazione passa per `run(op)`: mostra l'errore se c'è e poi chiama `refresh()`.
  - `applyLines(mode, keys?)` costruisce la patch con `buildPatch(workingDiff, keys ?? selectedLines, mode !== 'stage')`.
  - `toggleLine(h, l, range)`: con Maiuscolo seleziona l'intervallo dall'ultima riga cliccata, dentro lo stesso blocco.
- **HistoryView**: sopra la lista c'è la riga `working-row` "● Modifiche locali (N)", solo se ci sono modifiche.
- **CommitList**: evidenzia il commit selezionato solo se la vista è `commit`.
- **RepoView**: tre colonne (Sidebar 220px | storia | dettaglio). A destra mostra `WorkingView` quando la vista è `working`.
- **WorkingView**:
  - in alto il commit: `commit-subject` con contatore che diventa arancione oltre 50 e rosso oltre 72, `commit-body`, la casella `amend` che carica il messaggio precedente se il campo è vuoto, `commit-button`, e `stash-toggle` che apre `stash-message`, `stash-untracked` e `stash-create`;
  - poi le sezioni `section-staged`, `section-unstaged`, `section-untracked` e `section-conflicted`, con file `working-file` e pulsanti `stage-file`, `unstage-file`, `discard-file`, `ignore-file`, `stage-all` e `unstage-all`;
  - in fondo `StageDiff`.
- **StageDiff**: diff unificato.
  - Blocchi e righe sono modificabili solo se il file è `M`, l'area è `staged` o `unstaged` e "Ignora spazi" è spento.
  - Le righe cambiate si selezionano col clic (`stage-line`).
  - Ogni blocco ha i pulsanti `hunk-stage`, `hunk-discard` e `hunk-unstage`; per la selezione ci sono `lines-stage`, `lines-discard` e `lines-unstage`.
  - Gli scarti chiedono `window.confirm`.
- **Sidebar**: sezione Stash con `stash-item` (clic: dettaglio dello stash a destra) e i pulsanti `stash-apply`, `stash-pop` e `stash-drop` (con conferma).
- **Azioni** (`actions/working.ts`): `working.show`, `working.commit` (⌘↩ / Ctrl+Enter, solo se `canCommit`), `working.stageAll`, `working.unstageAll`, `stash.push` e `stash.pop`.

- [ ] **Step 1: Scrivi il test E2E che fallisce**

`test/e2e/working.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const lines = (n: number) => Array.from({ length: n }, (_, i) => `riga ${i + 1}`)

test('stage di un file e commit con ⌘↩, poi amend', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await expect(page.getByTestId('section-unstaged')).toContainText('file1.txt')
  await page.getByTestId('section-unstaged').getByTestId('stage-file').click()
  await expect(page.getByTestId('section-staged')).toContainText('file1.txt')

  await page.getByTestId('commit-subject').fill('primo commit dalla ui')
  await page.keyboard.press(`${mod}+Enter`)
  await expect(page.getByTestId('commit-row').first()).toContainText('primo commit dalla ui')
  await expect(page.getByTestId('working-row')).toBeHidden()

  writeFileSync(join(repo, 'file1.txt'), 'ancora\n')
  await page.getByTestId('working-row').click()
  await page.getByTestId('stage-all').first().click()
  await page.getByTestId('amend').check()
  await expect(page.getByTestId('commit-subject')).toHaveValue('primo commit dalla ui')
  await page.getByTestId('commit-subject').fill('commit corretto')
  await page.getByTestId('commit-button').click()
  await expect(page.getByTestId('commit-row').first()).toContainText('commit corretto')
  expect(git(repo, 'rev-list', '--count', 'HEAD').trim()).toBe('2')
  await app.close()
})

test('stage di una sola riga e scarto di un blocco con conferma', async () => {
  const repo = makeRepo(0)
  writeFileSync(join(repo, 'f.txt'), lines(20).join('\n') + '\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'base')
  const changed = lines(20)
  changed[1] = 'DUE'
  changed[17] = 'DICIOTTO'
  writeFileSync(join(repo, 'f.txt'), changed.join('\n') + '\n')

  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-unstaged').getByTestId('working-file').click()
  await page.getByTestId('stage-line').filter({ hasText: 'DUE' }).click()
  await page.getByTestId('lines-stage').click()
  await expect.poll(() => git(repo, 'diff', '--cached')).toContain('+DUE')
  expect(git(repo, 'diff', '--cached')).not.toContain('DICIOTTO')

  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('section-unstaged').getByTestId('working-file').click()
  await page.getByTestId('hunk-discard').last().click()
  await expect.poll(() => readFileSync(join(repo, 'f.txt'), 'utf8')).not.toContain('DICIOTTO')
  await app.close()
})

test('ignora un file non tracciato, stash e pop dalla sidebar', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'debug.log'), 'x\n')
  writeFileSync(join(repo, 'file1.txt'), 'da mettere da parte\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-untracked').getByTestId('ignore-file').click()
  await expect.poll(() => readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('/debug.log\n')

  await page.getByTestId('stash-toggle').click()
  await page.getByTestId('stash-message').fill('lavoro a metà')
  await page.getByTestId('stash-untracked').check()
  await page.getByTestId('stash-create').click()
  await expect(page.getByTestId('stash-item')).toContainText('lavoro a metà')
  // lo stash -u porta via anche il .gitignore appena creato: debug.log torna non tracciato
  await expect(page.getByTestId('working-row')).toContainText('(1)')

  await page.getByTestId('stash-pop').click()
  await expect(page.getByTestId('stash-item')).toHaveCount(0)
  await expect(page.getByTestId('working-row')).toBeVisible()
  expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('da mettere da parte\n')
  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:e2e -- test/e2e/working.spec.ts`
Expected: FAIL, perché `working-row` non esiste.

- [ ] **Step 3: Implementa store, componenti e azioni come descritto sopra**

- [ ] **Step 4: Esegui tutti i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 13 test.

- [ ] **Step 5: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: vista delle modifiche locali con stage di file, blocchi e righe, commit, amend e stash" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Verifica su un repo reale

- [ ] **Step 1:** su una copia di `demo-backend` (`git clone --local` in una cartella temporanea), modifica due file con uno script Playwright temporaneo. Poi fai stage di una riga, commit, screenshot della vista delle modifiche locali e controlla il risultato con `git log -1 -p`.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm test && npm run test:e2e`, tutto verde.

**Note dall'esecuzione:**
- `Sidebar.vue` è diventato `RepoSidebar.vue`: la regola `vue/multi-word-component-names` vuole nomi composti.
- I pulsanti degli stash si mostrano con l'opacità, non con `display: none`. Restano raggiungibili da tastiera (`:focus-within`) e cliccabili nei test.
- Bug trovato da un test E2E instabile: la selezione automatica del primo commit, alla fine del primo caricamento della storia, riportava la vista su "commit" anche se l'utente aveva già aperto le modifiche locali. Ora `select(sha, index, show = false)` carica il dettaglio senza cambiare vista.
