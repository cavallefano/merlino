# Merlino — Stile della storia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La lista dei commit allineata al riferimento visivo:
- righe a due linee;
- grafo a quadrati con linee sottili e testo a scaletta;
- etichette piene a destra;
- numero di file cambiati;
- riga delle modifiche locali sempre in cima, collegata a HEAD da una linea tratteggiata.

**Architecture:**
- **Main**:
  - il tratteggio nasce nel layout del grafo: `History` passa a `layoutGraph` uno pseudo-commit con HEAD come genitore e `dashed: true`, e l'algoritmo delle corsie lo instrada fino a HEAD;
  - il numero di file arriva con una chiamata separata per pagina (`historyFileCounts`), con una cache per SHA.
- **Renderer**: `CommitList` lavora per indice di riga, dove la riga 0 è quella delle modifiche locali e la riga r è il commit r − 1. `graph-draw.ts` disegna quadrati, segmenti tratteggiati e curve brevi, e calcola dove comincia il testo di ogni riga.

**Tech Stack:** Electron 45, Vue 3 (`<script setup>`), Pinia, TypeScript, Vitest, Playwright; git ≥ 2.35.

Spec: `docs/superpowers/specs/2026-10-22-merlino-storia-stile-design.md`. Parte dal branch `feature/piano-4-branch-remote`; il lavoro va su `feature/storia-stile`.

## Global Constraints

- Altezza fissa della riga: `ROW_HEIGHT = 46`. Corsie: `LANE_WIDTH = 12`. Nodi quadrati da 8 px. Linee da 1,5 px. `MAX_LANES = 24`.
- La prima schermata della storia resta sotto i 2 s su 100k commit: `historyLoad` non deve aspettare il numero di file.
- Nessuna dipendenza nuova.
- Testi dell'interfaccia in italiano.
- `data-testid`:
  - `working-row` (riga delle modifiche locali) e `working-files` (il suo riquadro);
  - `commit-row` (solo le righe dei commit) e `commit-files` (riquadro dei file di un commit).
- Per i merge il numero di file si conta rispetto al primo genitore (`--diff-merges=first-parent`), come nel diff del dettaglio.
- Clean room: Sublime Merge è solo un riferimento visivo.

---

### Task 1: Linea tratteggiata dalle modifiche locali a HEAD nel layout del grafo

**Files:**
- Modify: `src/shared/types.ts` (interfaccia `GraphEdge`)
- Modify: `src/main/git/graph.ts`
- Modify: `src/main/history.ts` (`reload`)
- Test: `test/unit/graph.test.ts`, `test/integration/history.test.ts`

**Interfaces:**
- Produces:
  - `GraphEdge { from: number; to: number; dashed?: boolean }`, dove `dashed` è presente solo quando vale `true`;
  - `layoutGraph(commits: { sha: string; parents: string[]; dashed?: boolean }[])`;
  - le righe di `History.page()` contengono, dalla prima riga fino a HEAD, segmenti con `dashed: true` nella corsia 0. La riga dello pseudo-commit non c'è: è sempre `{ lane: 0, up: [] }` e la ricostruisce il renderer.

- [ ] **Step 1: Test unit del layout con lo pseudo-commit tratteggiato**

In `test/unit/graph.test.ts`, dentro `describe('layoutGraph', …)`:

