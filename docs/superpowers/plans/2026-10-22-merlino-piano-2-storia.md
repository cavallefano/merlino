# Merlino — Piano 2: Storia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al centro della tab di un repo c'è la storia completa: il grafo dei commit di tutti i ref, con etichette di branch e tag, fluido anche oltre 100.000 commit. Si cerca con i prefissi `author:`, `path:`, `message:` e `contents:`. A destra c'è il dettaglio del commit selezionato: messaggio, autore, SHA copiabile, genitori cliccabili e file cambiati. Il diff di ogni file si vede unificato o affiancato, con sintassi e parole cambiate evidenziate.

**Architecture:**
- **Main**: esegue `git log` una sola volta per ogni stato dei ref, dove lo stato è un hash di `for-each-ref`, HEAD e ricerca. Tiene in memoria commit e disposizione del grafo e li dà al renderer a pagine da 500 righe. Dettaglio del commit e diff di un file si leggono su richiesta.
- **Renderer**: lista virtuale, cioè disegna solo le righe visibili; il grafo è un `<canvas>` che copre solo quelle righe.

**Tech Stack:** quello del piano 1, più highlight.js 11.12 e jsdiff (`diff`) 9.0.

Spec: `docs/superpowers/specs/2026-10-22-merlino-v1-design.md`, parte 2. Parte dal branch `feature/piano-1-base`.

## Global Constraints

Valgono tutte quelle del piano 1, più:
- **Log**: `--exclude=refs/stash --all --date-order -z --decorate=full`. Ogni commit ha 10 campi separati da NUL e ogni record è chiuso da un NUL (verificato).
- **Merge**: diff e file cambiati si calcolano rispetto al primo genitore (`--diff-merges=first-parent`).
- **Limiti del diff**: 5 MB o 20.000 righe; oltre, si mostra "Diff troppo grande — mostra comunque".
- **SHA dal renderer**: solo `/^[0-9a-f]{4,64}$/i`. Senza questo controllo, un argomento come `--output=…` arriverebbe a git.
- **Selezione**: si salva per SHA e non per posizione.
- **Ricerca**: niente grafo durante una ricerca (`lanes: 0`).

## Struttura dei file

```
src/shared/types.ts            + Commit, CommitRef, GraphRow, GraphEdge, HistorySummary, HistoryPage,
                                 FileStatus, FileChange, CommitDetail, DiffLine, Hunk, FileDiff, DiffOptions
src/shared/ipc.ts              + historyLoad, historyPage, commitDetail, commitFileDiff
src/shared/shortcuts.ts        + history.search
src/main/git/log.ts            formato e parser di git log (+ decorazioni)
src/main/git/search.ts         ricerca → opzioni di git log
src/main/git/graph.ts          disposizione del grafo
src/main/git/commit.ts         dettaglio del commit (name-status + numstat)
src/main/git/diff.ts           parser del diff unificato e limiti
src/main/history.ts            storia in memoria con versione
src/main/repo-session.ts       + history
src/main/ipc-handlers.ts       + handler e validazione degli argomenti
src/preload/index.ts           + nuove operazioni
src/main/menu.ts               + Vista → Cerca nella storia
src/renderer/history/          graph-draw.ts, diff-model.ts, highlight.ts, format.ts
src/renderer/stores/repo.ts    + storia a pagine, selezione, dettaglio, diff
src/renderer/actions/history.ts  azioni: cerca, copia SHA/messaggio, opzioni del diff
src/renderer/components/       HistoryView, CommitList, CommitDetail, DiffView, RepoView (layout a due colonne)
scripts/make-big-repo.mjs      repo di prova con 100.000 commit (fast-import)
test/unit/                     log, search, graph, commit-parse, diff-parse, diff-model
test/integration/              history, commit-detail, file-diff, history-perf (con MERLINO_PERF=1)
test/e2e/                      history-api.spec.ts, history.spec.ts
```

---

### Task 1: Tipi, parser del log e ricerca

**Files:**
- Modify: `src/shared/types.ts` (aggiunte in fondo)
- Create: `src/main/git/log.ts`, `src/main/git/search.ts`
- Test: `test/unit/log.test.ts`, `test/unit/search.test.ts`

**Interfaces:**
- Produces:
  - i tipi elencati sotto;
  - `LOG_FORMAT`, `parseLog(out: string): Commit[]` e `parseDecoration(d: string): CommitRef[]`;
  - `searchArgs(query: string): { args: string[]; paths: string[] }`.

- [ ] **Step 1: Aggiungi i tipi in fondo a `src/shared/types.ts`**

```ts
export interface CommitRef {
  kind: 'head' | 'branch' | 'remote' | 'tag'
  /** Nome breve: main, origin/main, v1.0 */
  name: string
  /** true per il branch su cui è HEAD (e per HEAD staccato). */
  current: boolean
}

export interface Commit {
  sha: string
  parents: string[]
  author: string
  authorEmail: string
  /** Secondi dall'epoch. */
  authorTime: number
  committer: string
  committerEmail: string
  commitTime: number
  subject: string
  refs: CommitRef[]
}

/** Segmento del grafo dalla riga precedente (colonna from) a questa riga (colonna to). */
export interface GraphEdge {
  from: number
  to: number
}

export interface GraphRow {
  /** Colonna del nodo. */
  lane: number
  up: GraphEdge[]
}

export interface HistorySummary {
  /** Cambia quando cambiano ref, HEAD o ricerca: il renderer scarta le pagine vecchie. */
  version: number
  total: number
  /** Colonne del grafo; 0 durante una ricerca (niente grafo). */
  lanes: number
}

export interface HistoryPage {
  version: number
  commits: Commit[]
  rows: GraphRow[]
}

export type FileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U'

export interface FileChange {
  path: string
  /** Solo per rinomine e copie. */
  oldPath?: string
  status: FileStatus
  /** null per i file binari. */
  added: number | null
  deleted: number | null
}

export interface CommitDetail {
  commit: Commit
  /** Messaggio completo (oggetto e corpo). */
  message: string
  files: FileChange[]
}

export interface DiffLine {
  type: 'context' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
}

export interface Hunk {
  /** La riga @@ … @@. */
  header: string
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  oldPath?: string
  binary: boolean
  /** Oltre i limiti: hunks vuoti finché non si chiede force. */
  tooLarge: boolean
  hunks: Hunk[]
}

export interface DiffOptions {
  ignoreWhitespace: boolean
  /** Mostra anche se supera i limiti. */
  force: boolean
}
```

- [ ] **Step 2: Scrivi i test che falliscono**

`test/unit/log.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseDecoration, parseLog } from '../../src/main/git/log'

const record = (...fields: string[]) => fields.join('\0')

describe('parseLog', () => {
  it('legge i 10 campi di ogni commit, con NUL finale', () => {
    const out =
      [
        record('aaa', 'bbb ccc', 'Ann', 'ann@x', '100', 'Bob', 'bob@x', '200', 'merge, feat', 'HEAD -> refs/heads/main, tag: refs/tags/v1'),
        record('bbb', '', 'Ann', 'ann@x', '50', 'Ann', 'ann@x', '50', 'primo', ''),
      ].join('\0') + '\0'
    const [merge, root] = parseLog(out)
    expect(merge).toEqual({
      sha: 'aaa',
      parents: ['bbb', 'ccc'],
      author: 'Ann',
      authorEmail: 'ann@x',
      authorTime: 100,
      committer: 'Bob',
      committerEmail: 'bob@x',
      commitTime: 200,
      subject: 'merge, feat',
      refs: [
        { kind: 'branch', name: 'main', current: true },
        { kind: 'tag', name: 'v1', current: false },
      ],
    })
    expect(root.parents).toEqual([])
    expect(root.refs).toEqual([])
    expect(parseLog('')).toEqual([])
  })
})

describe('parseDecoration', () => {
  it('distingue branch, remote, tag e HEAD staccato; nasconde origin/HEAD', () => {
    expect(parseDecoration('refs/remotes/origin/main, refs/remotes/origin/HEAD, refs/heads/feature/x')).toEqual([
      { kind: 'remote', name: 'origin/main', current: false },
      { kind: 'branch', name: 'feature/x', current: false },
    ])
    expect(parseDecoration('HEAD')).toEqual([{ kind: 'head', name: 'HEAD', current: true }])
  })
})
```

`test/unit/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { searchArgs } from '../../src/main/git/search'

const FLAGS = ['--all-match', '-i', '-F']

describe('searchArgs', () => {
  it('vuota: nessuna opzione', () => {
    expect(searchArgs('  ')).toEqual({ args: [], paths: [] })
  })

  it('testo senza prefisso cerca nel messaggio, ogni parola in AND', () => {
    expect(searchArgs('fix login')).toEqual({ args: ['--grep=fix', '--grep=login', ...FLAGS], paths: [] })
  })

  it('prefissi e virgolette', () => {
    expect(searchArgs('author:mario message:"login page" contents:TODO path:src/app.ts')).toEqual({
      args: ['--author=mario', '--grep=login page', '-STODO', ...FLAGS],
      paths: ['src/app.ts'],
    })
  })

  it('solo percorsi: nessuna opzione di ricerca', () => {
    expect(searchArgs('path:a path:b')).toEqual({ args: [], paths: ['a', 'b'] })
  })
})
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit/log.test.ts test/unit/search.test.ts`
Expected: FAIL, perché i moduli non esistono.

- [ ] **Step 4: Implementa**

`src/main/git/log.ts`:
```ts
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
```

