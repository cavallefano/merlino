# Merlino — Blame, storia del file e albero dei file — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dal menu di un file: storia del file (la storia filtrata con `path:`) e blame in un popup; nel dettaglio del commit l'albero di tutti i file a quel commit, con il contenuto.

**Architecture:**
- Il main legge `git blame --porcelain`, `git ls-tree` e `git cat-file` con parser puri (`src/main/git/blame.ts`, `src/main/git/tree.ts`), dietro tre canali IPC validati.
- Il renderer tiene nello store `repo` la modalità del dettaglio, l'albero caricato per cartella e il file del blame.
- I file su cui si agisce (commit, albero, modifiche locali) e il loro menu stanno in `src/renderer/actions/files.ts`.
- La ricerca passa in `src/shared/search.ts`, così il renderer legge i filtri `path:`.

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, Vitest, Playwright.

Spec: `docs/superpowers/specs/2026-10-26-merlino-blame-file-history-design.md`. Branch: `feature/blame-file-history`, che parte da `develop`.

## Global Constraints

- **Nessuna dipendenza nuova.**
- **Limiti del contenuto** come nel diff: `DIFF_MAX_CHARS` (5 MB) e `DIFF_MAX_LINES` (20 000), binario se c'è un NUL nei primi 8000 caratteri.
- **Righe non ancora nel commit**: SHA di soli zeri (`/^0+$/`).
- **Icona `file`**: da Lucide (`lucide-static` 1.61.0, ISC), nello stesso `AppIcon.vue`.
- **Test id nuovi**: `detail-changes`, `detail-tree`, `file-tree`, `tree-row`, `content-line`, `file-blame`, `blame-dialog`, `blame-back`, `blame-path`, `blame-revision`, `blame-whitespace`, `blame-close`, `blame-line`, `blame-commit`, `blame-picked`, `blame-show-commit`, `blame-parent`.
- **Testi** in inglese e in italiano.
- **Test e screenshot**: sempre con la finestra nascosta (`MERLINO_E2E=1`).
- **Repo**: solo nomi fittizi.
- **Commit**: email locale `cavallefano@users.noreply.github.com`; il messaggio termina con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: ricerca condivisa e filtri `path:`

**Files:**
- Move: `src/main/git/search.ts` → `src/shared/search.ts`
- Modify: `src/main/history.ts`
- Test: `test/unit/search.test.ts`

**Interfaces:**
- Produces:
  - `searchArgs(query: string): { args: string[]; paths: string[] }` da `src/shared/search.ts` (invariato);
  - `matchesPath(path: string, filters: string[]): boolean`.

- [ ] **Step 1: spostamento e test che falliscono**

```bash
git mv src/main/git/search.ts src/shared/search.ts
```

In `src/main/history.ts`, `import { searchArgs } from './git/search'` diventa `import { searchArgs } from '../shared/search'`.

In `test/unit/search.test.ts`, l'import diventa `import { matchesPath, searchArgs } from '../../src/shared/search'` e in fondo:

```ts
describe('matchesPath', () => {
  it('lo stesso percorso o un file dentro la cartella; nessun filtro, nessun file', () => {
    expect(matchesPath('src/app.ts', ['src/app.ts'])).toBe(true)
    expect(matchesPath('src/lib/util.ts', ['src'])).toBe(true)
    expect(matchesPath('src/lib/util.ts', ['src/'])).toBe(true)
    expect(matchesPath('src/application.ts', ['src/app'])).toBe(false)
    expect(matchesPath('src/app.ts', [])).toBe(false)
  })
})
```

- [ ] **Step 2: i test falliscono**

Run: `npx vitest run test/unit/search.test.ts`
Expected: FAIL, `matchesPath` non è una funzione.

- [ ] **Step 3: implementazione**

In fondo a `src/shared/search.ts`:

```ts
/** Il file rientra in un filtro path: (lo stesso percorso o un file dentro la cartella). */
export function matchesPath(path: string, filters: string[]): boolean {
  return filters.some((f) => path === f || path.startsWith(f.endsWith('/') ? f : `${f}/`))
}
```

- [ ] **Step 4: i test passano**

Run: `npx vitest run test/unit/search.test.ts test/integration/history.test.ts && npm run typecheck`
Expected: PASS, typecheck pulito.

- [ ] **Step 5: commit**

```bash
git add -A src/shared/search.ts src/main/git/search.ts src/main/history.ts test/unit/search.test.ts
git commit -m "refactor: ricerca della storia in src/shared, con i filtri path: per il renderer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: blame nel main

**Files:**
- Create: `src/main/git/blame.ts`
- Modify: `src/shared/types.ts`
- Test: `test/unit/blame.test.ts`, `test/integration/blame.test.ts`

**Interfaces:**
- Produces:
  - tipi `BlameCommit`, `BlameResult` in `src/shared/types.ts`;
  - `unquotePath(s: string): string`;
  - `parseBlame(out: string, path: string): BlameResult`;
  - `readBlame(runner: GitRunner, sha: string | null, path: string, ignoreWhitespace: boolean): Promise<BlameResult>`.

- [ ] **Step 1: test che falliscono**

`test/unit/blame.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseBlame, unquotePath } from '../../src/main/git/blame'

const A = 'a'.repeat(40)
const Z = '0'.repeat(40)
const person = (name: string, mail: string, time: number) =>
  ['author', 'committer'].flatMap((who) => [`${who} ${name}`, `${who}-mail <${mail}>`, `${who}-time ${time}`, `${who}-tz +0100`])

const out = [
  `${A} 1 1 2`,
  ...person('Ada Lovelace', 'ada@example.com', 1700000000),
  'summary primo',
  'boundary',
  'filename src/app.ts',
  '\tuno',
  `${A} 2 2`,
  '\tdue',
  `${Z} 3 3 1`,
  ...person('Not Committed Yet', 'not.committed.yet', 1700000100),
  'summary Version of src/app.ts from src/app.ts',
  `previous ${A} "src/citt\\303\\240 \\"q\\".ts"`,
  'filename src/app.ts',
  '\t\tindentata',
  '',
].join('\n')

describe('parseBlame', () => {
  it('blocchi, dati del commit una volta sola, righe non nel commit e previous tra virgolette', () => {
    const b = parseBlame(out, 'src/app.ts')
    expect(b.path).toBe('src/app.ts')
    expect(b.binary).toBe(false)
    expect(b.lines).toEqual([
      { sha: A, text: 'uno' },
      { sha: A, text: 'due' },
      { sha: Z, text: '\tindentata' },
    ])
    expect(b.commits[A]).toEqual({ sha: A, author: 'Ada Lovelace', authorEmail: 'ada@example.com', authorTime: 1700000000, summary: 'primo' })
    expect(b.commits[Z].previous).toEqual({ sha: A, path: 'src/città "q".ts' })
  })

  it('binario: nessuna riga', () => {
    expect(parseBlame(`${A} 1 1 1\nsummary x\n\t\0bin\n`, 'b.dat')).toMatchObject({ binary: true, lines: [] })
  })
})

describe('unquotePath', () => {
  it('senza virgolette resta com è; escape in stile C, UTF-8 in ottale o diretto', () => {
    expect(unquotePath('src/a b.txt')).toBe('src/a b.txt')
    expect(unquotePath('"a\\tb\\\\c\\"d"')).toBe('a\tb\\c"d')
    expect(unquotePath('"citt\\303\\240"')).toBe('città')
    expect(unquotePath('"città \\"x\\""')).toBe('città "x"')
  })
})
```

`test/integration/blame.test.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBlame } from '../../src/main/git/blame'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

const commitAll = (repo: string, message: string) => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD').trim()
}