```ts
  it('pseudo-commit tratteggiato: la linea arriva a HEAD nella corsia 0', () => {
    const { rows } = layoutGraph([{ sha: 'W', parents: ['C'], dashed: true }, c('C', 'B'), c('B')])
    expect(rows).toEqual([
      { lane: 0, up: [] },
      { lane: 0, up: [{ from: 0, to: 0, dashed: true }] },
      { lane: 0, up: [{ from: 0, to: 0 }] },
    ])
  })

  it('HEAD non è il primo commit: il branch più recente non si appoggia alla linea tratteggiata', () => {
    // X è figlio di H (HEAD) su un altro branch: il suo legame con H resta pieno
    const { rows } = layoutGraph([{ sha: 'W', parents: ['H'], dashed: true }, c('X', 'H'), c('H', 'A'), c('A')])
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0, 0])
    expect(rows[1].up).toEqual([{ from: 0, to: 0, dashed: true }])
    expect(rows[2].up).toEqual([{ from: 0, to: 0, dashed: true }, { from: 1, to: 0 }])
    expect(rows[3].up).toEqual([{ from: 0, to: 0 }])
  })

  it('pseudo-commit senza HEAD (repo vuoto): nessuna linea', () => {
    expect(layoutGraph([{ sha: 'W', parents: [], dashed: true }]).rows).toEqual([{ lane: 0, up: [] }])
  })

  it('su 2000 commit casuali la linea tratteggiata è continua fino a HEAD e poi sparisce', () => {
    const commits = randomHistory(2000, 7)
    const head = commits[300]
    const { rows } = layoutGraph([{ sha: 'W', parents: [head.sha], dashed: true }, ...commits])
    const headRow = 301
    expect(rows[headRow].lane).toBe(0)
    for (let r = 1; r <= headRow; r++) expect(rows[r].up.filter((e) => e.dashed)).toEqual([{ from: 0, to: 0, dashed: true }])
    for (let r = headRow + 1; r < rows.length; r++) expect(rows[r].up.some((e) => e.dashed)).toBe(false)
  })
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `npx vitest run test/unit/graph.test.ts`
Expected: i 4 test nuovi falliscono, perché `dashed` non viene propagato e X si appoggia alla corsia di H. I 4 test esistenti passano.

- [ ] **Step 3: `GraphEdge.dashed` e corsie tratteggiate in `layoutGraph`**

In `src/shared/types.ts`:

```ts
/** Segmento del grafo dalla riga precedente (colonna from) a questa riga (colonna to). */
export interface GraphEdge {
  from: number
  to: number
  /** Linea tratteggiata dalle modifiche locali a HEAD. */
  dashed?: boolean
}
```

In `src/main/git/graph.ts`:
- `Lane` prende `dashed: boolean`;
- i segmenti escono con `edge()`;
- le corsie che proseguono mantengono `dashed`;
- i genitori di un commit `dashed` aprono corsie tratteggiate;
- un genitore vero non si unisce mai a una corsia tratteggiata.

```ts
import type { GraphEdge, GraphRow } from '../../shared/types'

interface Lane {
  /** Commit atteso in questa colonna. */
  sha: string
  /** Colonna da cui parte il segmento verso la riga successiva. */
  from: number
  /** Aperta da un commit con dashed (la riga delle modifiche locali). */
  dashed: boolean
}

const edge = (from: number, to: number, dashed: boolean): GraphEdge => (dashed ? { from, to, dashed } : { from, to })

/**
 * Colonne del grafo. I commit devono avere i figli prima dei genitori (git log --date-order).
 * Ogni commit prende la colonna di un figlio; il primo genitore prosegue nella stessa colonna.
 * Un commit con dashed apre corsie tratteggiate, a cui i genitori degli altri commit non si uniscono.
 */