`src/main/git/search.ts`:
```ts
const PREFIX = /^(author|path|message|contents):(.*)$/s

/**
 * Ricerca dell'utente → opzioni di git log. Prefissi: author:, path:, message:, contents:.
 * Il testo senza prefisso cerca nel messaggio; i valori tra virgolette possono contenere spazi.
 */
export function searchArgs(query: string): { args: string[]; paths: string[] } {
  const args: string[] = []
  const paths: string[] = []
  for (const token of query.match(/(?:\w+:)?(?:"[^"]*"|\S+)/g) ?? []) {
    const m = PREFIX.exec(token)
    const key = m ? m[1] : 'message'
    const value = unquote(m ? m[2] : token)
    if (!value) continue
    if (key === 'path') paths.push(value)
    else if (key === 'author') args.push(`--author=${value}`)
    else if (key === 'contents') args.push(`-S${value}`)
    else args.push(`--grep=${value}`)
  }
  // Tutte le condizioni in AND, maiuscole ignorate, testo letterale (non regex)
  if (args.length) args.push('--all-match', '-i', '-F')
  return { args, paths }
}

const unquote = (s: string) => s.replace(/^"(.*)"$/s, '$1')
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit/log.test.ts test/unit/search.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 6: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: parser di git log e ricerca con prefissi" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Disposizione del grafo

**Files:**
- Create: `src/main/git/graph.ts`
- Test: `test/unit/graph.test.ts`

**Interfaces:**
- Consumes: `GraphRow` e `GraphEdge` (Task 1).
- Produces: `layoutGraph(commits: { sha: string; parents: string[] }[]): { rows: GraphRow[]; lanes: number }`.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/unit/graph.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { layoutGraph } from '../../src/main/git/graph'

const c = (sha: string, ...parents: string[]) => ({ sha, parents })

/** Storia casuale ma riproducibile, con i figli prima dei genitori. */
function randomHistory(n: number, seed: number) {
  let s = seed
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const made: { sha: string; parents: string[] }[] = []
  for (let i = 0; i < n; i++) {
    const parents: string[] = []
    if (i > 0 && rand() > 0.03) parents.push(made[Math.max(0, i - 5) + Math.floor(rand() * Math.min(i, 5))].sha)
    if (i > 10 && rand() < 0.2) parents.push(made[Math.floor(rand() * i)].sha)
    made.push({ sha: `c${i}`, parents: [...new Set(parents)] })
  }
  return made.reverse()
}

describe('layoutGraph', () => {
  it('storia lineare: una colonna', () => {
    const { rows, lanes } = layoutGraph([c('C', 'B'), c('B', 'A'), c('A')])
    expect(lanes).toBe(1)
    expect(rows).toEqual([
      { lane: 0, up: [] },
      { lane: 0, up: [{ from: 0, to: 0 }] },
      { lane: 0, up: [{ from: 0, to: 0 }] },
    ])
  })

  it('branch e merge: la linea principale resta a sinistra', () => {
    const { rows, lanes } = layoutGraph([c('M', 'A', 'B'), c('B', 'X'), c('A', 'X'), c('X')])
    expect(lanes).toBe(2)
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0, 0])
    expect(rows[1].up).toEqual([{ from: 0, to: 0 }, { from: 0, to: 1 }])
    expect(rows[3].up).toEqual([{ from: 0, to: 0 }, { from: 1, to: 0 }])
  })

  it('storie senza antenati comuni', () => {
    const { rows } = layoutGraph([c('A2', 'A1'), c('B1'), c('A1')])
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0])
    expect(rows[1].up).toEqual([{ from: 0, to: 0 }])
  })

  it('invarianti su 2000 commit casuali', () => {
    const commits = randomHistory(2000, 42)
    const { rows, lanes } = layoutGraph(commits)
    const hasChild = new Set(commits.flatMap((x) => x.parents))
    rows.forEach((row, r) => {
      expect(row.lane).toBeLessThan(lanes)
      // il nodo ha un segmento in arrivo se e solo se ha figli
      expect(row.up.some((e) => e.to === row.lane)).toBe(hasChild.has(commits[r].sha))
      // tutti i segmenti stanno dentro la larghezza del grafo
      for (const e of row.up) expect(Math.max(e.from, e.to)).toBeLessThan(lanes)
      if (r === 0) return
      const prev = rows[r - 1]
      // ogni segmento parte da una colonna viva nella riga precedente
      for (const e of row.up) expect(e.from === prev.lane || prev.up.some((f) => f.to === e.from)).toBe(true)
      // una corsia che passa nella riga precedente prosegue in questa
      for (const e of prev.up) if (e.to !== prev.lane) expect(row.up.some((f) => f.from === e.to)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit/graph.test.ts`
Expected: FAIL, perché il modulo non esiste.

- [ ] **Step 3: Implementa**

`src/main/git/graph.ts`:
```ts
import type { GraphEdge, GraphRow } from '../../shared/types'

interface Lane {
  /** Commit atteso in questa colonna. */
  sha: string
  /** Colonna da cui parte il segmento verso la riga successiva. */
  from: number
}

/**
 * Colonne del grafo. I commit devono avere i figli prima dei genitori (git log --date-order).
 * Ogni commit prende la colonna di un figlio; il primo genitore prosegue nella stessa colonna.
 */
export function layoutGraph(commits: { sha: string; parents: string[] }[]): { rows: GraphRow[]; lanes: number } {
  const lanes: (Lane | null)[] = []
  let joins: { from: number; lane: number }[] = []
  const rows: GraphRow[] = []
  let width = 0
  const free = () => {
    const i = lanes.indexOf(null)
    return i === -1 ? lanes.length : i
  }

  for (const commit of commits) {
    let k = lanes.findIndex((l) => l?.sha === commit.sha)
    if (k === -1) k = free()
    const target = (j: number) => (lanes[j]?.sha === commit.sha ? k : j)

    const up: GraphEdge[] = []
    lanes.forEach((l, j) => {
      if (l) up.push({ from: l.from, to: target(j) })
    })
    for (const j of joins) up.push({ from: j.from, to: target(j.lane) })
    joins = []

    // Le corsie che aspettavano questo commit finiscono qui, le altre proseguono dritte
    lanes.forEach((l, j) => {
      if (l) lanes[j] = l.sha === commit.sha ? null : { sha: l.sha, from: j }
    })

    commit.parents.forEach((parent, i) => {
      const m = lanes.findIndex((l) => l?.sha === parent)
      if (i === 0 && (m === -1 || m > k)) lanes[k] = { sha: parent, from: k }
      else if (m !== -1) joins.push({ from: k, lane: m })
      else lanes[free()] = { sha: parent, from: k }
    })
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    rows.push({ lane: k, up })
    width = Math.max(width, k + 1, lanes.length)
  }
  return { rows, lanes: width }
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit/graph.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: disposizione del grafo dei commit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Storia in memoria con versione

**Files:**
- Create: `src/main/history.ts`, `scripts/make-big-repo.mjs`
- Test: `test/integration/history.test.ts`, `test/integration/history-perf.test.ts`

**Interfaces:**
- Consumes: `GitRunner` (piano 1), `LOG_FORMAT`, `parseLog`, `searchArgs` e `layoutGraph` (Task 1–2).
- Produces: `class History { constructor(runner: GitRunner); load(query: string): Promise<HistorySummary>; page(start: number, count: number): HistoryPage }`.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/integration/history.test.ts`:
```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { History } from '../../src/main/history'
import { git, makeRepo } from '../helpers/repo'

const history = (repo: string) => new History(new GitRunner(() => 'git', repo))

describe('History', () => {
  it('riusa la storia finché ref e HEAD non cambiano', async () => {
    const repo = makeRepo(3)
    const h = history(repo)
    const a = await h.load('')
    expect(a).toMatchObject({ total: 3, lanes: 1 })
    expect((await h.load('')).version).toBe(a.version)

    writeFileSync(join(repo, 'x.txt'), 'x\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'nuovo')
    const b = await h.load('')
    expect(b).toMatchObject({ version: a.version + 1, total: 4 })

    const page = h.page(0, 2)
    expect(page.version).toBe(b.version)
    expect(page.commits.map((c) => c.subject)).toEqual(['nuovo', 'commit 3'])
    expect(page.rows).toHaveLength(2)
    expect(page.commits[0].refs).toEqual([{ kind: 'branch', name: 'main', current: true }])
  })

  it('ricerca per messaggio, percorso, autore e contenuto, senza grafo', async () => {
    const h = history(makeRepo(3))
    expect((await h.load('message:"commit 2"')).total).toBe(1)
    expect((await h.load('path:file3.txt')).total).toBe(1)
    expect((await h.load('author:test')).total).toBe(3)
    expect((await h.load('contents:2')).total).toBe(1)
    expect(await h.load('commit')).toMatchObject({ total: 3, lanes: 0 })
  })

  it('esclude gli stash', async () => {
    const repo = makeRepo(1)
    writeFileSync(join(repo, 'file1.txt'), 'modificato\n')
    git(repo, 'stash', '-q')
    expect((await history(repo).load('')).total).toBe(1)
  })

  it('repo senza commit', async () => {
    expect(await history(makeRepo(0)).load('')).toMatchObject({ total: 0, lanes: 0 })
  })
})
```

`test/integration/history-perf.test.ts`:
```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { History } from '../../src/main/history'

// Lento (crea 100.000 commit): MERLINO_PERF=1 npx vitest run test/integration/history-perf.test.ts
describe.skipIf(!process.env.MERLINO_PERF)('prestazioni della storia', () => {
  it('100.000 commit in meno di 2 secondi', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'merlino-big-')), 'big')
    execFileSync(process.execPath, ['scripts/make-big-repo.mjs', dir, '100000'])
    const h = new History(new GitRunner(() => 'git', dir))
    const start = performance.now()
    const summary = await h.load('')
    const ms = performance.now() - start
    console.log(`load: ${Math.round(ms)} ms, ${summary.total} commit, ${summary.lanes} colonne`)
    expect(summary.total).toBeGreaterThanOrEqual(100_000)
    expect(ms).toBeLessThan(2000)
  }, 600_000)
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/integration/history.test.ts`
Expected: FAIL, perché il modulo `src/main/history` non esiste.

- [ ] **Step 3: Implementa la storia e lo script del repo grande**

`src/main/history.ts`:
```ts
import { createHash } from 'node:crypto'
import type { Commit, GraphRow, HistoryPage, HistorySummary } from '../shared/types'
import { layoutGraph } from './git/graph'
import { LOG_FORMAT, parseLog } from './git/log'
import type { GitRunner } from './git/runner'
import { searchArgs } from './git/search'

/** Storia del repo in memoria (commit + grafo), ricalcolata solo quando cambiano ref, HEAD o ricerca. */
export class History {
  private key = ''
  private version = 0
  private commits: Commit[] = []
  private rows: GraphRow[] = []
  private lanes = 0
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly runner: GitRunner) {}

  /** Le richieste vanno in fila: due eventi ravvicinati non fanno due git log in parallelo. */
  load(query: string): Promise<HistorySummary> {
    const result = this.queue.then(() => this.reload(query.trim()))
    this.queue = result.catch(() => undefined)
    return result
  }

  page(start: number, count: number): HistoryPage {
    return {
      version: this.version,
      commits: this.commits.slice(start, start + count),
      rows: this.rows.slice(start, start + count),
    }
  }

  private async reload(query: string): Promise<HistorySummary> {
    const [refs, head] = await Promise.all([
      this.runner.run(['for-each-ref', '--format=%(objectname) %(refname)']),
      this.runner.run(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] }),
    ])
    const key = createHash('sha1').update(refs.stdout).update(head.stdout).update(query).digest('hex')
    if (key !== this.key) {
      const search = searchArgs(query)
      const args = ['log', '--exclude=refs/stash', '--all', '--date-order', '-z', '--decorate=full', `--format=${LOG_FORMAT}`, ...search.args]
      if (search.paths.length) args.push('--', ...search.paths)
      // ponytail: storia intera in memoria; streaming a blocchi se serviranno repo da milioni di commit
      this.commits = parseLog((await this.runner.run(args)).stdout)
      if (query) {
        this.rows = this.commits.map(() => ({ lane: 0, up: [] }))
        this.lanes = 0
      } else {
        const graph = layoutGraph(this.commits)
        this.rows = graph.rows
        this.lanes = graph.lanes
      }
      this.key = key
      this.version++
    }
    return { version: this.version, total: this.commits.length, lanes: this.lanes }
  }
}
```