describe('readBlame', () => {
  it('a un commit, dopo una rinomina e sul disco con una riga nuova', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(repo, 'file1.txt'), '1\ndue\n')
    const second = commitAll(repo, 'seconda riga')
    git(repo, 'mv', 'file1.txt', 'città.txt')
    const renamed = commitAll(repo, 'rinomina')

    const b = await readBlame(runner, renamed, 'città.txt', false)
    expect(b.lines).toEqual([
      { sha: first, text: '1' },
      { sha: second, text: 'due' },
    ])
    expect(b.commits[second]).toMatchObject({
      author: 'Test',
      authorEmail: 'test@example.com',
      summary: 'seconda riga',
      previous: { sha: first, path: 'file1.txt' },
    })
    expect(b.commits[first].previous).toBeUndefined()

    writeFileSync(join(repo, 'città.txt'), '1\ndue\ntre\n')
    const local = await readBlame(runner, null, 'città.txt', false)
    const sha = local.lines[2].sha
    expect(sha).toMatch(/^0+$/)
    expect(local.commits[sha].previous).toEqual({ sha: renamed, path: 'città.txt' })
  })

  it('-w: una riga cambiata solo negli spazi resta del commit di prima; file binario', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(repo, 'file1.txt'), '  1\n')
    const spaces = commitAll(repo, 'spazi')
    expect((await readBlame(runner, spaces, 'file1.txt', false)).lines[0].sha).toBe(spaces)
    expect((await readBlame(runner, spaces, 'file1.txt', true)).lines[0].sha).toBe(first)

    writeFileSync(join(repo, 'bin.dat'), Buffer.from([0, 1, 2, 10, 3]))
    const bin = commitAll(repo, 'binario')
    expect(await readBlame(runner, bin, 'bin.dat', false)).toMatchObject({ binary: true, lines: [] })
  })
})
```

- [ ] **Step 2: i test falliscono**

Run: `npx vitest run test/unit/blame.test.ts test/integration/blame.test.ts`
Expected: FAIL, `src/main/git/blame` non esiste.

- [ ] **Step 3: implementazione**

In `src/shared/types.ts`, dopo `FileDiff`:

```ts
export interface BlameCommit {
  sha: string
  author: string
  authorEmail: string
  /** Secondi dall'epoch. */
  authorTime: number
  summary: string
  /** Il commit precedente e il percorso che il file aveva lì; manca nel commit che ha creato il file. */
  previous?: { sha: string; path: string }
}

/** Le righe di un file con il commit che le ha scritte; lo SHA di zeri è per le righe non ancora nel commit. */
export interface BlameResult {
  path: string
  binary: boolean
  commits: Record<string, BlameCommit>
  /** Nell'ordine del file: la riga n è lines[n - 1]. */
  lines: { sha: string; text: string }[]
}
```

`src/main/git/blame.ts`:

```ts
import type { BlameCommit, BlameResult } from '../../shared/types'
import type { GitRunner } from './runner'

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 }