export function layoutGraph(commits: { sha: string; parents: string[]; dashed?: boolean }[]): { rows: GraphRow[]; lanes: number } {
  const lanes: (Lane | null)[] = []
  let joins: { from: number; lane: number; dashed: boolean }[] = []
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
      if (l) up.push(edge(l.from, target(j), l.dashed))
    })
    for (const j of joins) up.push(edge(j.from, target(j.lane), j.dashed))
    joins = []

    // Le corsie che aspettavano questo commit finiscono qui, le altre proseguono dritte
    lanes.forEach((l, j) => {
      if (l) lanes[j] = l.sha === commit.sha ? null : { ...l, from: j }
    })

    const dashed = commit.dashed === true
    commit.parents.forEach((parent, i) => {
      const m = lanes.findIndex((l) => l?.sha === parent && !l.dashed)
      if (i === 0 && (m === -1 || m > k)) lanes[k] = { sha: parent, from: k, dashed }
      else if (m !== -1) joins.push({ from: k, lane: m, dashed })
      else lanes[free()] = { sha: parent, from: k, dashed }
    })
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    rows.push({ lane: k, up })
    width = Math.max(width, k + 1, lanes.length)
  }
  return { rows, lanes: width }
}
```

- [ ] **Step 4: Lancia i test unit e verifica che passino**

Run: `npx vitest run test/unit/graph.test.ts`
Expected: 8 test passati.

- [ ] **Step 5: Test di integrazione su `History`**

In `test/integration/history.test.ts`, dentro `describe('History', …)`:

```ts
  it('linea tratteggiata dalle modifiche locali a HEAD, nella corsia 0', async () => {
    const repo = makeRepo(2)
    git(repo, 'switch', '-q', '-c', 'altro')
    writeFileSync(join(repo, 'y.txt'), 'y\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'su altro')
    git(repo, 'switch', '-q', 'main')
    const h = history(repo)
    await h.load('')
    const { commits, rows } = h.page(0, 3)
    expect(commits.map((c) => c.subject)).toEqual(['su altro', 'commit 2', 'commit 1'])
    expect(rows).toEqual([
      { lane: 1, up: [{ from: 0, to: 0, dashed: true }] },
      { lane: 0, up: [{ from: 0, to: 0, dashed: true }, { from: 1, to: 0 }] },
      { lane: 0, up: [{ from: 0, to: 0 }] },
    ])
  })
```

Run: `npx vitest run test/integration/history.test.ts`
Expected: il test nuovo fallisce (oggi `su altro` sta nella corsia 0 senza segmenti); gli altri passano.

- [ ] **Step 6: Lo pseudo-commit in `History.reload`**

In `src/main/history.ts`, nel ramo senza ricerca:

```ts
      if (query) {
        this.rows = this.commits.map(() => ({ lane: 0, up: [] }))
        this.lanes = 0
      } else {
        // Riga delle modifiche locali: uno pseudo-commit sopra tutti, con la linea tratteggiata fino a HEAD.
        // La sua riga ({ lane: 0, up: [] }) la ricostruisce il renderer.
        const headSha = head.stdout.trim()
        const graph = layoutGraph([{ sha: '', parents: headSha ? [headSha] : [], dashed: true }, ...this.commits])
        this.rows = graph.rows.slice(1)
        this.lanes = graph.lanes
      }
```

(`head` esiste già: è il risultato di `rev-parse -q --verify HEAD` all'inizio di `reload`.)

- [ ] **Step 7: Lancia i test e verifica che passino**

Run: `npx vitest run test/unit/graph.test.ts test/integration/history.test.ts`
Expected: tutti passati. Il primo test di `History` resta con `lanes: 1`, perché HEAD è il commit più recente.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/git/graph.ts src/main/history.ts test/unit/graph.test.ts test/integration/history.test.ts
git commit -m "feat: linea tratteggiata dalle modifiche locali a HEAD nel layout del grafo"
```

---

### Task 2: Numero di file cambiati per commit (main e IPC)

**Files:**
- Modify: `src/main/git/log.ts` (aggiunge `parseFileCounts`)
- Modify: `src/main/history.ts` (aggiunge `fileCounts`)
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts`
- Test: `test/unit/log.test.ts`, `test/integration/history.test.ts`, `test/e2e/history-api.spec.ts`

**Interfaces:**
- Produces:
  - `parseFileCounts(out: string): Map<string, number>`;
  - `History.fileCounts(start: number, count: number): Promise<Record<string, number>>`;
  - `Api.historyFileCounts(root: string, start: number, count: number): Promise<Result<Record<string, number>>>`, sul canale `Channels.historyFileCounts = 'history:file-counts'`.

- [ ] **Step 1: Test unit del parser**

In `test/unit/log.test.ts` (aggiungi `parseFileCounts` all'import da `../../src/main/git/log`):

```ts
describe('parseFileCounts', () => {
  it('numero di file per SHA; 0 senza riga di shortstat (merge senza modifiche)', () => {
    const out = '\0aaa\n\n 2 files changed, 2 insertions(+), 1 deletion(-)\n\0bbb\n\0ccc\n\n 1 file changed, 1 insertion(+)\n'
    expect(parseFileCounts(out)).toEqual(new Map([['aaa', 2], ['bbb', 0], ['ccc', 1]]))
  })
})
```

Run: `npx vitest run test/unit/log.test.ts`
Expected: FAIL, `parseFileCounts` non esiste.

- [ ] **Step 2: `parseFileCounts` in `src/main/git/log.ts`**

```ts
/** Output di log --format=%x00%H --shortstat: da SHA a numero di file cambiati (0 se manca la riga di shortstat). */
export function parseFileCounts(out: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const block of out.split('\0')) {
    const [sha = '', ...rest] = block.split('\n')
    if (sha) counts.set(sha, Number(/(\d+) files? changed/.exec(rest.join('\n'))?.[1] ?? 0))
  }
  return counts
}
```

Run: `npx vitest run test/unit/log.test.ts`
Expected: PASS.

- [ ] **Step 3: Test di integrazione di `History.fileCounts`**

In `test/integration/history.test.ts` (servono `History` e `GitRunner`, già importati):

```ts
  it('numero di file: commit normale, merge sul primo genitore, merge vuoto; la seconda volta dalla cache', async () => {
    const repo = makeRepo(1)
    git(repo, 'switch', '-q', '-c', 'f')
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'due file')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', 'f', '-m', 'merge con modifiche')
    git(repo, 'switch', '-q', '-c', 'g')
    writeFileSync(join(repo, 'c.txt'), 'c\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'su g')
    git(repo, 'switch', '-q', 'main')
    git(repo, 'merge', '-q', '--no-ff', '-s', 'ours', 'g', '-m', 'merge vuoto')

    const calls: string[][] = []
    const h = new History(new GitRunner(() => 'git', repo, (e) => calls.push(e.args)))
    const { total } = await h.load('')
    const counts = await h.fileCounts(0, total)
    const bySubject = Object.fromEntries(h.page(0, total).commits.map((c) => [c.subject, counts[c.sha]]))
    expect(bySubject).toEqual({ 'merge vuoto': 0, 'su g': 1, 'merge con modifiche': 2, 'due file': 2, 'commit 1': 1 })

    const before = calls.length
    expect(await h.fileCounts(0, total)).toEqual(counts)
    expect(calls.length).toBe(before)
  })