`scripts/make-big-repo.mjs`:
```js
// Repo di prova con molti commit e un merge ogni 20: node scripts/make-big-repo.mjs <cartella> [commit]
import { execFileSync } from 'node:child_process'

const [dir, countArg = '100000'] = process.argv.slice(2)
if (!dir) {
  console.error('uso: node scripts/make-big-repo.mjs <cartella> [commit]')
  process.exit(1)
}
const total = Number(countArg)
execFileSync('git', ['init', '-q', '-b', 'main', dir])

const parts = []
let mark = 0
let time = 1_700_000_000
let mainTip = 0

function commit(ref, from, merge) {
  mark++
  time += 60
  const message = `commit ${mark} su ${ref}`
  const content = `${mark}\n`
  parts.push(`commit refs/heads/${ref}\nmark :${mark}\ncommitter Test <test@example.com> ${time} +0000\n`)
  parts.push(`data ${Buffer.byteLength(message)}\n${message}\n`)
  if (from) parts.push(`from :${from}\n`)
  if (merge) parts.push(`merge :${merge}\n`)
  parts.push(`M 644 inline f${mark % 200}.txt\ndata ${content.length}\n${content}\n`)
  return mark
}

while (mark < total) {
  if (mainTip && mark % 20 === 0) {
    const side = commit('feature', commit('feature', mainTip))
    mainTip = commit('main', mainTip, side)
  } else {
    mainTip = commit('main', mainTip)
  }
}
execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: parts.join(''), maxBuffer: 1 << 30 })
execFileSync('git', ['checkout', '-q', 'main'], { cwd: dir })
console.log(`${dir}: ${mark} commit`)
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/integration/history.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Misura le prestazioni su 100.000 commit**

Run: `MERLINO_PERF=1 npx vitest run test/integration/history-perf.test.ts`
Expected: PASS, con nel log `load: … ms` sotto 2000.

- [ ] **Step 6: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: storia in memoria con versione, ricerca e repo di prova da 100k commit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Dettaglio del commit

**Files:**
- Create: `src/main/git/commit.ts`
- Test: `test/unit/commit-parse.test.ts`, `test/integration/commit-detail.test.ts`

**Interfaces:**
- Consumes: `LOG_FORMAT`, `parseLog` (Task 1), `CommitDetail`, `FileChange` (Task 1).
- Produces:
  - `parseNameStatus(out: string): Pick<FileChange, 'path' | 'oldPath' | 'status'>[]`;
  - `parseNumstat(out: string): Map<string, Pick<FileChange, 'added' | 'deleted'>>`;
  - `readCommitDetail(runner: GitRunner, sha: string): Promise<CommitDetail>`.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/unit/commit-parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseNameStatus, parseNumstat } from '../../src/main/git/commit'

describe('parseNameStatus', () => {
  it('stato, percorso e rinomine (formato -z)', () => {
    expect(parseNameStatus('A\0bin.dat\0M\0f.txt\0R100\0old.txt\0new.txt\0')).toEqual([
      { status: 'A', path: 'bin.dat' },
      { status: 'M', path: 'f.txt' },
      { status: 'R', path: 'new.txt', oldPath: 'old.txt' },
    ])
  })
})

describe('parseNumstat', () => {
  it('righe aggiunte e tolte, binari, rinomine e tab nel nome', () => {
    const map = parseNumstat('-\t-\tbin.dat\0' + '1\t2\tf.txt\0' + '0\t0\t\0old.txt\0new.txt\0' + '3\t0\tcon\ttab.txt\0')
    expect(map.get('bin.dat')).toEqual({ added: null, deleted: null })
    expect(map.get('f.txt')).toEqual({ added: 1, deleted: 2 })
    expect(map.get('new.txt')).toEqual({ added: 0, deleted: 0 })
    expect(map.get('con\ttab.txt')).toEqual({ added: 3, deleted: 0 })
  })
})
```

`test/integration/commit-detail.test.ts`:
```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCommitDetail } from '../../src/main/git/commit'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

const detail = (repo: string, sha: string) => readCommitDetail(new GitRunner(() => 'git', repo), sha)
const head = (repo: string, rev = 'HEAD') => git(repo, 'rev-parse', rev).trim()

describe('readCommitDetail', () => {
  it('messaggio completo e file cambiati: aggiunto, modificato, rinominato', async () => {
    const repo = makeRepo(2)
    git(repo, 'mv', 'file1.txt', 'rinominato.txt')
    writeFileSync(join(repo, 'file2.txt'), '2\nnuovo\n')
    writeFileSync(join(repo, 'bin.dat'), Buffer.from([0, 1, 2]))
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'oggetto', '-m', 'corpo del messaggio')

    const d = await detail(repo, head(repo))
    expect(d.commit.subject).toBe('oggetto')
    expect(d.message).toBe('oggetto\n\ncorpo del messaggio')
    expect(d.files).toEqual([
      { status: 'A', path: 'bin.dat', added: null, deleted: null },
      { status: 'M', path: 'file2.txt', added: 1, deleted: 0 },
      { status: 'R', path: 'rinominato.txt', oldPath: 'file1.txt', added: 0, deleted: 0 },
    ])
  })

  it('commit iniziale e merge (rispetto al primo genitore)', async () => {
    const repo = makeRepo(1)
    expect((await detail(repo, head(repo))).files).toEqual([{ status: 'A', path: 'file1.txt', added: 1, deleted: 0 }])

    git(repo, 'switch', '-q', '-c', 'feature')
    writeFileSync(join(repo, 'feature.txt'), 'f\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'feature')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', 'feature', '-m', 'merge')
    const merge = await detail(repo, head(repo))
    expect(merge.commit.parents).toHaveLength(2)
    expect(merge.files).toEqual([{ status: 'A', path: 'feature.txt', added: 1, deleted: 0 }])
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit/commit-parse.test.ts test/integration/commit-detail.test.ts`
Expected: FAIL, perché il modulo non esiste.

- [ ] **Step 3: Implementa**

`src/main/git/commit.ts`:
```ts
import type { CommitDetail, FileChange, FileStatus } from '../../shared/types'
import { LOG_FORMAT, parseLog } from './log'
import type { GitRunner } from './runner'

/** git … --name-status -z: "M\0path\0", rinomine "R100\0vecchio\0nuovo\0". */
export function parseNameStatus(out: string): Pick<FileChange, 'path' | 'oldPath' | 'status'>[] {
  const parts = out.split('\0')
  const files: Pick<FileChange, 'path' | 'oldPath' | 'status'>[] = []
  for (let i = 0; i < parts.length - 1; ) {
    const status = parts[i++][0] as FileStatus
    if (status === 'R' || status === 'C') {
      const oldPath = parts[i++]
      files.push({ status, path: parts[i++], oldPath })
    } else {
      files.push({ status, path: parts[i++] })
    }
  }
  return files
}

/** git … --numstat -z: "add\tdel\tpath\0", rinomine "add\tdel\t\0vecchio\0nuovo\0", binari "-\t-". Chiave: percorso nuovo. */
export function parseNumstat(out: string): Map<string, Pick<FileChange, 'added' | 'deleted'>> {
  const parts = out.split('\0')
  const map = new Map<string, Pick<FileChange, 'added' | 'deleted'>>()
  for (let i = 0; i < parts.length - 1; ) {
    const entry = parts[i++]
    const t1 = entry.indexOf('\t')
    const t2 = entry.indexOf('\t', t1 + 1)
    const count = (s: string) => (s === '-' ? null : Number(s))
    const counts = { added: count(entry.slice(0, t1)), deleted: count(entry.slice(t1 + 1, t2)) }
    let path = entry.slice(t2 + 1)
    if (path === '') {
      i++ // percorso vecchio
      path = parts[i++]
    }
    map.set(path, counts)
  }
  return map
}

export async function readCommitDetail(runner: GitRunner, sha: string): Promise<CommitDetail> {
  const changes = ['show', '--format=', '-z', '-M', '--diff-merges=first-parent']
  const [meta, nameStatus, numstat] = await Promise.all([
    runner.run(['show', '-s', '-z', '--decorate=full', `--format=${LOG_FORMAT}%x00%B`, sha]),
    runner.run([...changes, '--name-status', sha]),
    runner.run([...changes, '--numstat', sha]),
  ])
  const parts = meta.stdout.split('\0')
  const counts = parseNumstat(numstat.stdout)
  return {
    commit: parseLog(parts.slice(0, 10).join('\0'))[0],
    message: (parts[10] ?? '').trimEnd(),
    files: parseNameStatus(nameStatus.stdout).map((f) => ({ ...f, ...(counts.get(f.path) ?? { added: null, deleted: null }) })),
  }
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit/commit-parse.test.ts test/integration/commit-detail.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: dettaglio del commit con file cambiati" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Diff di un file

**Files:**
- Create: `src/main/git/diff.ts`
- Test: `test/unit/diff-parse.test.ts`, `test/integration/file-diff.test.ts`

**Interfaces:**
- Consumes: `FileDiff`, `Hunk`, `DiffOptions` (Task 1).
- Produces:
  - `parseFileDiff(out: string, path: string, oldPath?: string): FileDiff`;
  - `limitedDiff(out: string, file: DiffRequest, force: boolean): FileDiff`, che il piano 3 riusa;
  - `DiffRequest { path: string; oldPath?: string }`;
  - `readCommitFileDiff(runner, sha, file: DiffRequest, options: DiffOptions): Promise<FileDiff>`;
  - le costanti `DIFF_MAX_CHARS` e `DIFF_MAX_LINES`.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/unit/diff-parse.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseFileDiff } from '../../src/main/git/diff'

const out = [
  'diff --git a/f.txt b/f.txt',
  'index 1111111..2222222 100644',
  '--- a/f.txt',
  '+++ b/f.txt',
  '@@ -1,3 +1,3 @@ intestazione',
  ' a',
  '--- vecchio',
  '+++ nuovo',
  ' c',
  '@@ -10 +10,2 @@',
  '-x',
  '\\ No newline at end of file',
  '+x',
  '+y',
  '',
].join('\n')

describe('parseFileDiff', () => {
  it('hunk, numeri di riga e righe che iniziano con --- o +++', () => {
    const d = parseFileDiff(out, 'f.txt')
    expect(d).toMatchObject({ path: 'f.txt', binary: false, tooLarge: false })
    expect(d.hunks.map((h) => h.header)).toEqual(['@@ -1,3 +1,3 @@ intestazione', '@@ -10 +10,2 @@'])
    expect(d.hunks[0].lines).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: '-- vecchio', oldNo: 2, newNo: null },
      { type: 'add', text: '++ nuovo', oldNo: null, newNo: 2 },
      { type: 'context', text: 'c', oldNo: 3, newNo: 3 },
    ])
    expect(d.hunks[1].lines).toEqual([
      { type: 'del', text: 'x', oldNo: 10, newNo: null },
      { type: 'add', text: 'x', oldNo: null, newNo: 10 },
      { type: 'add', text: 'y', oldNo: null, newNo: 11 },
    ])
  })

  it('file binario', () => {
    const d = parseFileDiff('diff --git a/b.dat b/b.dat\nBinary files a/b.dat and b/b.dat differ\n', 'b.dat')
    expect(d).toMatchObject({ binary: true, hunks: [] })
  })
})
```