/** Percorso come lo scrive git: tra virgolette in stile C se ha caratteri speciali, con l'UTF-8 in ottale (o diretto, con core.quotePath=false). */
export function unquotePath(s: string): string {
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s
  const body = s.slice(1, -1)
  const bytes: number[] = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      const ch = String.fromCodePoint(body.codePointAt(i) ?? 0)
      bytes.push(...Buffer.from(ch))
      i += ch.length - 1
    } else if (/^[0-7]{3}$/.test(body.slice(i + 1, i + 4))) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8))
      i += 3
    } else {
      const e = body[++i] ?? ''
      bytes.push(ESCAPES[e] ?? e.charCodeAt(0))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** Intestazione di una riga: SHA, riga di origine, riga nel file, righe del gruppo (solo sulla prima). */
const HEADER = /^([0-9a-f]{40,64}) \d+ (\d+)(?: \d+)?$/

/** git blame --porcelain: un'intestazione per riga, i dati del commit la prima volta che compare, poi la riga dopo un TAB. */
export function parseBlame(out: string, path: string): BlameResult {
  const commits: Record<string, BlameCommit> = {}
  const lines: BlameResult['lines'] = []
  let current: BlameCommit | null = null
  let lineNo = 0
  for (const raw of out.split('\n')) {
    if (raw.startsWith('\t')) {
      if (current) lines[lineNo - 1] = { sha: current.sha, text: raw.slice(1) }
      continue
    }
    const header = HEADER.exec(raw)
    if (header) {
      const sha = header[1]
      current = commits[sha] ??= { sha, author: '', authorEmail: '', authorTime: 0, summary: '' }
      lineNo = Number(header[2])
      continue
    }
    if (!current) continue
    const space = raw.indexOf(' ')
    const key = space < 0 ? raw : raw.slice(0, space)
    const value = space < 0 ? '' : raw.slice(space + 1)
    if (key === 'author') current.author = value
    else if (key === 'author-mail') current.authorEmail = value.replace(/^<(.*)>$/, '$1')
    else if (key === 'author-time') current.authorTime = Number(value)
    else if (key === 'summary') current.summary = value
    else if (key === 'previous') {
      const sp = value.indexOf(' ')
      current.previous = { sha: value.slice(0, sp), path: unquotePath(value.slice(sp + 1)) }
    }
  }
  const binary = lines.some((l) => l.text.includes('\0'))
  return { path, binary, commits, lines: binary ? [] : lines }
}

/** Blame di un file a un commit, o del file sul disco con sha null (le righe non ancora nel commit hanno lo SHA di zeri). */
export async function readBlame(runner: GitRunner, sha: string | null, path: string, ignoreWhitespace: boolean): Promise<BlameResult> {
  const args = ['blame', '--porcelain', ...(ignoreWhitespace ? ['-w'] : []), ...(sha ? [sha] : []), '--', path]
  // ponytail: tutto il file in una volta; --incremental a blocchi se servirà su file enormi
  return parseBlame((await runner.run(args)).stdout, path)
}
```

- [ ] **Step 4: i test passano**

Run: `npx vitest run test/unit/blame.test.ts test/integration/blame.test.ts && npm run typecheck`
Expected: PASS (5 test), typecheck pulito.

- [ ] **Step 5: commit**

```bash
git add src/shared/types.ts src/main/git/blame.ts test/unit/blame.test.ts test/integration/blame.test.ts
git commit -m "feat: blame di un file a un commit o sul disco, dal porcelain di git

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: albero e contenuto dei file nel main

**Files:**
- Create: `src/main/git/tree.ts`
- Modify: `src/shared/types.ts`
- Test: `test/unit/tree.test.ts`, `test/integration/tree.test.ts`

**Interfaces:**
- Consumes: `DIFF_MAX_CHARS`, `DIFF_MAX_LINES` da `src/main/git/diff.ts`.
- Produces:
  - tipi `TreeEntry`, `FileContent` in `src/shared/types.ts`;
  - `parseTree(out: string): TreeEntry[]`;
  - `readTree(runner: GitRunner, sha: string, dir: string): Promise<TreeEntry[]>` (`dir` `''` = radice);
  - `readFileContent(runner: GitRunner, sha: string, path: string, force: boolean): Promise<FileContent | null>`.

- [ ] **Step 1: test che falliscono**

`test/unit/tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseTree } from '../../src/main/git/tree'

describe('parseTree', () => {
  it('cartelle prima, poi file e submodule in ordine alfabetico; il nome è dopo il primo TAB', () => {
    const out = '100644 blob aaa\tsrc/b.txt\0040000 tree bbb\tsrc/lib\0160000 commit ccc\tsrc/mod\0100644 blob ddd\tsrc/A\tx.txt\0'
    expect(parseTree(out)).toEqual([
      { name: 'lib', path: 'src/lib', kind: 'folder' },
      { name: 'A\tx.txt', path: 'src/A\tx.txt', kind: 'file' },
      { name: 'b.txt', path: 'src/b.txt', kind: 'file' },
      { name: 'mod', path: 'src/mod', kind: 'submodule' },
    ])
    expect(parseTree('')).toEqual([])
  })
})
```

`test/integration/tree.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { readFileContent, readTree } from '../../src/main/git/tree'
import { git, makeRepo } from '../helpers/repo'

const commitAll = (repo: string, message: string) => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD').trim()
}

describe('readTree', () => {
  it('radice e cartella, con le cartelle prima; una cartella che non c è è vuota', async () => {
    const repo = makeRepo(1)
    mkdirSync(join(repo, 'src/lib'), { recursive: true })
    writeFileSync(join(repo, 'src/lib/util.ts'), 'export {}\n')
    writeFileSync(join(repo, 'src/app.ts'), 'uno\n')
    writeFileSync(join(repo, 'README.md'), '# demo\n')
    const sha = commitAll(repo, 'albero')
    const runner = new GitRunner(() => 'git', repo)
    expect(await readTree(runner, sha, '')).toEqual([
      { name: 'src', path: 'src', kind: 'folder' },
      { name: 'file1.txt', path: 'file1.txt', kind: 'file' },
      { name: 'README.md', path: 'README.md', kind: 'file' },
    ])
    expect(await readTree(runner, sha, 'src')).toEqual([
      { name: 'lib', path: 'src/lib', kind: 'folder' },
      { name: 'app.ts', path: 'src/app.ts', kind: 'file' },
    ])
    expect(await readTree(runner, sha, 'manca')).toEqual([])
  })
})

describe('readFileContent', () => {
  it('testo, binario, troppo grande (poi force), submodule, mancante e cartella', async () => {
    const repo = makeRepo(1)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, 'src/bin.dat'), Buffer.from([0, 1, 2]))
    writeFileSync(join(repo, 'big.txt'), 'x\n'.repeat(20_001))
    git(repo, 'update-index', '--add', '--cacheinfo', `160000,${first},modulo`)
    const sha = commitAll(repo, 'file vari')
    const runner = new GitRunner(() => 'git', repo)
    expect(await readFileContent(runner, sha, 'file1.txt', false)).toEqual({ binary: false, tooLarge: false, text: '1\n' })
    expect(await readFileContent(runner, sha, 'src/bin.dat', false)).toEqual({ binary: true, tooLarge: false, text: '' })
    expect(await readFileContent(runner, sha, 'big.txt', false)).toEqual({ binary: false, tooLarge: true, text: '' })
    expect((await readFileContent(runner, sha, 'big.txt', true))?.text.length).toBe(40_002)
    expect(await readFileContent(runner, sha, 'modulo', false)).toEqual({ binary: false, tooLarge: false, text: `Subproject commit ${first}` })
    expect(await readFileContent(runner, sha, 'manca.txt', false)).toBeNull()
    expect(await readFileContent(runner, sha, 'src', false)).toBeNull()
  })
})
```

- [ ] **Step 2: i test falliscono**

Run: `npx vitest run test/unit/tree.test.ts test/integration/tree.test.ts`
Expected: FAIL, `src/main/git/tree` non esiste.

- [ ] **Step 3: implementazione**

In `src/shared/types.ts`, dopo `BlameResult`:

```ts
/** Una voce dell'albero dei file di un commit. */
export interface TreeEntry {
  name: string
  /** Dalla radice del repo. */
  path: string
  kind: 'folder' | 'file' | 'submodule'
}

/** Contenuto di un file a un commit. */
export interface FileContent {
  binary: boolean
  /** Oltre i limiti: text vuoto finché non si chiede force. */
  tooLarge: boolean
  text: string
}
```

`src/main/git/tree.ts`:

```ts
import type { FileContent, TreeEntry } from '../../shared/types'
import { DIFF_MAX_CHARS, DIFF_MAX_LINES } from './diff'
import type { GitRunner } from './runner'

const KINDS: Record<string, TreeEntry['kind']> = { tree: 'folder', blob: 'file', commit: 'submodule' }

/** git ls-tree -z [-l]: "<modo> <tipo> <oggetto>[ <dimensione>]\t<percorso>\0". */
function records(out: string) {
  return out
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf('\t')
      const [, type = '', object = '', size = '-'] = record.slice(0, tab).split(/ +/)
      return { type, object, size, path: record.slice(tab + 1) }
    })
}

/** Le voci di una cartella: prima le cartelle, poi file e submodule, in ordine alfabetico. */
export function parseTree(out: string): TreeEntry[] {
  return records(out)
    .map((r): TreeEntry => ({ name: r.path.slice(r.path.lastIndexOf('/') + 1), path: r.path, kind: KINDS[r.type] ?? 'file' }))
    .sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name))
}

/** Le voci di una cartella a un commit, dir '' per la radice; una cartella che lì non c'è non ha voci. */
export async function readTree(runner: GitRunner, sha: string, dir: string): Promise<TreeEntry[]> {
  return parseTree((await runner.run(['ls-tree', '-z', sha, ...(dir ? ['--', `${dir}/`] : [])])).stdout)
}

/** Il contenuto di un file a un commit; null se lì non c'è. Binario e troppo grande come nel diff. */
export async function readFileContent(runner: GitRunner, sha: string, path: string, force: boolean): Promise<FileContent | null> {
  const [entry] = records((await runner.run(['ls-tree', '-z', '-l', sha, '--', path])).stdout)
  if (!entry || entry.path !== path || entry.type === 'tree') return null
  if (entry.type === 'commit') return { binary: false, tooLarge: false, text: `Subproject commit ${entry.object}` }
  if (!force && Number(entry.size) > DIFF_MAX_CHARS) return { binary: false, tooLarge: true, text: '' }
  const text = (await runner.run(['cat-file', 'blob', entry.object])).stdout
  if (text.slice(0, 8000).includes('\0')) return { binary: true, tooLarge: false, text: '' }
  if (!force && text.split('\n').length > DIFF_MAX_LINES) return { binary: false, tooLarge: true, text: '' }
  return { binary: false, tooLarge: false, text }
}
```

- [ ] **Step 4: i test passano**

Run: `npx vitest run test/unit/tree.test.ts test/integration/tree.test.ts && npm run typecheck`
Expected: PASS (3 test), typecheck pulito.

- [ ] **Step 5: commit**

```bash
git add src/shared/types.ts src/main/git/tree.ts test/unit/tree.test.ts test/integration/tree.test.ts
git commit -m "feat: albero dei file e contenuto di un file a un commit, con i limiti del diff

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: canali IPC

**Files:**
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts`
- Test: `test/e2e/files-api.spec.ts`

**Interfaces:**
- Consumes: `readBlame` (Task 2), `readTree`, `readFileContent` (Task 3); i validatori `sha`, `relPath` di `src/main/validate.ts`.
- Produces, in `Api`:
  - `blame(root: string, sha: string | null, path: string, ignoreWhitespace: boolean): Promise<Result<BlameResult>>`;
  - `treeList(root: string, sha: string, dir: string): Promise<Result<TreeEntry[]>>`;
  - `fileContent(root: string, sha: string, path: string, force: boolean): Promise<Result<FileContent | null>>`.

- [ ] **Step 1: E2E che fallisce**

`test/e2e/files-api.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: blame, albero e contenuto; SHA e percorsi non validi', async () => {
  const repo = makeRepo(1)
  const a = { repo, sha: git(repo, 'rev-parse', 'HEAD').trim() }
  const { app, page } = await launch()
  await page.evaluate((x) => (globalThis as unknown as Win).api.openRepo(x.repo), a)

  const r = await page.evaluate(async (x) => {
    const api = (globalThis as unknown as Win).api
    return {
      blame: await api.blame(x.repo, x.sha, 'file1.txt', false),
      local: await api.blame(x.repo, null, 'file1.txt', true),
      tree: await api.treeList(x.repo, x.sha, ''),
      content: await api.fileContent(x.repo, x.sha, 'file1.txt', false),
      missing: await api.fileContent(x.repo, x.sha, 'manca.txt', false),
      option: await api.blame(x.repo, '--output=/tmp/merlino-x', 'file1.txt', false),
      outside: await api.fileContent(x.repo, x.sha, '../fuori.txt', false),
      dir: await api.treeList(x.repo, x.sha, '/etc'),
    }
  }, a)
  expect(r.blame).toMatchObject({ ok: true, value: { lines: [{ sha: a.sha, text: '1' }] } })
  expect(r.local).toMatchObject({ ok: true, value: { lines: [{ sha: a.sha, text: '1' }] } })
  expect(r.tree).toEqual({ ok: true, value: [{ name: 'file1.txt', path: 'file1.txt', kind: 'file' }] })
  expect(r.content).toEqual({ ok: true, value: { binary: false, tooLarge: false, text: '1\n' } })
  expect(r.missing).toEqual({ ok: true, value: null })
  expect([r.option.ok, r.outside.ok, r.dir.ok]).toEqual([false, false, false])
  await app.close()
})
```

- [ ] **Step 2: l'E2E fallisce**

Run: `npx electron-vite build && npx playwright test test/e2e/files-api.spec.ts`
Expected: FAIL, `api.blame is not a function`.

- [ ] **Step 3: implementazione**

`src/shared/ipc.ts`:
- negli import da `./types`: `BlameResult`, `FileContent`, `TreeEntry`;
- in `Channels`, dopo `commitFileDiff`:

```ts
  blame: 'file:blame',
  treeList: 'file:tree',
  fileContent: 'file:content',
```

- in `Api`, dopo `commitFileDiff`:

```ts
  /** Blame di un file a un commit; sha null: il file sul disco. */
  blame(root: string, sha: string | null, path: string, ignoreWhitespace: boolean): Promise<Result<BlameResult>>
  /** Voci di una cartella a un commit; dir '' è la radice. */
  treeList(root: string, sha: string, dir: string): Promise<Result<TreeEntry[]>>
  /** Contenuto di un file a un commit; null se lì non c'è. */
  fileContent(root: string, sha: string, path: string, force: boolean): Promise<Result<FileContent | null>>
```

`src/preload/index.ts`, dopo `commitFileDiff`:

```ts
  blame: (root, sha, path, ignoreWhitespace) => ipcRenderer.invoke(Channels.blame, root, sha, path, ignoreWhitespace),
  treeList: (root, sha, dir) => ipcRenderer.invoke(Channels.treeList, root, sha, dir),
  fileContent: (root, sha, path, force) => ipcRenderer.invoke(Channels.fileContent, root, sha, path, force),
```

`src/main/ipc-handlers.ts`:
- import `readBlame` da `./git/blame` e `readFileContent`, `readTree` da `./git/tree`;
- dopo l'handler di `Channels.commitFileDiff`:

```ts
  // --- Blame e albero dei file ---
  ipcMain.handle(Channels.blame, (_e, root: unknown, commit: unknown, path: unknown, ignoreWhitespace: unknown) =>
    withSession(root, (s) => readBlame(s.runner, commit === null ? null : sha(commit), relPath(path), ignoreWhitespace === true)),
  )
  ipcMain.handle(Channels.treeList, (_e, root: unknown, commit: unknown, dir: unknown) =>
    withSession(root, (s) => readTree(s.runner, sha(commit), dir === '' ? '' : relPath(dir))),
  )
  ipcMain.handle(Channels.fileContent, (_e, root: unknown, commit: unknown, path: unknown, force: unknown) =>
    withSession(root, (s) => readFileContent(s.runner, sha(commit), relPath(path), force === true)),
  )
```

- [ ] **Step 4: l'E2E passa**

Run: `npm run typecheck && npx electron-vite build && npx playwright test test/e2e/files-api.spec.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/ipc-handlers.ts test/e2e/files-api.spec.ts
git commit -m "feat: canali IPC validati per blame, albero e contenuto dei file

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: albero dei file nel dettaglio del commit

**Files:**
- Create: `src/renderer/components/FileTree.vue`, `src/renderer/components/FileContentView.vue`
- Modify: `src/renderer/stores/repo.ts`, `src/renderer/components/CommitDetail.vue`, `src/renderer/components/AppIcon.vue`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/e2e/files.spec.ts`

**Interfaces:**
- Consumes: `window.api.treeList`, `window.api.fileContent` (Task 4).
- Produces, nello store `repo`:
  - `detailMode: 'changes' | 'tree'`, `setDetailMode(mode): Promise<void>`;
  - `treeDirs: Map<string, TreeEntry[]>` (shallowRef, sostituita a ogni modifica), `treeOpen: Set<string>` (reactive);
  - `treeFile: TreeEntry | null`, `fileContent: FileContent | null` (null anche quando il file scelto non c'è a quel commit);
  - `toggleTreeDir(dir: string)`, `selectTreeFile(entry: TreeEntry)`, `loadFileContent(force?: boolean)`;
  - icona `file` in `AppIcon.vue`.

- [ ] **Step 1: E2E che fallisce**

`test/e2e/files.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

/** Storia, dal più recente: solo file1, modifica app, aggiunge app, commit 1. */
function repoWithFiles(): string {
  const repo = makeRepo(1)
  mkdirSync(join(repo, 'src'))
  writeFileSync(join(repo, 'src/app.ts'), 'const a = 1\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'aggiunge app')
  writeFileSync(join(repo, 'src/app.ts'), 'const a = 1\nconst b = 2\n')
  writeFileSync(join(repo, 'file1.txt'), '1\nuno\n')
  git(repo, 'commit', '-q', '-am', 'modifica app')
  writeFileSync(join(repo, 'file1.txt'), '1\nuno\ndue\n')
  git(repo, 'commit', '-q', '-am', 'solo file1')
  return repo
}

test('albero dei file: cartelle, contenuto al commit scelto, ritorno alle modifiche', async () => {
  const { app, page } = await launch([repoWithFiles()])
  const rows = page.getByTestId('commit-row')
  await rows.filter({ hasText: 'modifica app' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await page.getByTestId('detail-tree').click()
  const tree = page.getByTestId('tree-row')
  await expect(tree).toHaveText(['src', /file1\.txt/])
  // Il file cambiato nel commit ha la lettera dello stato
  await expect(tree.filter({ hasText: 'file1.txt' }).locator('.status')).toHaveText('M')

  await tree.filter({ hasText: 'src' }).click()
  await tree.filter({ hasText: 'app.ts' }).click()
  const code = page.getByTestId('content-line').locator('code')
  await expect(code).toHaveText(['const a = 1', 'const b = 2'])

  // Cambiando commit restano la cartella aperta e il file scelto
  await rows.filter({ hasText: 'aggiunge app' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('aggiunge app')
  await expect(code).toHaveText(['const a = 1'])
  await expect(tree.filter({ hasText: 'app.ts' })).toHaveClass(/selected/)

  // Nel primo commit src non c'è: il pannello sotto resta vuoto
  await rows.filter({ hasText: 'commit 1' }).click()
  await expect(tree).toHaveText([/file1\.txt/])
  await expect(page.getByTestId('content-line')).toHaveCount(0)

  await page.getByTestId('detail-changes').click()
  await expect(page.getByTestId('file-row')).toHaveText([/file1\.txt/])
  await app.close()
})
```

- [ ] **Step 2: l'E2E fallisce**

Run: `npx electron-vite build && npx playwright test test/e2e/files.spec.ts`
Expected: FAIL, `detail-tree` non c'è.

- [ ] **Step 3: store**

`src/renderer/stores/repo.ts`:
- negli import dei tipi: `FileContent`, `TreeEntry`;
- dopo `let diffRequest = 0`:

```ts
    // Dettaglio del commit: i file cambiati o l'albero di tutti i file (la scelta resta cambiando commit)
    const detailMode = ref<'changes' | 'tree'>('changes')
    /** Cartelle dell'albero caricate per il commit selezionato: dal percorso ('' la radice) alle voci. */
    const treeDirs = shallowRef(new Map<string, TreeEntry[]>())
    /** Cartelle aperte: restano aperte cambiando commit. */
    const treeOpen = reactive(new Set<string>())
    const treeFile = shallowRef<TreeEntry | null>(null)
    /** null anche quando il file scelto non c'è nel commit selezionato. */
    const fileContent = shallowRef<FileContent | null>(null)
    let treeRequest = 0
    let contentRequest = 0
```

- in `select`, `await selectFile(r.value.files[0] ?? null)` diventa:

```ts
      selectedFile.value = r.value.files[0] ?? null
      await (detailMode.value === 'tree' ? loadTree() : loadDiff())
```

- dopo `loadDiff`:

```ts
    async function setDetailMode(mode: 'changes' | 'tree') {
      detailMode.value = mode
      await (mode === 'tree' ? loadTree() : loadDiff())
    }

    /** La radice e le cartelle aperte del commit selezionato, poi il contenuto del file scelto. */
    async function loadTree() {
      const sha = selected.value
      const request = ++treeRequest
      if (!sha) return
      const dirs = ['', ...treeOpen]
      const results = await Promise.all(dirs.map((dir) => window.api.treeList(root, sha, dir)))
      if (request !== treeRequest) return
      const loaded = new Map<string, TreeEntry[]>()
      results.forEach((r, i) => {
        if (r.ok) loaded.set(dirs[i], r.value)
        else error.value = r.error.message
      })
      treeDirs.value = loaded
      await loadFileContent()
    }

    async function toggleTreeDir(dir: string) {
      if (treeOpen.delete(dir)) return
      treeOpen.add(dir)
      const sha = selected.value
      if (!sha || treeDirs.value.has(dir)) return
      const r = await window.api.treeList(root, sha, dir)
      if (!r.ok) error.value = r.error.message
      else if (sha === selected.value) treeDirs.value = new Map(treeDirs.value).set(dir, r.value)
    }

    async function selectTreeFile(entry: TreeEntry) {
      treeFile.value = entry
      await loadFileContent()
    }

    async function loadFileContent(force = false) {
      const entry = treeFile.value
      const sha = selected.value
      const request = ++contentRequest
      if (!entry || !sha) {
        fileContent.value = null
        return
      }
      const r = await window.api.fileContent(root, sha, entry.path, force)
      if (request !== contentRequest) return
      if (r.ok) fileContent.value = r.value
      else error.value = r.error.message
    }
```

- nel `return`, dopo `toggleSplit, toggleWhitespace,`:

```ts
      detailMode, treeDirs, treeOpen, treeFile, fileContent, setDetailMode, toggleTreeDir, selectTreeFile, loadFileContent,
```

- [ ] **Step 4: icona, componenti e testi**

`src/renderer/components/AppIcon.vue`, in `ICONS` dopo `changes`:

```ts
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
```

`src/renderer/components/FileTree.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { TreeEntry } from '../../shared/types'
import { t } from '../i18n'
import { useRepoStore } from '../stores/repo'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

/** Lo stato dei file cambiati nel commit, per segnarli nell'albero. */
const changed = computed(() => new Map(repo.detail?.files.map((f) => [f.path, f.status])))

/** Le voci visibili: la radice e, dentro, le cartelle aperte e già caricate. */
const rows = computed(() => {
  const out: { entry: TreeEntry; depth: number }[] = []
  const walk = (dir: string, depth: number) => {
    for (const entry of repo.treeDirs.get(dir) ?? []) {
      out.push({ entry, depth })
      if (entry.kind === 'folder' && repo.treeOpen.has(entry.path)) walk(entry.path, depth + 1)
    }
  }
  walk('', 0)
  return out
})

function click(entry: TreeEntry) {
  if (entry.kind === 'folder') void repo.toggleTreeDir(entry.path)
  else void repo.selectTreeFile(entry)
}
</script>

<template>
  <ul class="tree" data-testid="file-tree">
    <li v-if="repo.treeDirs.has('') && !rows.length" class="muted">{{ t('tree.empty') }}</li>
    <li
      v-for="{ entry, depth } in rows"
      :key="entry.path"
      :class="{ selected: entry.kind !== 'folder' && entry.path === repo.treeFile?.path }"
      :style="{ paddingLeft: `${12 + depth * 14}px` }"
      :title="entry.path"
      data-testid="tree-row"
      @click="click(entry)"
    >
      <span class="slot"><AppIcon v-if="entry.kind === 'folder'" name="chevron" class="chevron" :class="{ open: repo.treeOpen.has(entry.path) }" /></span>
      <AppIcon :name="entry.kind !== 'folder' ? 'file' : repo.treeOpen.has(entry.path) ? 'folderOpen' : 'folder'" class="kind" />
      <span class="name">{{ entry.name }}</span>
      <span v-if="changed.get(entry.path)" class="status" :class="changed.get(entry.path)">{{ changed.get(entry.path) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.tree { margin: 0; padding: 4px 0; list-style: none; user-select: none; }
li { display: flex; align-items: center; gap: 5px; padding: 2px 12px; cursor: default; }
li:hover { background: var(--bg-hover); }
li.selected { background: var(--bg-hover); font-weight: 600; }
/* La freccia in uno spazio fisso, come nella sidebar: le icone di una stessa profondità restano allineate */
.slot { display: flex; justify-content: center; width: 12px; flex: none; }
.chevron { width: 10px; height: 10px; transition: transform 0.12s; }
.chevron.open { transform: rotate(90deg); }
.kind { color: var(--fg-muted); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { width: 14px; font-weight: 700; text-align: center; }
.status.A { color: #2da44e; }
.status.D { color: var(--danger); }
.status.M { color: #bf8700; }
.status.R, .status.C { color: #8250df; }
</style>
```

`src/renderer/components/FileContentView.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { FileContent } from '../../shared/types'
import { highlighter } from '../history/highlight'
import { t } from '../i18n'

const props = defineProps<{ path: string; content: FileContent }>()
const emit = defineEmits<{ force: [] }>()

const highlight = computed(() => highlighter(props.path))
// L'a capo finale non è una riga in più; un file vuoto non ha righe
const lines = computed(() => (props.content.text ? props.content.text.replace(/\n$/, '').split('\n') : []))
</script>

<template>
  <div class="content">
    <p v-if="content.binary" class="note muted">{{ t('diff.binary') }}</p>
    <p v-else-if="content.tooLarge" class="note">
      {{ t('file.tooLarge') }}
      <button @click="emit('force')">{{ t('diff.showAnyway') }}</button>
    </p>
    <template v-else>
      <div v-for="(text, i) in lines" :key="i" class="line" data-testid="content-line">
        <span class="no">{{ i + 1 }}</span>
        <!-- highlight.js e escapeHtml restituiscono HTML già sicuro -->
        <code v-html="highlight(text)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.content { flex: 1; min-height: 0; overflow: auto; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: var(--code-size, 12px); tab-size: var(--tab-size, 4); }
.note { padding: 12px; font-family: system-ui, sans-serif; }
.line { display: grid; grid-template-columns: 44px 1fr; line-height: 18px; content-visibility: auto; contain-intrinsic-size: auto 18px; }
.line code { white-space: pre; font-size: inherit; }
.no { padding-right: 8px; color: var(--fg-muted); text-align: right; user-select: none; }
</style>
```

`src/renderer/components/CommitDetail.vue`:
- import `FileContentView` e `FileTree`;
- fra `</header>` e `<ul class="files"`:

```vue
      <div class="mode">
        <button :aria-pressed="repo.detailMode === 'changes'" data-testid="detail-changes" @click="repo.setDetailMode('changes')">
          {{ t('detail.changes') }}
        </button>
        <button :aria-pressed="repo.detailMode === 'tree'" data-testid="detail-tree" @click="repo.setDetailMode('tree')">
          {{ t('detail.allFiles') }}
        </button>
      </div>
```

- `<ul class="files"` prende `v-if="repo.detailMode === 'changes'"`, e subito dopo il suo `</ul>`:

```vue
      <FileTree v-else :root="root" class="files" :style="{ height: `${layout.commitFiles}px` }" />
```

- `<div class="diff-area">` prende `v-if="repo.detailMode === 'changes'"`, e subito dopo il suo `</div>`:

```vue
      <div v-else class="diff-area">
        <template v-if="repo.treeFile && repo.fileContent">
          <div class="diff-bar">
            <span class="path muted">{{ repo.treeFile.path }}</span>
          </div>
          <FileContentView :path="repo.treeFile.path" :content="repo.fileContent" @force="repo.loadFileContent(true)" />
        </template>
      </div>
```

- negli stili:

```css
.mode { display: flex; gap: 0; padding: 6px 12px 2px; }
.mode button { padding: 1px 10px; font-size: 12px; border-radius: 0; }
.mode button:first-child { border-radius: 5px 0 0 5px; }
.mode button:last-child { border-radius: 0 5px 5px 0; border-left: 0; }
.mode button[aria-pressed='true'] { background: var(--selected-bg); font-weight: 600; }
```

`src/shared/i18n/en.ts`, in fondo:

```ts
  'detail.changes': 'Changes',
  'detail.allFiles': 'All Files',
  'tree.empty': 'No files',
  'file.tooLarge': 'File too large.',
```

`src/shared/i18n/it.ts`, in fondo:

```ts
  'detail.changes': 'Modifiche',
  'detail.allFiles': 'Tutti i file',
  'tree.empty': 'Nessun file',
  'file.tooLarge': 'File troppo grande.',
```

- [ ] **Step 5: l'E2E passa**

Run: `npm run typecheck && npm run lint && npx electron-vite build && npx playwright test test/e2e/files.spec.ts test/e2e/history.spec.ts`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/renderer src/shared/i18n test/e2e/files.spec.ts
git commit -m "feat: albero di tutti i file nel dettaglio del commit, con il contenuto del file scelto

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: storia del file e blame

**Files:**
- Create: `src/renderer/actions/files.ts`, `src/renderer/components/BlameDialog.vue`
- Modify: `src/renderer/stores/repo.ts`, `src/renderer/components/HistoryView.vue`, `src/renderer/components/CommitDetail.vue`, `src/renderer/components/FileTree.vue`, `src/renderer/components/WorkingView.vue`, `src/renderer/components/RepoView.vue`, `src/renderer/App.vue`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/e2e/files.spec.ts`

**Interfaces:**
- Consumes: `window.api.blame` (Task 4); `searchArgs`, `matchesPath` (Task 1); lo store dell'albero (Task 5); `popup` da `src/renderer/actions/branches.ts`; `chooseNextMenuItem` da `test/e2e/menu.ts`.
- Produces:
  - nello store `repo`: `blame: BlameTarget | null` (il popup è aperto quando non è null), `showFileHistory(path: string): Promise<void>`; tipo esportato `BlameTarget = { sha: string | null; path: string }`;
  - in `src/renderer/actions/files.ts`: `FileTarget`, `commitFileTarget`, `treeFileTarget`, `workingFileTarget`, `selectedFileTarget`, `openBlame`, `fileMenu`, `registerFileActions`.

- [ ] **Step 1: E2E che falliscono**

In `test/e2e/files.spec.ts`, import `import { chooseNextMenuItem } from './menu'` e in fondo:

```ts
test('blame dal menu di un file: blocchi, commit scelto, prima di questo commit, indietro, mostra commit', async () => {
  const repo = repoWithFiles()
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-message')).toContainText('solo file1')
  await chooseNextMenuItem(app, 'Blame')
  await page.getByTestId('file-row').filter({ hasText: 'file1.txt' }).click({ button: 'right' })
  const dialog = page.getByTestId('blame-dialog')
  await expect(dialog.getByTestId('blame-path')).toHaveText('file1.txt')
  await expect(dialog.getByTestId('blame-revision')).toHaveText(git(repo, 'rev-parse', '--short=7', 'HEAD').trim())
  const lines = dialog.getByTestId('blame-line')
  await expect(lines.locator('.text')).toHaveText(['1', 'uno', 'due'])
  // Ogni riga viene da un commit diverso: tre blocchi
  await expect(dialog.locator('.line.first')).toHaveCount(3)

  await lines.nth(1).getByTestId('blame-commit').click()
  await expect(dialog.getByTestId('blame-picked')).toContainText('modifica app')
  await expect(lines.nth(1)).toHaveClass(/picked/)
  // Prima di "modifica app" il file aveva una riga sola
  await dialog.getByTestId('blame-parent').click()
  await expect(lines.locator('.text')).toHaveText(['1'])
  await expect(dialog.getByTestId('blame-revision')).toHaveText(git(repo, 'rev-parse', '--short=7', 'HEAD~2').trim())
  await dialog.getByTestId('blame-back').click()
  await expect(lines.locator('.text')).toHaveText(['1', 'uno', 'due'])

  await lines.nth(1).getByTestId('blame-commit').click()
  await dialog.getByTestId('blame-show-commit').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await app.close()
})

test('storia del file dal menu: ricerca path:, solo i suoi commit, file preselezionato', async () => {
  const { app, page } = await launch([repoWithFiles()])
  await page.getByTestId('commit-row').filter({ hasText: 'modifica app' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await chooseNextMenuItem(app, 'File History')
  await page.getByTestId('file-row').filter({ hasText: 'src/app.ts' }).click({ button: 'right' })
  const search = page.getByTestId('history-search')
  await expect(search).toHaveValue('path:"src/app.ts"')
  const rows = page.getByTestId('commit-row')
  await expect(rows).toHaveText([/modifica app/, /aggiunge app/])
  // Il commit più recente, con il file già selezionato (non file1.txt, che nella lista viene prima)
  await expect(page.getByTestId('commit-message')).toContainText('modifica app')
  await expect(page.locator('[data-testid="file-row"].selected')).toContainText('src/app.ts')
  await search.press('Escape')
  await expect(rows).toHaveCount(4)
  await app.close()
})

test('blame dalle modifiche locali e dall albero: riga non ancora nel commit, pulsante Blame', async () => {
  const repo = repoWithFiles()
  writeFileSync(join(repo, 'file1.txt'), '1\nuno\ndue\ntre\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('page-working').click()
  await chooseNextMenuItem(app, 'Blame')
  await page.getByTestId('working-file').filter({ hasText: 'file1.txt' }).click({ button: 'right' })
  const dialog = page.getByTestId('blame-dialog')
  await expect(dialog.getByTestId('blame-revision')).toHaveText('Local version')
  await expect(dialog.getByTestId('blame-line').last()).toContainText('Not committed yet')
  await dialog.getByTestId('blame-close').click()
  await expect(dialog).toBeHidden()

  await page.getByTestId('page-history').click()
  await page.getByTestId('detail-tree').click()
  await page.getByTestId('tree-row').filter({ hasText: 'file1.txt' }).click()
  await page.getByTestId('file-blame').click()
  await expect(dialog.getByTestId('blame-revision')).toHaveText(git(repo, 'rev-parse', '--short=7', 'HEAD').trim())
  await expect(dialog.getByTestId('blame-line')).toHaveCount(3)
  await app.close()
})
```

- [ ] **Step 2: gli E2E falliscono**

Run: `npx electron-vite build && npx playwright test test/e2e/files.spec.ts`
Expected: FAIL nei tre test nuovi (voce di menu non trovata: Blame).

- [ ] **Step 3: store e ricerca**

`src/renderer/stores/repo.ts`:
- `import { matchesPath, searchArgs } from '../../shared/search'`;
- dopo `export const PAGE_SIZE = 500`:

```ts
/** Il file del popup del blame: a un commit, o sul disco con sha null. */
export interface BlameTarget {
  sha: string | null
  path: string
}
```

- dopo `let contentRequest = 0`:

```ts
    /** Il file nel popup del blame; null = chiuso. */
    const blame = shallowRef<BlameTarget | null>(null)
```

- in `select`, `selectedFile.value = r.value.files[0] ?? null` diventa:

```ts
      // Con i filtri path: della ricerca (anche nella storia di un file) il primo file che ci rientra
      const paths = searchArgs(query.value).paths
      selectedFile.value = r.value.files.find((f) => matchesPath(f.path, paths)) ?? r.value.files[0] ?? null
```

- dopo `search`:

```ts
    /** La storia di un file: la ricerca path:, con il suo commit più recente. */
    async function showFileHistory(path: string) {
      page.value = 'history'
      await search(`path:"${path}"`)
      const first = commitAt(0)
      if (first) await select(first.sha, 0)
    }
```

- nel `return`, dopo `loadFileContent,`: `blame, showFileHistory,`.

`src/renderer/components/HistoryView.vue`: `import { ref, watch } from 'vue'` e dopo `const text = ref(repo.query)`:

```ts
// La ricerca può cambiare anche da fuori (Storia del file)
watch(() => repo.query, (q) => (text.value = q))
```

- [ ] **Step 4: azioni dei file**

`src/renderer/actions/files.ts`:

```ts
import type { FileChange, TreeEntry, WorkingFile } from '../../shared/types'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { popup } from './branches'
import { registry } from './builtin'

type Repo = ReturnType<typeof useRepoStore>

/** Un file di cui chiedere storia e blame: a un commit, o sul disco con sha null. */
export interface FileTarget {
  path: string
  sha: string | null
  history: boolean
  blame: boolean
}

export const commitFileTarget = (sha: string, f: FileChange): FileTarget => ({ path: f.path, sha, history: true, blame: f.status !== 'D' })

export const treeFileTarget = (sha: string, e: TreeEntry): FileTarget => ({ path: e.path, sha, history: true, blame: e.kind === 'file' })

/** Un file non tracciato non ha storia; uno nuovo o cancellato non ha righe da attribuire. */
export const workingFileTarget = (f: WorkingFile): FileTarget => ({
  path: f.path,
  sha: null,
  history: f.status !== '?',
  blame: f.status !== '?' && f.status !== 'A' && f.status !== 'D',
})

/** Il file mostrato a destra nella storia: diff del commit, contenuto dell'albero o modifiche locali. */
export function selectedFileTarget(repo: Repo): FileTarget | null {
  if (repo.page !== 'history') return null
  if (repo.view === 'working') return repo.working ? workingFileTarget(repo.working.file) : null
  const sha = repo.selected
  if (!sha) return null
  if (repo.detailMode === 'tree') return repo.treeFile && repo.fileContent ? treeFileTarget(sha, repo.treeFile) : null
  return repo.selectedFile ? commitFileTarget(sha, repo.selectedFile) : null
}

export function openBlame(repo: Repo, target: FileTarget | null) {
  if (target?.blame) repo.blame = { sha: target.sha, path: target.path }
}

export function fileMenu(repo: Repo, target: FileTarget) {
  return popup([
    { label: t('file.history'), enabled: target.history, run: () => repo.showFileHistory(target.path) },
    { label: t('file.blame'), enabled: target.blame, run: () => openBlame(repo, target) },
  ])
}

/** Storia e blame del file selezionato, nella tab attiva. */
export function registerFileActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const target = () => {
    const r = repo()
    return r ? selectedFileTarget(r) : null
  }

  registry.register(
    {
      id: 'file.history',
      get title() { return t('action.file.history') },
      when: () => target()?.history === true,
      run: () => {
        const x = target()
        if (x) return repo()?.showFileHistory(x.path)
      },
    },
    {
      id: 'file.blame',
      get title() { return t('action.file.blame') },
      when: () => target()?.blame === true,
      run: () => {
        const r = repo()
        if (r) openBlame(r, selectedFileTarget(r))
      },
    },
  )
}
```

`src/renderer/App.vue`: import `registerFileActions` da `./actions/files` e chiamarla dopo `registerFlowActions()`.

- [ ] **Step 5: popup del blame**

`src/renderer/components/BlameDialog.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { BlameCommit, BlameResult } from '../../shared/types'
import { formatDate, formatShortDate } from '../history/format'
import { highlighter } from '../history/highlight'
import { t } from '../i18n'
import { useLayout } from '../layout'
import { type BlameTarget, useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const layout = useLayout()
const dialog = ref<HTMLDialogElement | null>(null)

/** Le revisioni viste, l'ultima in fondo: ← torna alla precedente. Il popup è montato solo con repo.blame impostato. */
const stack = ref<BlameTarget[]>(repo.blame ? [repo.blame] : [])
const current = computed(() => stack.value[stack.value.length - 1])
const ignoreWhitespace = ref(repo.diffOptions.ignoreWhitespace)
const result = shallowRef<BlameResult | null>(null)
const failure = ref<string | null>(null)
/** Il commit scelto con un clic sulla colonna. */
const picked = ref<string | null>(null)
let request = 0

/** Lo SHA di zeri: righe non ancora nel commit. */
const isLocal = (sha: string) => /^0+$/.test(sha)

async function load() {
  const target = current.value
  if (!target) return
  const id = ++request
  result.value = null
  failure.value = null
  picked.value = null
  const r = await window.api.blame(props.root, target.sha, target.path, ignoreWhitespace.value)
  if (id !== request) return
  if (r.ok) result.value = r.value
  else failure.value = r.error.message
}

const highlight = computed(() => highlighter(current.value?.path ?? ''))
const rows = computed(() => {
  const b = result.value
  if (!b) return []
  return b.lines.map((line, i) => ({
    no: i + 1,
    text: line.text,
    commit: b.commits[line.sha],
    /** Prima riga di un blocco: righe consecutive dello stesso commit. */
    first: i === 0 || b.lines[i - 1]?.sha !== line.sha,
  }))
})
const pickedCommit = computed(() => (picked.value ? result.value?.commits[picked.value] : undefined))

const tooltip = (c: BlameCommit) => (isLocal(c.sha) ? t('blame.notCommitted') : `${c.summary}\n${c.author} · ${formatDate(c.authorTime)}`)

function go(target: BlameTarget) {
  stack.value = [...stack.value, target]
  void load()
}

function back() {
  stack.value = stack.value.slice(0, -1)
  void load()
}

function close() {
  repo.blame = null
}

function showCommit(sha: string) {
  close()
  repo.page = 'history'
  void repo.select(sha)
}

onMounted(() => {
  const el = dialog.value
  if (!el) return
  // Stessa misura e posizione del popup del diff
  const width = Math.min(layout.dialog?.width ?? window.innerWidth * 0.85, window.innerWidth - 16)
  const height = Math.min(layout.dialog?.height ?? window.innerHeight * 0.85, window.innerHeight - 16)
  Object.assign(el.style, {
    width: `${width}px`,
    height: `${height}px`,
    left: `${(window.innerWidth - width) / 2}px`,
    top: `${(window.innerHeight - height) / 2}px`,
  })
  el.showModal()
  el.focus()
  void load()
})

onBeforeUnmount(() => {
  const el = dialog.value
  if (el) layout.dialog = { width: el.offsetWidth, height: el.offsetHeight }
  repo.blame = null
})
</script>

<template>
  <dialog ref="dialog" class="blame-dialog" data-testid="blame-dialog" tabindex="-1" @cancel.prevent="close">
    <header class="bar">
      <button data-testid="blame-back" :aria-label="t('blame.back')" :title="t('blame.back')" :disabled="stack.length < 2" @click="back">←</button>
      <strong class="path" data-testid="blame-path">{{ current?.path }}</strong>
      <code class="muted" data-testid="blame-revision">{{ current?.sha ? current.sha.slice(0, 7) : t('blame.localVersion') }}</code>
      <span class="spacer" />
      <label>
        <input v-model="ignoreWhitespace" type="checkbox" data-testid="blame-whitespace" @change="load" />
        {{ t('diff.ignoreWhitespace') }}
      </label>
      <button class="close" data-testid="blame-close" :aria-label="t('common.close')" @click="close">×</button>
    </header>
    <p v-if="failure" class="note error">{{ failure }}</p>
    <p v-else-if="!result" class="note muted">{{ t('blame.loading') }}</p>
    <p v-else-if="result.binary" class="note muted">{{ t('diff.binary') }}</p>
    <div v-else class="lines">
      <div
        v-for="row in rows"
        :key="row.no"
        class="line"
        :class="{ first: row.first, picked: !!row.commit && row.commit.sha === picked }"
        data-testid="blame-line"
      >
        <span class="who" :title="row.commit && tooltip(row.commit)" data-testid="blame-commit" @click="picked = row.commit?.sha ?? null">
          <template v-if="row.first && row.commit">
            <template v-if="isLocal(row.commit.sha)">{{ t('blame.notCommitted') }}</template>
            <template v-else>
              <code>{{ row.commit.sha.slice(0, 7) }}</code>
              <span class="author">{{ row.commit.author }}</span>
              <span class="date">{{ formatShortDate(row.commit.authorTime) }}</span>
            </template>
          </template>
        </span>
        <span class="no">{{ row.no }}</span>
        <!-- highlight.js e escapeHtml restituiscono HTML già sicuro -->
        <code class="text" v-html="highlight(row.text)" />
      </div>
    </div>
    <footer v-if="pickedCommit" class="commit" data-testid="blame-picked">
      <div class="info">
        <template v-if="isLocal(pickedCommit.sha)">
          <strong>{{ t('blame.notCommitted') }}</strong>
        </template>
        <template v-else>
          <strong>{{ pickedCommit.summary }}</strong>
          <span class="muted">{{ pickedCommit.author }} &lt;{{ pickedCommit.authorEmail }}&gt; · {{ formatDate(pickedCommit.authorTime) }}</span>
          <code class="muted">{{ pickedCommit.sha }}</code>
        </template>
      </div>
      <button data-testid="blame-show-commit" :disabled="isLocal(pickedCommit.sha)" @click="showCommit(pickedCommit.sha)">{{ t('blame.showCommit') }}</button>
      <button data-testid="blame-parent" :disabled="!pickedCommit.previous" @click="pickedCommit.previous && go(pickedCommit.previous)">
        {{ t('blame.parent') }}
      </button>
    </footer>
  </dialog>
</template>

<style scoped>
/* Misura e posizione in px (onMounted), come il popup del diff; resize: both dall'angolo in basso a destra */
.blame-dialog { inset: auto; margin: 0; padding: 0; max-width: none; max-height: none; min-width: 480px; min-height: 300px; overflow: hidden; resize: both; }
.blame-dialog[open] { display: flex; flex-direction: column; }
.blame-dialog:focus { outline: none; }
.bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 12px; }
.bar button { padding: 1px 8px; font-size: 12px; }
.path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.close { border: 0; background: transparent; font-size: 16px; }
.note { padding: 12px; }
.lines { flex: 1; min-height: 0; overflow: auto; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: var(--code-size, 12px); tab-size: var(--tab-size, 4); }
.line { display: grid; grid-template-columns: 230px 44px 1fr; line-height: 18px; content-visibility: auto; contain-intrinsic-size: auto 18px; }
.line.first:not(:first-child) { border-top: 1px solid var(--border); }
.line.picked { background: var(--selected-bg); }
.who { display: flex; gap: 6px; min-width: 0; padding: 0 8px; overflow: hidden; white-space: nowrap; background: var(--bg-alt); color: var(--fg-muted); font-family: system-ui, sans-serif; font-size: 11px; cursor: pointer; }
.who code { font-size: 11px; }
.author { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.date { font-variant-numeric: tabular-nums; }
.no { padding-right: 8px; color: var(--fg-muted); text-align: right; user-select: none; }
.text { white-space: pre; font-size: inherit; }
.commit { display: flex; align-items: center; gap: 8px; justify-content: flex-start; margin: 0; padding: 8px 10px; border-top: 1px solid var(--border); font-size: 12px; }
.commit button { padding: 2px 10px; font-size: 12px; }
.info { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.info > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
```

`src/renderer/components/RepoView.vue`: import `BlameDialog` e dopo `<DiffDialog …/>`:

```vue
    <BlameDialog v-if="repo.blame" :root="root" />
```

- [ ] **Step 6: menu e pulsanti Blame**

`src/renderer/components/CommitDetail.vue`:
- `import { commitFileTarget, fileMenu, openBlame, selectedFileTarget } from '../actions/files'` e `import type { FileChange } from '../../shared/types'`;
- nello script:

```ts
const target = computed(() => selectedFileTarget(repo))

function menu(f: FileChange) {
  if (!commit.value) return
  void repo.selectFile(f)
  void fileMenu(repo, commitFileTarget(commit.value.sha, f))
}
```

- sui `<li>` dei file cambiati: `@contextmenu.prevent="menu(f)"`;
- nella barra del diff, dopo il pulsante `diff-popup`, e nella barra del contenuto dell'albero, dopo il percorso:

```vue
          <button data-testid="file-blame" :disabled="!target?.blame" @click="openBlame(repo, target)">Blame</button>
```

`src/renderer/components/FileTree.vue`:
- `import { fileMenu, treeFileTarget } from '../actions/files'`;
- nello script:

```ts
function menu(entry: TreeEntry) {
  if (entry.kind === 'folder' || !repo.selected) return
  void repo.selectTreeFile(entry)
  void fileMenu(repo, treeFileTarget(repo.selected, entry))
}
```

- sui `<li>`: `@contextmenu.prevent="menu(entry)"`.

`src/renderer/components/WorkingView.vue`:
- `import { fileMenu, openBlame, workingFileTarget } from '../actions/files'`;
- nello script:

```ts
function menu(file: WorkingFile, area: WorkingArea) {
  void repo.selectWorkingFile(file, area)
  void fileMenu(repo, workingFileTarget(file))
}
```

- sui `<li>` dei file: `@contextmenu.prevent="menu(f, section.area)"`;
- nella barra del diff, dopo il pulsante `diff-popup`:

```vue
          <button
            data-testid="file-blame"
            :disabled="!workingFileTarget(repo.working.file).blame"
            @click="openBlame(repo, workingFileTarget(repo.working.file))"
          >Blame</button>
```

- [ ] **Step 7: testi**

`src/shared/i18n/en.ts`, in fondo:

```ts
  'file.history': 'File History',
  'file.blame': 'Blame',
  'action.file.history': 'Show File History',
  'action.file.blame': 'Blame File',
  'blame.back': 'Back',
  'blame.localVersion': 'Local version',
  'blame.notCommitted': 'Not committed yet',
  'blame.loading': 'Loading…',
  'blame.showCommit': 'Show Commit',
  'blame.parent': 'Blame Before This Commit',
```

`src/shared/i18n/it.ts`, in fondo:

```ts
  'file.history': 'Storia del file',
  'file.blame': 'Blame',
  'action.file.history': 'Mostra storia del file',
  'action.file.blame': 'Blame del file',
  'blame.back': 'Indietro',
  'blame.localVersion': 'Versione locale',
  'blame.notCommitted': 'Non ancora nel commit',
  'blame.loading': 'Caricamento…',
  'blame.showCommit': 'Mostra commit',
  'blame.parent': 'Blame prima di questo commit',
```

- [ ] **Step 8: gli E2E passano**

Run: `npm run typecheck && npm run lint && npm test && npx electron-vite build && npx playwright test test/e2e/files.spec.ts test/e2e/history.spec.ts test/e2e/working.spec.ts`
Expected: PASS.

- [ ] **Step 9: commit**

```bash
git add src/renderer src/shared/i18n test/e2e/files.spec.ts
git commit -m "feat: storia del file e blame dal menu dei file, dalla palette e dal pulsante Blame

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: README e verifica completa

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

- Nella tabella "What you get", riga History, dopo "an option to ignore whitespace": `. Blame of any file, at a commit or on disk, with the commit of each block and blame before a change. File history from any file. The tree of all files at any commit, with their content`.
- Roadmap: `- [ ] Blame, file history and a tree view of the repository` diventa `- [x] …`.

- [ ] **Step 2: verifica completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde.

- [ ] **Step 3: nomi fittizi**

Rileggere `git log -p develop..HEAD`: solo nomi inventati (repo generati, Ada Lovelace, `example.com`), nessun riferimento a persone, aziende o progetti reali.

- [ ] **Step 4: commit**

```bash
git add README.md
git commit -m "docs: blame, storia del file e albero dei file nel README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