```

Run: `npx vitest run test/integration/history.test.ts`
Expected: FAIL, `h.fileCounts` non è una funzione.

- [ ] **Step 4: `History.fileCounts`**

In `src/main/history.ts`, importa `parseFileCounts` da `./git/log` e aggiungi alla classe:

```ts
  /** Il numero di file di uno SHA non cambia: la cache non scade. */
  private readonly fileCountCache = new Map<string, number>()

  /** File cambiati dai commit [start, start + count), per i merge rispetto al primo genitore; da SHA a numero. */
  async fileCounts(start: number, count: number): Promise<Record<string, number>> {
    const shas = this.commits.slice(start, start + count).map((c) => c.sha)
    const missing = shas.filter((sha) => !this.fileCountCache.has(sha))
    if (missing.length) {
      const out = await this.runner.run(
        ['log', '--stdin', '--no-walk=unsorted', '--format=%x00%H', '--shortstat', '--diff-merges=first-parent'],
        { stdin: `${missing.join('\n')}\n` },
      )
      for (const [sha, n] of parseFileCounts(out.stdout)) this.fileCountCache.set(sha, n)
    }
    return Object.fromEntries(shas.map((sha) => [sha, this.fileCountCache.get(sha) ?? 0]))
  }
```

Run: `npx vitest run test/integration/history.test.ts`
Expected: PASS.

- [ ] **Step 5: IPC**

In `src/shared/ipc.ts`:
- in `Channels`, dopo `historyPage`: `historyFileCounts: 'history:file-counts',`;
- in `Api`, dopo `historyPage`:

```ts
  /** File cambiati dai commit [start, start + count) della storia caricata, da SHA a numero. */
  historyFileCounts(root: string, start: number, count: number): Promise<Result<Record<string, number>>>
```

In `src/preload/index.ts`, dopo `historyPage`:

```ts
  historyFileCounts: (root, start, count) => ipcRenderer.invoke(Channels.historyFileCounts, root, start, count),
```

In `src/main/ipc-handlers.ts`, dopo l'handler di `historyPage`:

```ts
  ipcMain.handle(Channels.historyFileCounts, (_e, root: unknown, start: unknown, count: unknown) =>
    withSession(root, (s) => s.history.fileCounts(int(start, 'start', Number.MAX_SAFE_INTEGER), int(count, 'count', MAX_PAGE))),
  )
```

- [ ] **Step 6: E2E dell'API**

In `test/e2e/history-api.spec.ts`, dentro il test esistente, dopo `expect(history.value.commits.map((c) => c.subject)).toEqual(['commit 2', 'commit 1'])` (riga 20). Il file usa già l'oggetto `a = { repo, sha }` e il tipo `Win`:

```ts
  const counts = await page.evaluate((x) => (globalThis as unknown as Win).api.historyFileCounts(x.repo, 0, 10), a)
  expect(counts).toMatchObject({ ok: true, value: { [history.value.commits[0].sha]: 1, [history.value.commits[1].sha]: 1 } })
  const badCount = await page.evaluate((x) => (globalThis as unknown as Win).api.historyFileCounts(x.repo, -1, 10), a)
  expect(badCount.ok).toBe(false)