`test/integration/file-diff.test.ts`:
```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCommitFileDiff } from '../../src/main/git/diff'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

const options = { ignoreWhitespace: false, force: false }
const commitAll = (repo: string, message: string) => {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
  return git(repo, 'rev-parse', 'HEAD').trim()
}

describe('readCommitFileDiff', () => {
  it('modifica, rinomina e spazi ignorati', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    writeFileSync(join(repo, 'file1.txt'), '1\ndue\n')
    const sha = commitAll(repo, 'modifica')
    const d = await readCommitFileDiff(runner, sha, { path: 'file1.txt' }, options)
    expect(d.hunks[0].lines).toEqual([
      { type: 'context', text: '1', oldNo: 1, newNo: 1 },
      { type: 'add', text: 'due', oldNo: null, newNo: 2 },
    ])

    git(repo, 'mv', 'file1.txt', 'nuovo.txt')
    const renamed = commitAll(repo, 'rinomina')
    expect(await readCommitFileDiff(runner, renamed, { path: 'nuovo.txt', oldPath: 'file1.txt' }, options)).toMatchObject({
      oldPath: 'file1.txt',
      hunks: [],
    })

    writeFileSync(join(repo, 'nuovo.txt'), '1\n  due\n')
    const spaces = commitAll(repo, 'spazi')
    expect((await readCommitFileDiff(runner, spaces, { path: 'nuovo.txt' }, { ...options, ignoreWhitespace: true })).hunks).toEqual([])
  })

  it('oltre 20.000 righe: tooLarge, poi force', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    writeFileSync(join(repo, 'grande.txt'), Array.from({ length: 20_001 }, (_, i) => `riga ${i}`).join('\n') + '\n')
    const sha = commitAll(repo, 'grande')
    expect(await readCommitFileDiff(runner, sha, { path: 'grande.txt' }, options)).toMatchObject({ tooLarge: true, hunks: [] })
    const forced = await readCommitFileDiff(runner, sha, { path: 'grande.txt' }, { ...options, force: true })
    expect(forced.hunks[0].lines).toHaveLength(20_001)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit/diff-parse.test.ts test/integration/file-diff.test.ts`
Expected: FAIL, perché il modulo non esiste.

- [ ] **Step 3: Implementa**

`src/main/git/diff.ts`:
```ts
import type { DiffOptions, FileDiff, Hunk } from '../../shared/types'
import type { GitRunner } from './runner'

export const DIFF_MAX_CHARS = 5 * 1024 * 1024
export const DIFF_MAX_LINES = 20_000

export interface DiffRequest {
  path: string
  oldPath?: string
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Diff unificato di un solo file. Le righe di un hunk si contano dall'intestazione @@,
 * così "--- x" dentro un hunk è una riga tolta e non un'intestazione.
 */
export function parseFileDiff(out: string, path: string, oldPath?: string): FileDiff {
  const diff: FileDiff = { path, ...(oldPath ? { oldPath } : {}), binary: false, tooLarge: false, hunks: [] }
  let hunk: Hunk | null = null
  let oldNo = 0
  let newNo = 0
  let oldLeft = 0
  let newLeft = 0
  for (const raw of out.split('\n')) {
    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const text = raw.slice(1)
      if (raw[0] === ' ') {
        hunk.lines.push({ type: 'context', text, oldNo: oldNo++, newNo: newNo++ })
        oldLeft--
        newLeft--
      } else if (raw[0] === '-') {
        hunk.lines.push({ type: 'del', text, oldNo: oldNo++, newNo: null })
        oldLeft--
      } else if (raw[0] === '+') {
        hunk.lines.push({ type: 'add', text, oldNo: null, newNo: newNo++ })
        newLeft--
      } // "\ No newline at end of file": nessuna riga
      continue
    }
    const m = HUNK.exec(raw)
    if (m) {
      oldNo = Number(m[1])
      oldLeft = m[2] === undefined ? 1 : Number(m[2])
      newNo = Number(m[3])
      newLeft = m[4] === undefined ? 1 : Number(m[4])
      hunk = { header: raw, lines: [] }
      diff.hunks.push(hunk)
    } else if (raw.startsWith('Binary files ') || raw === 'GIT binary patch') {
      diff.binary = true
    }
  }
  return diff
}

/** Oltre i limiti restituisce solo tooLarge, a meno di force. */
export function limitedDiff(out: string, file: DiffRequest, force: boolean): FileDiff {
  if (!force && (out.length > DIFF_MAX_CHARS || countLines(out) > DIFF_MAX_LINES)) {
    return { path: file.path, ...(file.oldPath ? { oldPath: file.oldPath } : {}), binary: false, tooLarge: true, hunks: [] }
  }
  return parseFileDiff(out, file.path, file.oldPath)
}

function countLines(text: string): number {
  let n = 0
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++
  return n
}

export async function readCommitFileDiff(runner: GitRunner, sha: string, file: DiffRequest, options: DiffOptions): Promise<FileDiff> {
  const args = ['show', '--format=', '--no-color', '--no-ext-diff', '--diff-merges=first-parent', '-M', '-U3']
  if (options.ignoreWhitespace) args.push('-w')
  // Con la rinomina servono entrambi i percorsi, altrimenti git vede un file nuovo
  args.push(sha, '--', ...(file.oldPath ? [file.oldPath, file.path] : [file.path]))
  return limitedDiff((await runner.run(args)).stdout, file, options.force)
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit/diff-parse.test.ts test/integration/file-diff.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: parser del diff unificato con limiti di dimensione" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: IPC della storia

**Files:**
- Modify: `src/shared/ipc.ts`, `src/main/repo-session.ts`, `src/main/ipc-handlers.ts`, `src/preload/index.ts`
- Test: `test/e2e/history-api.spec.ts`

**Interfaces:**
- Consumes: `History` (Task 3), `readCommitDetail` (Task 4), `readCommitFileDiff`, `DiffRequest` (Task 5).
- Produces, in `Api`:
  - `historyLoad(root, query): Promise<Result<HistorySummary>>`;
  - `historyPage(root, start, count): Promise<Result<HistoryPage>>`;
  - `commitDetail(root, sha): Promise<Result<CommitDetail>>`;
  - `commitFileDiff(root, sha, file: { path: string; oldPath?: string }, options: DiffOptions): Promise<Result<FileDiff>>`;
  - `RepoSession.history`.

- [ ] **Step 1: Scrivi il test E2E che fallisce**

`test/e2e/history-api.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: storia, dettaglio, diff e SHA non validi', async () => {
  const repo = makeRepo(2)
  const sha = git(repo, 'rev-parse', 'HEAD').trim()
  const a = { repo, sha }
  const { app, page } = await launch()

  await page.evaluate((x) => (globalThis as unknown as Win).api.openRepo(x.repo), a)
  const summary = await page.evaluate((x) => (globalThis as unknown as Win).api.historyLoad(x.repo, ''), a)
  expect(summary).toMatchObject({ ok: true, value: { total: 2, lanes: 1 } })

  const history = await page.evaluate((x) => (globalThis as unknown as Win).api.historyPage(x.repo, 0, 10), a)
  if (!history.ok) throw new Error(history.error.message)
  expect(history.value.commits.map((c) => c.subject)).toEqual(['commit 2', 'commit 1'])

  const detail = await page.evaluate((x) => (globalThis as unknown as Win).api.commitDetail(x.repo, x.sha), a)
  expect(detail).toMatchObject({ ok: true, value: { files: [{ path: 'file2.txt', status: 'A' }] } })

  const diff = await page.evaluate(
    (x) => (globalThis as unknown as Win).api.commitFileDiff(x.repo, x.sha, { path: 'file2.txt' }, { ignoreWhitespace: false, force: false }),
    a,
  )
  expect(diff).toMatchObject({ ok: true, value: { hunks: [{ lines: [{ type: 'add', text: '2' }] }] } })

  const bad = await page.evaluate((x) => (globalThis as unknown as Win).api.commitDetail(x.repo, '--output=/tmp/merlino-x'), a)
  expect(bad.ok).toBe(false)
  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: FAIL, perché `historyLoad` non esiste su `Api`.

- [ ] **Step 3: Aggiorna il contratto IPC**

In `src/shared/ipc.ts`:
- Import: `import type { AppSettings, CommandLogEntry, CommitDetail, DiffOptions, FileDiff, GitCheck, GitErrorInfo, HistoryPage, HistorySummary, RepoInfo } from './types'`.
- In `Channels`, dopo `getCommandLog`:
```ts
  historyLoad: 'history:load',
  historyPage: 'history:page',
  commitDetail: 'commit:detail',
  commitFileDiff: 'commit:file-diff',
```
- In `Api`, dopo `getCommandLog()`:
```ts
  /** Carica (o riusa) la storia; version cambia quando cambiano ref, HEAD o ricerca. */
  historyLoad(root: string, query: string): Promise<Result<HistorySummary>>
  historyPage(root: string, start: number, count: number): Promise<Result<HistoryPage>>
  commitDetail(root: string, sha: string): Promise<Result<CommitDetail>>
  commitFileDiff(root: string, sha: string, file: { path: string; oldPath?: string }, options: DiffOptions): Promise<Result<FileDiff>>
```