```

Run: `npm run typecheck && npx electron-vite build && npx playwright test test/e2e/history-api.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/git/log.ts src/main/history.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc-handlers.ts test/unit/log.test.ts test/integration/history.test.ts test/e2e/history-api.spec.ts
git commit -m "feat: numero di file cambiati per commit, a pagine e con cache per SHA"
```

---

### Task 3: Lista dei commit a due linee, grafo a quadrati e riga delle modifiche locali

**Files:**
- Modify: `src/renderer/history/graph-draw.ts` (riscritto)
- Modify: `src/renderer/components/CommitList.vue` (riscritto)
- Modify: `src/renderer/components/HistoryView.vue` (via la riga delle modifiche locali)
- Modify: `src/renderer/stores/repo.ts` (numero di file)
- Modify: `src/renderer/styles.css` (colori delle etichette e della selezione)
- Test: `test/e2e/history.spec.ts`, `test/e2e/working.spec.ts`

**Interfaces:**
- Consumes:
  - `GraphEdge.dashed` (Task 1);
  - `Api.historyFileCounts` (Task 2);
  - dallo store: `repo.rowAt(i)`, `repo.commitAt(i)`, `repo.history`, `repo.status`, `repo.changeCount`, `repo.selectWorking()`, `repo.select(sha, index)`, `repo.move(step)`, `repo.view`, `repo.selected`, `repo.selectedIndex`, `repo.ensureRows(start, end)`.
- Produces:
  - `repo.fileCountOf(sha: string): number | undefined`;
  - in `graph-draw.ts`: `ROW_HEIGHT`, `LANE_WIDTH`, `MAX_LANES`, `laneColor(lane)`, `type NodeKind = 'commit' | 'merge'`, `graphRight(rowAt, i): number`, `drawGraph(ctx, rowAt, nodeAt, first, last)`.

- [ ] **Step 1: Aggiorna i test E2E**

In `test/e2e/working.spec.ts`:
- riga 22: `await expect(page.getByTestId('working-row')).toBeHidden()` diventa
  ```ts
  await expect(page.getByTestId('working-row')).toContainText('Nessuna modifica')
  ```
- riga 76: `await expect(page.getByTestId('working-row')).toContainText('(1)')` diventa
  ```ts
  await expect(page.getByTestId('working-files')).toHaveText('1')
  ```
- riga 80: `await expect(page.getByTestId('working-row')).toBeVisible()` diventa la riga sotto. Dopo il pop tornano `.gitignore` (non tracciato) e `file1.txt` (modificato); `debug.log` ora è ignorato.
  ```ts
  await expect(page.getByTestId('working-files')).toHaveText('2')
  ```

In `test/e2e/history.spec.ts`, nel primo test, dopo `await expect(rows).toHaveCount(3)`:

```ts
  await expect(page.getByTestId('working-row')).toContainText('Nessuna modifica')
  // il merge conta i file rispetto al primo genitore: solo file1.txt
  await expect(rows.first().getByTestId('commit-files')).toHaveText('1')
  await expect(rows.filter({ hasText: 'modifica su feature' }).getByTestId('commit-files')).toHaveText('1')
```

Run: `npx electron-vite build && npx playwright test test/e2e/history.spec.ts test/e2e/working.spec.ts`
Expected: FAIL. `commit-files` e `working-files` non esistono, e la riga delle modifiche locali senza modifiche è nascosta.

- [ ] **Step 2: Numero di file nello store**

In `src/renderer/stores/repo.ts`, dopo `const loading = new Set<string>()`:

```ts
    // Numero di file cambiati per SHA: arriva dopo le pagine, countsTick fa ridisegnare le righe
    const countsTick = ref(0)
    const fileCounts = new Map<string, number>()
```

In `ensureRows`, dentro il `.then` della pagina, dopo `pagesTick.value++`:

```ts
              void loadFileCounts(p)
```

E dopo `ensureRows`:

```ts
    async function loadFileCounts(p: number) {
      const r = await window.api.historyFileCounts(root, p * PAGE_SIZE, PAGE_SIZE)
      if (!r.ok) return
      for (const [sha, n] of Object.entries(r.value)) fileCounts.set(sha, n)
      countsTick.value++
    }

    function fileCountOf(sha: string): number | undefined {
      void countsTick.value
      return fileCounts.get(sha)
    }
```

Aggiungi `fileCountOf` al `return` dello store, nella riga con `commitAt, rowAt`.

- [ ] **Step 3: `graph-draw.ts`**

Sostituisci il contenuto di `src/renderer/history/graph-draw.ts`:

```ts
import type { GraphRow } from '../../shared/types'

export const ROW_HEIGHT = 46
export const LANE_WIDTH = 12
/** Oltre queste colonne il grafo viene tagliato. */
export const MAX_LANES = 24
const NODE = 8
const LINE = 1.5
/** Altezza delle curve nei cambi di corsia: il resto del segmento è verticale. */
const CURVE = 14
const COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#22c55e', '#ef4444']

export type NodeKind = 'commit' | 'merge'
type RowAt = (i: number) => GraphRow | undefined

export const laneColor = (lane: number): string => COLORS[lane % COLORS.length] ?? '#888'
const laneX = (lane: number) => 6 + LANE_WIDTH / 2 + lane * LANE_WIDTH

/** Dove finisce il grafo nella riga i: dopo il nodo, i segmenti che arrivano e quelli che partono verso la riga successiva. */
export function graphRight(rowAt: RowAt, i: number): number {
  const row = rowAt(i)
  if (!row) return 0
  let max = row.lane
  for (const e of [...row.up, ...(rowAt(i + 1)?.up ?? [])]) max = Math.max(max, e.from, e.to)
  return laneX(Math.min(max, MAX_LANES - 1)) + LANE_WIDTH / 2
}

/** Disegna le righe da first a last; la riga first è in cima al canvas. */
export function drawGraph(ctx: CanvasRenderingContext2D, rowAt: RowAt, nodeAt: (i: number) => NodeKind | undefined, first: number, last: number): void {
  const y = (i: number) => (i - first) * ROW_HEIGHT + ROW_HEIGHT / 2
  ctx.lineWidth = LINE
  // Anche la riga dopo l'ultima: i suoi segmenti partono dall'ultima riga visibile
  for (let i = first; i <= last + 1; i++) {
    const above = rowAt(i - 1)?.lane
    for (const e of rowAt(i)?.up ?? []) {
      const [x0, x1, y0, y1] = [laneX(e.from), laneX(e.to), y(i - 1), y(i)]
      ctx.strokeStyle = laneColor(Math.max(e.from, e.to))
      ctx.setLineDash(e.dashed ? [3, 3] : [])
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      if (e.from === e.to) {
        ctx.lineTo(x1, y1)
      } else if (e.from === above) {
        // Si apre dal nodo sopra: curva subito sotto il nodo, poi dritta
        ctx.bezierCurveTo(x0, y0 + CURVE / 2, x1, y0 + CURVE / 2, x1, y0 + CURVE)
        ctx.lineTo(x1, y1)
      } else {
        // Confluisce nel nodo di questa riga: dritta, poi curva subito sopra il nodo
        ctx.lineTo(x0, y1 - CURVE)
        ctx.bezierCurveTo(x0, y1 - CURVE / 2, x1, y1 - CURVE / 2, x1, y1)
      }
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  const h = NODE / 2
  for (let i = first; i <= last; i++) {
    const row = rowAt(i)
    const kind = nodeAt(i)
    if (!row || !kind) continue
    const [cx, cy] = [laneX(row.lane), y(i)]
    if (kind === 'merge') {
      // Quadrato vuoto: si cancellano le linee sotto, così si vede lo sfondo della riga (anche se selezionata)
      ctx.clearRect(cx - h, cy - h, NODE, NODE)
      ctx.strokeStyle = laneColor(row.lane)
      ctx.strokeRect(cx - h + LINE / 2, cy - h + LINE / 2, NODE - LINE, NODE - LINE)
    } else {
      ctx.fillStyle = laneColor(row.lane)
      ctx.fillRect(cx - h, cy - h, NODE, NODE)
    }
  }
}
```

- [ ] **Step 4: `CommitList.vue`**

Sostituisci il contenuto di `src/renderer/components/CommitList.vue`:

```vue
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Commit, GraphRow } from '../../shared/types'
import { commitMenu } from '../actions/branches'
import { formatShortDate } from '../history/format'
import { drawGraph, graphRight, laneColor, type NodeKind, ROW_HEIGHT } from '../history/graph-draw'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const scroller = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const scrollTop = ref(0)
const viewHeight = ref(0)
const OVERSCAN = 10
/** Margine sinistro del testo senza grafo (durante una ricerca). */
const PADDING = 10
/** Spazio fra il grafo e il testo. */
const GAP = 8

// Righe della lista: la 0 è quella delle modifiche locali, la r è il commit r − 1
const WORKING_ROW: GraphRow = { lane: 0, up: [] }
const rowCount = computed(() => repo.history.total + 1)
const hasGraph = computed(() => repo.history.lanes > 0)
const rowAt = (r: number): GraphRow | undefined => (!hasGraph.value ? undefined : r === 0 ? WORKING_ROW : repo.rowAt(r - 1))
const nodeAt = (r: number): NodeKind | undefined => {
  if (r === 0) return 'commit'
  const commit = repo.commitAt(r - 1)
  return commit && (commit.parents.length > 1 ? 'merge' : 'commit')
}

const first = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN))
const last = computed(() =>
  Math.min(rowCount.value - 1, Math.ceil((scrollTop.value + viewHeight.value) / ROW_HEIGHT) + OVERSCAN),
)
const visible = computed(() =>
  Array.from({ length: Math.max(0, last.value - first.value + 1) }, (_, k) => {
    const r = first.value + k
    return { r, commit: r === 0 ? undefined : repo.commitAt(r - 1) }
  }),
)
// Larghezza del canvas dalle sole righe visibili; il testo di ogni riga parte dopo il suo grafo (a scaletta)
const graphWidth = computed(() => {
  if (!hasGraph.value) return 0
  let max = 0
  for (let r = first.value; r <= last.value; r++) max = Math.max(max, graphRight(rowAt, r))
  return max + 2
})
const textLeft = (r: number) => (hasGraph.value ? graphRight(rowAt, r) + GAP : PADDING)