`src/main/repo-session.ts`: aggiungi `import { History } from './history'`, il campo `readonly history: History` e nel costruttore, dopo `this.runner = …`:
```ts
    this.history = new History(this.runner)
```

- [ ] **Step 4: Aggiorna gli handler**

In `src/main/ipc-handlers.ts`:
- Import aggiuntivi:
```ts
import type { CommandLogEntry, DiffOptions, GitErrorInfo, RepoInfo } from '../shared/types'
import { readCommitDetail } from './git/commit'
import { type DiffRequest, readCommitFileDiff } from './git/diff'
```
- Dopo `str()`, la validazione degli altri argomenti:
```ts
const MAX_PAGE = 5000

/** Uno SHA che non può essere scambiato per un'opzione di git. */
function sha(value: unknown): string {
  const s = str(value, 'sha')
  if (!/^[0-9a-f]{4,64}$/i.test(s)) throw new TypeError('sha non valido')
  return s
}

function int(value: unknown, name: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new TypeError(`${name} non valido`)
  return value
}

function fileRequest(value: unknown): DiffRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as { path?: unknown; oldPath?: unknown }
  const path = str(v.path, 'path')
  return v.oldPath === undefined ? { path } : { path, oldPath: str(v.oldPath, 'oldPath') }
}

function diffOptions(value: unknown): DiffOptions {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return { ignoreWhitespace: v.ignoreWhitespace === true, force: v.force === true }
}
```
- Dentro `registerIpc`, dopo `open()`:
```ts
  async function withSession<T>(root: unknown, fn: (session: RepoSession) => Promise<T> | T): Promise<Result<T>> {
    try {
      const session = sessions.get(str(root, 'root'))
      if (!session) throw new Error('Repository non aperto')
      return { ok: true, value: await fn(session) }
    } catch (e) {
      return fail(e)
    }
  }
```
- L'handler `repoInfo` diventa:
```ts
  ipcMain.handle(Channels.repoInfo, (_e, root: unknown) => withSession(root, (s) => readRepoInfo(s.runner)))
```
- Dopo `getCommandLog`:
```ts
  ipcMain.handle(Channels.historyLoad, (_e, root: unknown, query: unknown) =>
    withSession(root, (s) => s.history.load(typeof query === 'string' ? query.slice(0, 1000) : '')),
  )
  ipcMain.handle(Channels.historyPage, (_e, root: unknown, start: unknown, count: unknown) =>
    withSession(root, (s) => s.history.page(int(start, 'start', Number.MAX_SAFE_INTEGER), int(count, 'count', MAX_PAGE))),
  )
  ipcMain.handle(Channels.commitDetail, (_e, root: unknown, commit: unknown) =>
    withSession(root, (s) => readCommitDetail(s.runner, sha(commit))),
  )
  ipcMain.handle(Channels.commitFileDiff, (_e, root: unknown, commit: unknown, file: unknown, options: unknown) =>
    withSession(root, (s) => readCommitFileDiff(s.runner, sha(commit), fileRequest(file), diffOptions(options))),
  )
```

In `src/preload/index.ts`, dopo `getCommandLog`:
```ts
  historyLoad: (root, query) => ipcRenderer.invoke(Channels.historyLoad, root, query),
  historyPage: (root, start, count) => ipcRenderer.invoke(Channels.historyPage, root, start, count),
  commitDetail: (root, sha) => ipcRenderer.invoke(Channels.commitDetail, root, sha),
  commitFileDiff: (root, sha, file, options) => ipcRenderer.invoke(Channels.commitFileDiff, root, sha, file, options),
```

- [ ] **Step 5: Esegui i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 7 test.

- [ ] **Step 6: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: IPC di storia, dettaglio e diff con validazione degli argomenti" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Modello del diff nel renderer

**Files:**
- Create: `src/renderer/history/diff-model.ts`, `src/renderer/history/highlight.ts`, `src/renderer/history/format.ts`, `src/renderer/history/graph-draw.ts`
- Modify: `package.json`, per aggiungere `highlight.js@11.12.0` e `diff@9.0.0` alle devDependencies
- Test: `test/unit/diff-model.test.ts`

**Interfaces:**
- Produces:
  - `SplitRow { left: DiffLine | null; right: DiffLine | null }` e `splitRows(hunk): SplitRow[]`;
  - `Segment { text: string; changed: boolean }` e `wordSegments(hunk): Map<DiffLine, Segment[]>`;
  - `renderSegments(s: Segment[]): string` e `escapeHtml(s: string): string`;
  - `highlighter(path: string): (text: string) => string`;
  - `formatDate(seconds: number): string`;
  - `ROW_HEIGHT`, `LANE_WIDTH`, `MAX_LANES`, `laneColor(lane)` e `drawGraph(ctx, rowAt, first, last)`.

- [ ] **Step 1: Installa le dipendenze**

```bash
npm i -D -E highlight.js@11.12.0 diff@9.0.0
```

- [ ] **Step 2: Scrivi i test che falliscono**

`test/unit/diff-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { escapeHtml, renderSegments, splitRows, wordSegments } from '../../src/renderer/history/diff-model'
import type { DiffLine, Hunk } from '../../src/shared/types'

const ctx = (text: string, n: number): DiffLine => ({ type: 'context', text, oldNo: n, newNo: n })
const del = (text: string, n: number): DiffLine => ({ type: 'del', text, oldNo: n, newNo: null })
const add = (text: string, n: number): DiffLine => ({ type: 'add', text, oldNo: null, newNo: n })

describe('splitRows', () => {
  it('affianca i blocchi tolti/aggiunti e riempie i vuoti', () => {
    const a = ctx('a', 1)
    const d1 = del('vecchio 1', 2)
    const d2 = del('vecchio 2', 3)
    const a1 = add('nuovo 1', 2)
    const tail = ctx('z', 4)
    const hunk: Hunk = { header: '@@', lines: [a, d1, d2, a1, tail] }
    expect(splitRows(hunk)).toEqual([
      { left: a, right: a },
      { left: d1, right: a1 },
      { left: d2, right: null },
      { left: tail, right: tail },
    ])
  })
})

describe('wordSegments', () => {
  it('evidenzia solo le parole cambiate nelle righe accoppiate', () => {
    const d = del('const a = 1', 1)
    const a = add('const a = 2', 1)
    const map = wordSegments({ header: '@@', lines: [d, a] })
    expect(map.get(d)).toEqual([
      { text: 'const a = ', changed: false },
      { text: '1', changed: true },
    ])
    expect(map.get(a)).toEqual([
      { text: 'const a = ', changed: false },
      { text: '2', changed: true },
    ])
  })
})

describe('html', () => {
  it('escape e mark', () => {
    expect(escapeHtml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;')
    expect(renderSegments([{ text: 'x<', changed: false }, { text: 'y', changed: true }])).toBe('x&lt;<mark>y</mark>')
  })
})
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit/diff-model.test.ts`
Expected: FAIL, perché il modulo non esiste.

- [ ] **Step 4: Implementa**

`src/renderer/history/diff-model.ts`:
```ts
import { diffWordsWithSpace } from 'diff'
import type { DiffLine, Hunk } from '../../shared/types'

export interface SplitRow {
  left: DiffLine | null
  right: DiffLine | null
}

export interface Segment {
  text: string
  changed: boolean
}

/** Righe affiancate: i contesti su entrambi i lati, i blocchi tolti/aggiunti accoppiati riga per riga. */
export function splitRows(hunk: Hunk): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push({ left: dels[i] ?? null, right: adds[i] ?? null })
    dels = []
    adds = []
  }
  for (const line of hunk.lines) {
    if (line.type === 'del') {
      if (adds.length) flush()
      dels.push(line)
    } else if (line.type === 'add') {
      adds.push(line)
    } else {
      flush()
      rows.push({ left: line, right: line })
    }
  }
  flush()
  return rows
}

const MAX_WORD_DIFF = 500

/** Parole cambiate nelle coppie riga tolta/aggiunta (righe lunghe escluse: il confronto costerebbe troppo). */
export function wordSegments(hunk: Hunk): Map<DiffLine, Segment[]> {
  const map = new Map<DiffLine, Segment[]>()
  for (const { left, right } of splitRows(hunk)) {
    if (!left || !right || left === right || left.text.length > MAX_WORD_DIFF || right.text.length > MAX_WORD_DIFF) continue
    const parts = diffWordsWithSpace(left.text, right.text)
    map.set(left, merge(parts.filter((p) => !p.added).map((p) => ({ text: p.value, changed: !!p.removed }))))
    map.set(right, merge(parts.filter((p) => !p.removed).map((p) => ({ text: p.value, changed: !!p.added }))))
  }
  return map
}

/** Unisce i segmenti vicini con lo stesso stato. */
function merge(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const last = out[out.length - 1]
    if (last && last.changed === s.changed) last.text += s.text
    else out.push({ ...s })
  }
  return out
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)
}

export function renderSegments(segments: Segment[]): string {
  return segments.map((s) => (s.changed ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('')
}
```

`src/renderer/history/highlight.ts`:
```ts
import hljs from 'highlight.js/lib/common'
import { escapeHtml } from './diff-model'

const ALIASES: Record<string, string> = { vue: 'xml', svelte: 'xml', mjs: 'javascript', cjs: 'javascript' }

/** Colorazione per riga secondo l'estensione del file; testo semplice se il linguaggio non è noto. */
export function highlighter(path: string): (text: string) => string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const language = ALIASES[ext] ?? ext
  if (!path.includes('.') || !hljs.getLanguage(language)) return escapeHtml
  return (text) => hljs.highlight(text, { language, ignoreIllegals: true }).value
}
```

`src/renderer/history/format.ts`:
```ts
const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' })

export const formatDate = (seconds: number): string => dateFormat.format(seconds * 1000)
```