const workingSummary = computed(() => {
  const s = repo.status
  if (!s || !repo.changeCount) return 'Nessuna modifica'
  const parts: [number, string, string][] = [
    [s.staged.length, 'in stage', 'in stage'],
    [s.unstaged.length, 'modificato', 'modificati'],
    [s.untracked.length, 'non tracciato', 'non tracciati'],
    [s.conflicted.length, 'in conflitto', 'in conflitto'],
  ]
  return parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(' · ')
})

const isSelected = (r: number, commit?: Commit) =>
  r === 0 ? repo.view === 'working' : repo.view === 'commit' && commit?.sha === repo.selected
const isHead = (commit: Commit) => commit.refs.some((ref) => ref.current)

watch([first, last, () => repo.history.version], () => void repo.ensureRows(Math.max(0, first.value - 1), last.value - 1), {
  immediate: true,
})
watch([first, last, () => repo.pagesTick, graphWidth], () => void nextTick(draw))
watch(
  () => repo.selectedIndex,
  (i) => {
    if (i >= 0) reveal(i + 1)
  },
)
watch(
  () => repo.view,
  (view) => {
    if (view === 'working') reveal(0)
  },
)

function reveal(r: number) {
  const el = scroller.value
  if (!el) return
  const top = r * ROW_HEIGHT
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight
}

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
  drawGraph(ctx, rowAt, nodeAt, first.value, last.value)
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

function select(r: number) {
  scroller.value?.focus()
  if (r === 0) {
    void repo.selectWorking()
    return
  }
  const commit = repo.commitAt(r - 1)
  if (commit) void repo.select(commit.sha, r - 1)
}

function onKey(e: KeyboardEvent) {
  const working = repo.view === 'working'
  if (e.key === 'ArrowDown') {
    if (working) select(1)
    else repo.move(1)
  } else if (e.key === 'ArrowUp') {
    if (!working && repo.selectedIndex === 0) select(0)
    else if (!working) repo.move(-1)
  } else {
    return
  }
  e.preventDefault()
}

function openMenu(r: number) {
  const commit = r > 0 ? repo.commitAt(r - 1) : undefined
  if (!commit) return
  select(r)
  void commitMenu(repo, commit)
}
</script>

<template>
  <div ref="scroller" class="list" tabindex="0" data-testid="commit-list" @scroll="onScroll" @keydown="onKey">
    <div class="content" :style="{ height: `${rowCount * ROW_HEIGHT}px` }">
      <canvas v-if="graphWidth" ref="canvas" class="graph" :style="{ top: `${first * ROW_HEIGHT}px` }" />
      <p v-if="repo.history.version && !repo.history.total" class="muted empty" :style="{ top: `${ROW_HEIGHT}px` }">Nessun commit</p>
      <div
        v-for="{ r, commit } in visible"
        :key="r"
        class="row"
        :class="{ selected: isSelected(r, commit) }"
        :style="{ top: `${r * ROW_HEIGHT}px`, paddingLeft: `${textLeft(r)}px` }"
        :data-testid="r === 0 ? 'working-row' : 'commit-row'"
        @click="select(r)"
        @contextmenu.prevent="openMenu(r)"
      >
        <template v-if="r === 0">
          <div class="line">
            <span class="subject">{{ workingSummary }}</span>
            <span v-if="repo.changeCount" class="files" data-testid="working-files">{{ repo.changeCount }}</span>
          </div>
          <div class="line">
            <span class="author">Modifiche locali</span>
          </div>
        </template>
        <template v-else-if="commit">
          <div class="line">
            <span class="subject" :class="{ head: isHead(commit) }">{{ commit.subject }}</span>
            <span v-if="repo.fileCountOf(commit.sha)" class="files" data-testid="commit-files">{{ repo.fileCountOf(commit.sha) }}</span>
          </div>
          <div class="line">
            <span class="author">{{ commit.author }}</span>
            <span class="spacer" />
            <template v-if="commit.refs.length">
              <span
                v-for="ref in commit.refs"
                :key="`${ref.kind}:${ref.name}`"
                class="ref"
                :class="[ref.kind, { current: ref.current }]"
                :style="ref.kind === 'remote' ? { borderLeftColor: laneColor(rowAt(r)?.lane ?? 0) } : undefined"
                :title="ref.name"
              >{{ ref.name }}</span>
            </template>
            <span v-else class="date">{{ formatShortDate(commit.authorTime) }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list { position: relative; flex: 1; min-height: 0; overflow: auto; outline: none; }
.content { position: relative; }
.graph { position: absolute; left: 0; z-index: 1; pointer-events: none; }
.row { position: absolute; left: 0; right: 0; height: 46px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding-right: 10px; cursor: default; }
.row:hover { background: var(--bg-hover); }
.row.selected { background: var(--selected-bg); }
.line { display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; }
.subject { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.subject.head { font-weight: 700; }
.files { flex: none; padding: 0 5px; border-radius: 4px; background: var(--bg-hover); font-size: 11px; line-height: 16px; font-variant-numeric: tabular-nums; }
/* L'autore tiene la sua larghezza (fino al 40%): si accorciano prima le etichette */
.author { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; font-style: italic; color: var(--fg-muted); }
.date { flex: none; font-size: 12px; color: var(--fg-muted); font-variant-numeric: tabular-nums; }
.ref { flex: 0 1 auto; min-width: 24px; overflow: hidden; text-overflow: ellipsis; padding: 0 6px; border-radius: 4px; font-size: 11px; line-height: 17px; }
.ref.tag { background: var(--ref-tag-bg); color: var(--ref-tag-fg); }
.ref.branch { background: var(--accent); color: var(--accent-fg); }
.ref.remote { background: var(--ref-remote-bg); border-left: 3px solid; padding-left: 5px; }
.ref.head { border: 1px solid var(--accent); color: var(--accent); }
.ref.current { font-weight: 700; }
.empty { position: absolute; left: 0; margin: 0; padding: 12px; }
</style>
```

- [ ] **Step 5: Via la riga delle modifiche locali da `HistoryView.vue`**

In `src/renderer/components/HistoryView.vue` togli il blocco `<div v-if="repo.changeCount" class="working-row" …>…</div>` e le regole CSS `.working-row`, `.working-row:hover`, `.working-row.selected`, `.working-row.selected .muted`, `.dot`, `.working-row.selected .dot`. Il resto (ricerca, conteggio, `CommitList`) non cambia.

- [ ] **Step 6: Colori in `styles.css`**

In `:root` di `src/renderer/styles.css`, dopo `--del-mark`:

```css
  --selected-bg: hsl(170 70% 32% / 0.14);
  --ref-tag-bg: #f6c343;
  --ref-tag-fg: #3a2c00;
  --ref-remote-bg: #e3e6ea;
```

E nel blocco `@media (prefers-color-scheme: dark)`, dopo `--del-mark`:

```css
    --selected-bg: hsl(170 55% 50% / 0.18);
    --ref-tag-bg: #b8901f;
    --ref-tag-fg: #1b1500;
    --ref-remote-bg: #353a42;
```

- [ ] **Step 7: Lancia i test**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde. Prima passano i test modificati nello Step 1; anche `branches.spec.ts` (usa `working-row` e `commit-row`) e `actions.spec.ts` non cambiano esito.

- [ ] **Step 8: Commit**

```bash
git add src/renderer test/e2e/history.spec.ts test/e2e/working.spec.ts
git commit -m "feat: lista dei commit a due linee con grafo a quadrati, etichette a destra, numero di file e modifiche locali tratteggiate verso HEAD"
```

---

### Task 4: Verifica

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run test:e2e`. Expected: tutto verde.
- [ ] **Step 2:** `MERLINO_PERF=1 npx vitest run test/integration/history-perf.test.ts`. Expected: `load` sotto i 2000 ms su 100k commit.
- [ ] **Step 3:** su una copia di `demo-backend` (clone in una cartella temporanea, mai il repo originale), screenshot della lista in tema chiaro e scuro (`page.emulateMedia({ colorScheme: 'dark' })`), da confrontare con il riferimento. Va controllato:
  - il quadrato vuoto sui merge e quello pieno sugli altri commit;
  - il tratteggio dalle modifiche locali a HEAD;
  - il testo a scaletta;
  - le etichette piene a destra;
  - il numero di file;
  - la data sulle righe senza etichette.
- [ ] **Step 4:** annota l'esito in fondo a questo piano e committa.