`src/renderer/history/graph-draw.ts`:
```ts
import type { GraphRow } from '../../shared/types'

export const ROW_HEIGHT = 24
export const LANE_WIDTH = 14
/** Oltre queste colonne il grafo viene tagliato. */
export const MAX_LANES = 24
const COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#22c55e', '#ef4444']

export const laneColor = (lane: number): string => COLORS[lane % COLORS.length] ?? '#888'
const x = (lane: number) => 4 + LANE_WIDTH / 2 + lane * LANE_WIDTH

/** Disegna le righe da first a last; la riga first è in cima al canvas. */
export function drawGraph(
  ctx: CanvasRenderingContext2D,
  rowAt: (i: number) => GraphRow | undefined,
  first: number,
  last: number,
): void {
  const y = (i: number) => (i - first) * ROW_HEIGHT + ROW_HEIGHT / 2
  ctx.lineWidth = 2
  // Anche la riga dopo l'ultima: i suoi segmenti partono dall'ultima riga visibile
  for (let i = first; i <= last + 1; i++) {
    for (const e of rowAt(i)?.up ?? []) {
      ctx.strokeStyle = laneColor(Math.max(e.from, e.to))
      ctx.beginPath()
      ctx.moveTo(x(e.from), y(i - 1))
      if (e.from === e.to) ctx.lineTo(x(e.to), y(i))
      else ctx.bezierCurveTo(x(e.from), y(i) - ROW_HEIGHT / 2, x(e.to), y(i - 1) + ROW_HEIGHT / 2, x(e.to), y(i))
      ctx.stroke()
    }
  }
  for (let i = first; i <= last; i++) {
    const row = rowAt(i)
    if (!row) continue
    ctx.fillStyle = laneColor(row.lane)
    ctx.beginPath()
    ctx.arc(x(row.lane), y(i), 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit/diff-model.test.ts`
Expected: PASS, 3 test.

- [ ] **Step 6: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: modello del diff (affiancato, parole cambiate) e disegno del grafo" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Lista dei commit con grafo e ricerca

**Files:**
- Modify: `src/renderer/stores/repo.ts` (sostituito), `src/renderer/components/RepoView.vue` (sostituito), `src/renderer/styles.css` (variabili per diff e sintassi)
- Create: `src/renderer/components/HistoryView.vue`, `src/renderer/components/CommitList.vue`, `src/renderer/components/CommitDetail.vue` (provvisorio: solo il messaggio; completo nel Task 9)
- Test: `test/e2e/history.spec.ts` (prima parte)

**Interfaces:**
- Consumes: le operazioni di storia di `window.api` (Task 6) e i moduli `history/*` (Task 7).
- Produces:
  - `useRepoStore(root)` con `history`, `query`, `pagesTick`, `selected`, `selectedIndex`, `detail`, `selectedFile`, `diff`, `diffOptions`;
  - sempre nello store, i metodi `loadHistory()`, `ensureRows(a, b)`, `commitAt(i)`, `rowAt(i)`, `select(sha, index?)`, `selectFile(f)`, `loadDiff(force?)`, `search(q)`, `toggleSplit()`, `toggleWhitespace()` e `move(±1)`;
  - i `data-testid` `commit-row`, `commit-list`, `history-search` e `commit-message`.

- [ ] **Step 1: Scrivi il test E2E che fallisce**

`test/e2e/history.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

function repoWithMerge(): string {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'feature/x')
  writeFileSync(join(repo, 'file1.txt'), '1\nmodificato\n')
  git(repo, 'commit', '-q', '-am', 'modifica su feature')
  git(repo, 'switch', '-q', 'main')
  git(repo, 'merge', '-q', '--no-ff', 'feature/x', '-m', 'merge feature')
  git(repo, 'tag', 'v1.0')
  return repo
}

test('storia: grafo, etichette, ricerca e aggiornamento automatico', async () => {
  const repo = repoWithMerge()
  const { app, page } = await launch([repo])
  const rows = page.getByTestId('commit-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('merge feature')
  await expect(rows.first()).toContainText('main')
  await expect(rows.first()).toContainText('v1.0')
  await expect(page.locator('canvas.graph')).toBeVisible()
  await expect(page.getByTestId('commit-message')).toContainText('merge feature')

  await rows.filter({ hasText: 'modifica su feature' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('modifica su feature')
  await page.getByTestId('commit-list').press('ArrowDown')
  await expect(page.getByTestId('commit-message')).toContainText('commit 1')

  const search = page.getByTestId('history-search')
  await search.fill('message:feature')
  await search.press('Enter')
  await expect(rows).toHaveCount(2)
  await search.press('Escape')
  await expect(rows).toHaveCount(3)

  writeFileSync(join(repo, 'nuovo.txt'), 'x\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'commit dal terminale')
  await expect(rows.first()).toContainText('commit dal terminale')
  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:e2e -- test/e2e/history.spec.ts`
Expected: FAIL, perché `commit-row` non esiste.

- [ ] **Step 3: Sostituisci lo store del repo**

`src/renderer/stores/repo.ts`:
```ts
import { defineStore, getActivePinia } from 'pinia'
import { reactive, ref, shallowRef } from 'vue'
import type { Commit, CommitDetail, FileChange, FileDiff, GraphRow, HistoryPage, HistorySummary, RepoInfo } from '../../shared/types'

const storeId = (root: string) => `repo:${root}`
export const PAGE_SIZE = 500

function define(root: string) {
  return defineStore(storeId(root), () => {
    const info = ref<RepoInfo | null>(null)
    const error = ref<string | null>(null)

    // Storia: pagine caricate quando servono, scartate quando cambia la versione.
    // Le pagine non sono reattive (sono tante): pagesTick segnala che ne è arrivata una.
    const history = ref<HistorySummary>({ version: 0, total: 0, lanes: 0 })
    const query = ref('')
    const pagesTick = ref(0)
    let pages = new Map<number, HistoryPage>()
    const loading = new Set<string>()

    const selected = ref<string | null>(null)
    const selectedIndex = ref(-1)
    const detail = shallowRef<CommitDetail | null>(null)
    const selectedFile = shallowRef<FileChange | null>(null)
    const diff = shallowRef<FileDiff | null>(null)
    const diffOptions = reactive({ split: false, ignoreWhitespace: false })
    let detailRequest = 0
    let diffRequest = 0

    async function refresh() {
      const r = await window.api.repoInfo(root)
      if (r.ok) {
        info.value = r.value
        error.value = null
      } else {
        error.value = r.error.message
      }
      await loadHistory()
    }

    async function loadHistory() {
      const r = await window.api.historyLoad(root, query.value)
      if (!r.ok) {
        error.value = r.error.message
        return
      }
      if (r.value.version === history.value.version) return
      pages = new Map()
      history.value = r.value
      pagesTick.value++
      await ensureRows(0, PAGE_SIZE - 1)
      const firstCommit = commitAt(0)
      if (selected.value) selectedIndex.value = indexOfLoaded(selected.value)
      else if (firstCommit) void select(firstCommit.sha, 0)
    }

    async function ensureRows(start: number, end: number) {
      const version = history.value.version
      const requests: Promise<void>[] = []
      for (let p = Math.floor(start / PAGE_SIZE); p <= Math.floor(end / PAGE_SIZE); p++) {
        const key = `${version}:${p}`
        if (p * PAGE_SIZE >= history.value.total || pages.has(p) || loading.has(key)) continue
        loading.add(key)
        requests.push(
          window.api.historyPage(root, p * PAGE_SIZE, PAGE_SIZE).then((r) => {
            loading.delete(key)
            if (r.ok && r.value.version === version && history.value.version === version) {
              pages.set(p, r.value)
              pagesTick.value++
            }
          }),
        )
      }
      await Promise.all(requests)
    }

    function commitAt(i: number): Commit | undefined {
      void pagesTick.value
      return pages.get(Math.floor(i / PAGE_SIZE))?.commits[i % PAGE_SIZE]
    }

    function rowAt(i: number): GraphRow | undefined {
      void pagesTick.value
      return pages.get(Math.floor(i / PAGE_SIZE))?.rows[i % PAGE_SIZE]
    }

    function indexOfLoaded(sha: string): number {
      for (const [p, page] of pages) {
        const j = page.commits.findIndex((c) => c.sha === sha)
        if (j !== -1) return p * PAGE_SIZE + j
      }
      return -1
    }

    async function select(sha: string, index = indexOfLoaded(sha)) {
      selected.value = sha
      selectedIndex.value = index
      const request = ++detailRequest
      const r = await window.api.commitDetail(root, sha)
      if (request !== detailRequest) return
      if (!r.ok) {
        error.value = r.error.message
        return
      }
      detail.value = r.value
      await selectFile(r.value.files[0] ?? null)
    }

    async function selectFile(file: FileChange | null) {
      selectedFile.value = file
      await loadDiff()
    }

    async function loadDiff(force = false) {
      const file = selectedFile.value
      const sha = selected.value
      const request = ++diffRequest
      if (!file || !sha) {
        diff.value = null
        return
      }
      const target = file.oldPath ? { path: file.path, oldPath: file.oldPath } : { path: file.path }
      const r = await window.api.commitFileDiff(root, sha, target, { ignoreWhitespace: diffOptions.ignoreWhitespace, force })
      if (request !== diffRequest) return
      if (r.ok) diff.value = r.value
      else error.value = r.error.message
    }

    async function search(text: string) {
      query.value = text.trim()
      await loadHistory()
    }

    function toggleSplit() {
      diffOptions.split = !diffOptions.split
    }

    async function toggleWhitespace() {
      diffOptions.ignoreWhitespace = !diffOptions.ignoreWhitespace
      await loadDiff()
    }

    function move(step: 1 | -1) {
      const i = selectedIndex.value + step
      if (selectedIndex.value < 0 || i < 0 || i >= history.value.total) return
      const commit = commitAt(i)
      if (commit) void select(commit.sha, i)
    }

    return {
      root, info, error, refresh,
      history, query, pagesTick, loadHistory, ensureRows, commitAt, rowAt, search, move,
      selected, selectedIndex, detail, selectedFile, diff, diffOptions, select, selectFile, loadDiff, toggleSplit, toggleWhitespace,
    }
  })
}

const definitions = new Map<string, ReturnType<typeof define>>()

/** Uno store per ogni repo aperto (una tab). */
export function useRepoStore(root: string) {
  let useStore = definitions.get(root)
  if (!useStore) {
    useStore = define(root)
    definitions.set(root, useStore)
  }
  return useStore()
}

export function disposeRepoStore(root: string): void {
  const useStore = definitions.get(root)
  if (!useStore) return
  useStore().$dispose()
  delete getActivePinia()?.state.value[storeId(root)]
  definitions.delete(root)
}
```

- [ ] **Step 4: Aggiungi le variabili di colore per diff e sintassi in `src/renderer/styles.css`**

Nel blocco `:root` (tema chiaro), prima di `font:`:
```css
  --add-bg: #e6ffec;
  --del-bg: #ffebe9;
  --add-mark: #abf2bc;
  --del-mark: #ffc0c0;
  --syn-comment: #6a737d;
  --syn-keyword: #d73a49;
  --syn-string: #032f62;
  --syn-number: #005cc5;
  --syn-title: #6f42c1;
  --syn-meta: #22863a;
```
Nel blocco del tema scuro, dopo `--danger-bg`:
```css
    --add-bg: rgb(46 160 67 / 0.15);
    --del-bg: rgb(248 81 73 / 0.15);
    --add-mark: rgb(46 160 67 / 0.4);
    --del-mark: rgb(248 81 73 / 0.4);
    --syn-comment: #8b949e;
    --syn-keyword: #ff7b72;
    --syn-string: #a5d6ff;
    --syn-number: #79c0ff;
    --syn-title: #d2a8ff;
    --syn-meta: #7ee787;
```
In fondo al file:
```css
/* Sintassi (classi di highlight.js) */
.hljs-comment, .hljs-quote { color: var(--syn-comment); font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-built_in, .hljs-type { color: var(--syn-keyword); }
.hljs-string, .hljs-regexp, .hljs-template-tag { color: var(--syn-string); }
.hljs-number, .hljs-attr, .hljs-attribute, .hljs-variable, .hljs-property { color: var(--syn-number); }
.hljs-title, .hljs-section, .hljs-name { color: var(--syn-title); }
.hljs-meta, .hljs-tag, .hljs-symbol { color: var(--syn-meta); }
```

- [ ] **Step 5: Crea lista, vista della storia e dettaglio provvisorio, e il nuovo layout**

`src/renderer/components/CommitList.vue`:
```vue
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatDate } from '../history/format'
import { drawGraph, LANE_WIDTH, MAX_LANES, ROW_HEIGHT } from '../history/graph-draw'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const scroller = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const scrollTop = ref(0)
const viewHeight = ref(0)
const OVERSCAN = 10

const first = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN))
const last = computed(() =>
  Math.min(repo.history.total - 1, Math.ceil((scrollTop.value + viewHeight.value) / ROW_HEIGHT) + OVERSCAN),
)
const visible = computed(() =>
  Array.from({ length: Math.max(0, last.value - first.value + 1) }, (_, k) => {
    const i = first.value + k
    return { i, commit: repo.commitAt(i) }
  }),
)
const graphWidth = computed(() => (repo.history.lanes ? Math.min(repo.history.lanes, MAX_LANES) * LANE_WIDTH + 8 : 0))

watch([first, last, () => repo.history.version], () => void repo.ensureRows(first.value, last.value), { immediate: true })
watch([first, last, () => repo.pagesTick, graphWidth], () => void nextTick(draw))
watch(
  () => repo.selectedIndex,
  (i) => {
    const el = scroller.value
    if (!el || i < 0) return
    const top = i * ROW_HEIGHT
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight
  },
)

function draw() {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const ratio = window.devicePixelRatio || 1
  const height = Math.max(0, last.value - first.value + 1) * ROW_HEIGHT
  el.width = graphWidth.value * ratio
  el.height = height * ratio
  el.style.width = `${graphWidth.value}px`
  el.style.height = `${height}px`
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  drawGraph(ctx, repo.rowAt, first.value, last.value)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(() => {
    viewHeight.value = scroller.value?.clientHeight ?? 0
  })
  if (scroller.value) observer.observe(scroller.value)
})
onUnmounted(() => observer?.disconnect())

function onScroll() {
  scrollTop.value = scroller.value?.scrollTop ?? 0
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') repo.move(1)
  else if (e.key === 'ArrowUp') repo.move(-1)
  else return
  e.preventDefault()
}

function select(i: number) {
  const commit = repo.commitAt(i)
  if (commit) void repo.select(commit.sha, i)
  scroller.value?.focus()
}
</script>

<template>
  <div ref="scroller" class="list" tabindex="0" data-testid="commit-list" @scroll="onScroll" @keydown="onKey">
    <p v-if="repo.history.version && !repo.history.total" class="muted empty">Nessun commit</p>
    <div class="content" :style="{ height: `${repo.history.total * ROW_HEIGHT}px` }">
      <canvas v-if="graphWidth" ref="canvas" class="graph" :style="{ top: `${first * ROW_HEIGHT}px` }" />
      <div
        v-for="{ i, commit } in visible"
        :key="i"
        class="row"
        :class="{ selected: commit && commit.sha === repo.selected }"
        :style="{ top: `${i * ROW_HEIGHT}px`, paddingLeft: `${graphWidth + 8}px` }"
        data-testid="commit-row"
        @click="select(i)"
      >
        <template v-if="commit">
          <span
            v-for="r in commit.refs"
            :key="`${r.kind}:${r.name}`"
            class="ref"
            :class="[r.kind, { current: r.current }]"
          >{{ r.name }}</span>
          <span class="subject">{{ commit.subject }}</span>
          <span class="author">{{ commit.author }}</span>
          <span class="date">{{ formatDate(commit.authorTime) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list { position: relative; flex: 1; min-height: 0; overflow: auto; outline: none; }
.content { position: relative; }
.graph { position: absolute; left: 0; z-index: 1; pointer-events: none; }
.row { position: absolute; left: 0; right: 0; height: 24px; display: flex; align-items: center; gap: 6px; padding-right: 8px; white-space: nowrap; cursor: default; }
.row:hover { background: var(--bg-hover); }
.row.selected { background: var(--accent); color: var(--accent-fg); }
.row.selected .author, .row.selected .date { color: inherit; }
.subject { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.author { width: 140px; overflow: hidden; text-overflow: ellipsis; color: var(--fg-muted); }
.date { width: 140px; text-align: right; color: var(--fg-muted); font-variant-numeric: tabular-nums; }
.ref { padding: 0 6px; border: 1px solid currentColor; border-radius: 9px; font-size: 11px; line-height: 16px; }
.ref.branch { color: var(--accent); }
.row.selected .ref { color: inherit; }
.ref.remote { color: var(--fg-muted); }
.ref.tag { color: #b7791f; }
.ref.current { font-weight: 700; }
.empty { padding: 12px; }
</style>
```

`src/renderer/components/HistoryView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRepoStore } from '../stores/repo'
import CommitList from './CommitList.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const text = ref(repo.query)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    void repo.search(text.value)
  } else if (e.key === 'Escape') {
    text.value = ''
    void repo.search('')
  }
}
</script>

<template>
  <section class="history">
    <div class="search">
      <input
        v-model="text"
        data-testid="history-search"
        placeholder="Cerca: testo, author:, path:, message:, contents:"
        @keydown="onKey"
      />
      <span class="muted count">{{ repo.history.total }} commit</span>
    </div>
    <CommitList :root="root" />
  </section>
</template>

<style scoped>
.history { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--border); }
.search { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.search input { flex: 1; min-width: 0; }
.count { font-size: 12px; white-space: nowrap; }
</style>
```

`src/renderer/components/CommitDetail.vue` (provvisorio, completo nel Task 9):
```vue
<script setup lang="ts">
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
</script>

<template>
  <section class="detail">
    <p v-if="!repo.detail" class="muted">Seleziona un commit</p>
    <pre v-else data-testid="commit-message">{{ repo.detail.message }}</pre>
  </section>
</template>

<style scoped>
.detail { min-width: 0; min-height: 0; overflow: auto; padding: 12px; }
</style>
```

`src/renderer/components/RepoView.vue`:
```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRepoStore } from '../stores/repo'
import CommitDetail from './CommitDetail.vue'
import HistoryView from './HistoryView.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

const head = computed(() => {
  const info = repo.info
  if (!info) return ''
  if (info.branch) return info.branch
  return info.headSha ? `HEAD staccato (${info.headSha.slice(0, 7)})` : 'nessun commit'
})

onMounted(() => {
  if (!repo.history.version) void repo.loadHistory()
})
</script>

<template>
  <section class="repo">
    <header class="toolbar">
      <strong>{{ repo.info?.name }}</strong>
      <span class="branch" data-testid="repo-branch">{{ head }}</span>
      <span class="spacer" />
      <button aria-label="Aggiorna" @click="repo.refresh()">↻</button>
    </header>
    <p v-if="repo.error" class="error message">{{ repo.error }}</p>
    <div class="panes">
      <HistoryView :root="root" />
      <CommitDetail :root="root" />
    </div>
  </section>
</template>

<style scoped>
.repo { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.branch { padding: 1px 8px; border-radius: 10px; background: var(--bg-hover); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.message { margin: 0; padding: 6px 12px; border-bottom: 1px solid var(--border); }
.panes { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
</style>
```

In `src/renderer/App.vue`, la regola `.main { … overflow: auto; }` diventa `overflow: hidden`: ora lo scroll lo gestiscono la lista e il dettaglio.

- [ ] **Step 6: Esegui i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 8 test.

- [ ] **Step 7: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: lista dei commit con grafo, etichette dei ref, ricerca e aggiornamento automatico" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Dettaglio del commit e diff

**Files:**
- Modify: `src/renderer/components/CommitDetail.vue` (sostituito), `src/shared/shortcuts.ts`, `src/main/menu.ts`, `src/renderer/App.vue`
- Create: `src/renderer/components/DiffView.vue`, `src/renderer/actions/history.ts`
- Test: `test/e2e/history.spec.ts` (seconda parte)

**Interfaces:**
- Consumes: lo store del Task 8 e `diff-model`, `highlight` e `format` del Task 7.
- Produces:
  - gli id di azione `history.search` (⌘F / Ctrl+F), `commit.copySha`, `commit.copyMessage`, `diff.toggleSplit` e `diff.toggleWhitespace`;
  - i `data-testid` `file-row`, `diff-line-add`, `diff-line-del`, `diff-line-context`, `diff-split`, `diff-split-view`, `diff-whitespace` e `copy-sha`.

- [ ] **Step 1: Aggiungi il test E2E che fallisce in `test/e2e/history.spec.ts`**

```ts
test('dettaglio: file cambiati, diff unificato e affiancato, copia SHA', async () => {
  const repo = repoWithMerge()
  const { app, page } = await launch([repo])
  await page.getByTestId('commit-row').filter({ hasText: 'modifica su feature' }).click()
  await expect(page.getByTestId('file-row')).toHaveText(/file1\.txt/)
  await expect(page.getByTestId('diff-line-add')).toContainText('modificato')
  await expect(page.getByTestId('diff-line-context')).toContainText('1')

  await page.getByTestId('diff-split').click()
  await expect(page.getByTestId('diff-split-view')).toBeVisible()

  await page.getByTestId('copy-sha').click()
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(copied).toBe(git(repo, 'rev-parse', 'feature/x').trim())
  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:e2e -- test/e2e/history.spec.ts`
Expected: FAIL, perché `file-row` non esiste.

- [ ] **Step 3: Crea DiffView e il dettaglio completo**

`src/renderer/components/DiffView.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { DiffLine, FileDiff } from '../../shared/types'
import { renderSegments, splitRows, wordSegments } from '../history/diff-model'
import { highlighter } from '../history/highlight'

const props = defineProps<{ diff: FileDiff; split: boolean }>()
const emit = defineEmits<{ force: [] }>()

const highlight = computed(() => highlighter(props.diff.path))
const segments = computed(() => new Map(props.diff.hunks.flatMap((h) => [...wordSegments(h)])))
const sides = computed(() => (props.split ? props.diff.hunks.map((h) => ({ header: h.header, rows: splitRows(h) })) : []))

// ponytail: le righe con parole evidenziate perdono i colori della sintassi; unire le due cose quando servirà
function html(line: DiffLine): string {
  const s = segments.value.get(line)
  return s ? renderSegments(s) : highlight.value(line.text)
}

const sign = (line: DiffLine) => (line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' ')
</script>

<template>
  <div class="diff">
    <p v-if="diff.binary" class="note muted">File binario</p>
    <p v-else-if="diff.tooLarge" class="note">
      Diff troppo grande.
      <button @click="emit('force')">Mostra comunque</button>
    </p>
    <p v-else-if="!diff.hunks.length" class="note muted">Nessuna modifica al contenuto</p>
    <div v-else-if="!split" class="unified">
      <template v-for="(h, hi) in diff.hunks" :key="hi">
        <div class="hunk">{{ h.header }}</div>
        <div v-for="(l, li) in h.lines" :key="li" class="line" :class="l.type" :data-testid="`diff-line-${l.type}`">
          <span class="no">{{ l.oldNo ?? '' }}</span>
          <span class="no">{{ l.newNo ?? '' }}</span>
          <span class="sign">{{ sign(l) }}</span>
          <code v-html="html(l)" />
        </div>
      </template>
    </div>
    <div v-else class="split" data-testid="diff-split-view">
      <template v-for="(h, hi) in sides" :key="hi">
        <div class="hunk">{{ h.header }}</div>
        <div v-for="(r, ri) in h.rows" :key="ri" class="pair">
          <div class="line" :class="r.left?.type ?? 'empty'">
            <span class="no">{{ r.left?.oldNo ?? '' }}</span>
            <code v-if="r.left" v-html="html(r.left)" />
          </div>
          <div class="line" :class="r.right?.type ?? 'empty'">
            <span class="no">{{ r.right?.newNo ?? '' }}</span>
            <code v-if="r.right" v-html="html(r.right)" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diff { flex: 1; min-height: 0; overflow: auto; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.note { padding: 12px; font-family: system-ui, sans-serif; }
.hunk { padding: 2px 8px; color: var(--fg-muted); background: var(--bg-alt); }
.line { display: grid; grid-template-columns: 44px 44px 16px 1fr; line-height: 18px; content-visibility: auto; contain-intrinsic-size: auto 18px; }
.line code { white-space: pre; }
.no { padding-right: 6px; color: var(--fg-muted); text-align: right; user-select: none; }
.sign { color: var(--fg-muted); user-select: none; }
.add { background: var(--add-bg); }
.del { background: var(--del-bg); }
.empty { background: var(--bg-alt); }
.add :deep(mark) { background: var(--add-mark); color: inherit; }
.del :deep(mark) { background: var(--del-mark); color: inherit; }
.pair { display: grid; grid-template-columns: 1fr 1fr; }
.pair .line { grid-template-columns: 44px 1fr; overflow: hidden; }
</style>
```

`src/renderer/components/CommitDetail.vue` (sostituito):
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { formatDate } from '../history/format'
import { useRepoStore } from '../stores/repo'
import DiffView from './DiffView.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const commit = computed(() => repo.detail?.commit)
const lines = computed(() => repo.detail?.message.split('\n') ?? [])
const body = computed(() => lines.value.slice(1).join('\n').trim())
const showCommitter = computed(
  () => commit.value && (commit.value.committer !== commit.value.author || commit.value.commitTime !== commit.value.authorTime),
)
const copy = (text: string) => navigator.clipboard.writeText(text)
</script>

<template>
  <section class="detail">
    <p v-if="!repo.detail || !commit" class="muted center">Seleziona un commit</p>
    <template v-else>
      <header class="head">
        <div class="message" data-testid="commit-message">
          <strong>{{ lines[0] }}</strong>
          <pre v-if="body">{{ body }}</pre>
        </div>
        <dl>
          <dt>Autore</dt>
          <dd>{{ commit.author }} &lt;{{ commit.authorEmail }}&gt; · {{ formatDate(commit.authorTime) }}</dd>
          <template v-if="showCommitter">
            <dt>Committer</dt>
            <dd>{{ commit.committer }} &lt;{{ commit.committerEmail }}&gt; · {{ formatDate(commit.commitTime) }}</dd>
          </template>
          <dt>SHA</dt>
          <dd>
            <code>{{ commit.sha }}</code>
            <button class="small" data-testid="copy-sha" @click="copy(commit.sha)">Copia</button>
          </dd>
          <template v-if="commit.parents.length">
            <dt>Genitori</dt>
            <dd>
              <a v-for="p in commit.parents" :key="p" href="#" class="parent" @click.prevent="repo.select(p)">{{ p.slice(0, 7) }}</a>
            </dd>
          </template>
        </dl>
      </header>
      <ul class="files">
        <li
          v-for="f in repo.detail.files"
          :key="f.path"
          :class="{ selected: f.path === repo.selectedFile?.path }"
          data-testid="file-row"
          @click="repo.selectFile(f)"
        >
          <span class="status" :class="f.status">{{ f.status }}</span>
          <span class="path">{{ f.oldPath ? `${f.oldPath} → ${f.path}` : f.path }}</span>
          <span class="stat">
            <span class="plus">+{{ f.added ?? '–' }}</span>
            <span class="minus">−{{ f.deleted ?? '–' }}</span>
          </span>
        </li>
      </ul>
      <div class="diff-bar">
        <span class="path muted">{{ repo.selectedFile?.path }}</span>
        <button data-testid="diff-split" @click="repo.toggleSplit()">{{ repo.diffOptions.split ? 'Unificato' : 'Affiancato' }}</button>
        <label>
          <input type="checkbox" data-testid="diff-whitespace" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
          Ignora spazi
        </label>
      </div>
      <DiffView v-if="repo.diff" :diff="repo.diff" :split="repo.diffOptions.split" @force="repo.loadDiff(true)" />
    </template>
  </section>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.head { max-height: 35%; overflow: auto; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.message pre { margin: 6px 0 0; white-space: pre-wrap; font-family: inherit; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 10px 0 0; font-size: 12px; }
dt { color: var(--fg-muted); }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.small { padding: 0 6px; font-size: 11px; }
.parent { margin-right: 8px; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
.files { max-height: 25%; margin: 0; padding: 4px 0; overflow: auto; list-style: none; border-bottom: 1px solid var(--border); }
.files li { display: flex; align-items: center; gap: 8px; padding: 2px 12px; cursor: default; }
.files li:hover { background: var(--bg-hover); }
.files li.selected { background: var(--bg-hover); font-weight: 600; }
.status { width: 14px; font-weight: 700; text-align: center; }
.status.A { color: #2da44e; }
.status.D { color: var(--danger); }
.status.M { color: #bf8700; }
.status.R, .status.C { color: #8250df; }
.path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat { font-size: 11px; font-variant-numeric: tabular-nums; }
.plus { color: #2da44e; margin-right: 4px; }
.minus { color: var(--danger); }
.diff-bar { display: flex; align-items: center; gap: 10px; padding: 4px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.diff-bar .path { flex: 1; }
.diff-bar button { padding: 1px 8px; font-size: 12px; }
</style>
```

- [ ] **Step 4: Aggiungi azioni, scorciatoia e voce di menu**

In `src/shared/shortcuts.ts`, nella mappa `shortcuts`:
```ts
  'history.search': { key: 'f', mod: true },
```

`src/renderer/actions/history.ts`:
```ts
import { shortcuts } from '../../shared/shortcuts'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'

/** Azioni della storia e del diff, sul repo della tab attiva. */
export function registerHistoryActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const hasCommit = () => !!repo()?.detail

  registry.register(
    {
      id: 'history.search',
      title: 'Cerca nella storia',
      keys: shortcuts['history.search'],
      when: () => app.active !== null,
      run: () => document.querySelector<HTMLInputElement>('[data-testid="history-search"]')?.focus(),
    },
    { id: 'commit.copySha', title: 'Copia SHA del commit', when: hasCommit, run: () => navigator.clipboard.writeText(repo()?.detail?.commit.sha ?? '') },
    { id: 'commit.copyMessage', title: 'Copia messaggio del commit', when: hasCommit, run: () => navigator.clipboard.writeText(repo()?.detail?.message ?? '') },
    { id: 'diff.toggleSplit', title: 'Diff affiancato / unificato', when: hasCommit, run: () => repo()?.toggleSplit() },
    { id: 'diff.toggleWhitespace', title: 'Ignora spazi nel diff', when: hasCommit, run: () => repo()?.toggleWhitespace() },
  )
}
```

In `src/renderer/App.vue`, aggiungi `import { registerHistoryActions } from './actions/history'` e subito dopo `registerBuiltinActions()`:
```ts
registerHistoryActions()
```

In `src/main/menu.ts`, nel sottomenu `Vista`, dopo `action('Command palette', 'palette.open'),`:
```ts
        action('Cerca nella storia', 'history.search'),
```

- [ ] **Step 5: Esegui tutti i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 9 test.

- [ ] **Step 6: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: dettaglio del commit e diff unificato/affiancato con sintassi e parole evidenziate" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verifica su repo grande e su un repo reale

**Files:** nessuno, a meno che la verifica non trovi problemi.

- [ ] **Step 1: Prestazioni del main**

Run: `MERLINO_PERF=1 npx vitest run test/integration/history-perf.test.ts`
Expected: PASS, `load` sotto 2000 ms.

- [ ] **Step 2: Prima schermata e scroll nell'app, su 100.000 commit**

```bash
node scripts/make-big-repo.mjs "$TMPDIR/merlino-big" 100000
npx electron-vite build
```
Poi uno script Playwright temporaneo (non va committato) che:
1. apre `$TMPDIR/merlino-big`;
2. misura il tempo finché la prima `commit-row` contiene `commit`;
3. scorre la lista fino a metà e controlla che le righe compaiano;
4. salva due screenshot.

Expected: prima riga in meno di 2 secondi dall'apertura della finestra, righe presenti dopo lo scroll, grafo leggibile negli screenshot.

- [ ] **Step 3: Verifica completa**

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
```
Expected: tutto verde.
