# Merlino — Avanzamento delle pipeline nelle pull request — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nella lista delle pull request aperte, una barra di avanzamento per le pipeline in corso; nel dettaglio, una scheda Controlli con i job divisi per stage (GitLab) o workflow (GitHub), leggibile anche con centinaia di job.

**Architecture:**
- **Main**: i provider danno per ogni job stato (con la coda), gruppo e tempi, già nell'ordine della pipeline.
- **Renderer**: funzioni pure in `pull-requests/model.ts` calcolano avanzamento, gruppi e durate. `CiProgress.vue` (barra e testo) serve sia la lista sia la scheda; `CiChecks.vue` mostra filtro e gruppi.
- **Store**: tiene `now` per le durate e ricontrolla ogni 30 s le pipeline attive.

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, Vitest, Playwright con il server finto di `test/e2e/fake-hosting.ts`.

Spec: `docs/superpowers/specs/2026-10-23-merlino-pipeline-progress-design.md`. Branch: `feature/pipeline-progress`, che parte da `feature/pull-requests`.

## Global Constraints

- **Stati di un job**: `passed`, `failed`, `running`, `queued`, `skipped`, `cancelled`.
- **Finiti**: superati, falliti, saltati, annullati. **Attiva** = almeno un job in corso o in coda.
- **Testo dell'avanzamento**: `finiti/totale · gruppo in corso · durata`; con job falliti il gruppo lascia il posto a "N failed".
- **Limiti**: GitHub check run fino a 1000; GitLab job fino a 1000. Il controllo periodico resta ogni 30 s.
- **Durate**: "40 s", "6 min", "1 h 12 min". I simboli delle unità sono gli stessi in inglese e in italiano, quindi niente chiavi di traduzione (piccola deviazione dalla spec: `formatDuration` sta in `model.ts`, pura e testabile, non in `history/format.ts`).
- **Test**: finestra nascosta (`MERLINO_E2E=1`), nomi fittizi, nessuna rete vera.

---

### Task 1: Stati, gruppi e tempi dei job nei provider

**Files:**
- Modify: `src/shared/types.ts`, `src/main/hosting/provider.ts`, `src/main/hosting/http.ts`, `src/main/hosting/github.ts`, `src/main/hosting/gitlab.ts`
- Test: `test/unit/hosting.test.ts`, `test/unit/http.test.ts`, `test/unit/github.test.ts`, `test/unit/gitlab.test.ts`

**Interfaces:**
- Produces:
  - `CheckState` con `'queued'`;
  - `Check { name; state; url; group: string | null; startedAt: number | null; finishedAt: number | null }`;
  - `HostingClient.all<T>(path, max, items?: (page: unknown) => T[])`;
  - `optionalSeconds(iso): number | null` in `provider.ts`;
  - i `checks` di `CiStatus` arrivano già nell'ordine dei gruppi.

- [ ] **Step 1: Test unit**

In `test/unit/hosting.test.ts`, nel `describe('ciSummary')`, la `check` di prova diventa `({ name: state, state, url: null, group: null, startedAt: null, finishedAt: null })` e si aggiunge:

```ts
  it('un job in coda tiene la pipeline in corso', () => {
    expect(ciSummary([check('passed'), check('queued')])).toBe('running')
  })
```

In `test/unit/http.test.ts`, nel `describe('HostingClient')`:

```ts
  it('paginazione di pagine che non sono array', async () => {
    const page = (n: number, next?: number) => json({ items: [n] }, next ? { headers: { link: `<https://api.github.com/x?page=${next}>; rel="next"` } } : {})
    const { c } = client(github, page(1, 2), page(2))
    expect(await c.all('/x?page=1', 10, (p) => (p as { items: number[] }).items)).toEqual([1, 2])
  })
```

In `test/unit/github.test.ts`, il test `'CI: stati combinati e check run'` diventa:

```ts
  it('CI: check run con coda, gruppi per workflow nell\'ordine di creazione, poi app e altri controlli', async () => {
    const sha = 'a'.repeat(40)
    const run = (name: string, status: string, conclusion: string | null, suite: number | null, app = 'GitHub Actions', started: string | null = null) => ({
      name,
      status,
      conclusion,
      html_url: null,
      started_at: started,
      completed_at: status === 'completed' ? '2026-10-20T10:05:00Z' : null,
      check_suite: suite === null ? null : { id: suite },
      app: { name: app },
    })
    const { gh } = github([
      ['GET', `/repos/acme/demo-app/commits/${sha}/status`, { statuses: [{ context: 'lint', state: 'success', target_url: 'https://ci.example.com/1', created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:01:00Z' }] }],
      [
        'GET',
        `/repos/acme/demo-app/commits/${sha}/check-runs?per_page=100`,
        {
          total_count: 5,
          check_runs: [
            run('e2e', 'queued', null, 20),
            run('unit', 'in_progress', null, 10, 'GitHub Actions', '2026-10-20T10:02:00Z'),
            run('build', 'completed', 'success', 10, 'GitHub Actions', '2026-10-20T10:00:00Z'),
            run('coverage', 'completed', 'failure', 99, 'Codecov', '2026-10-20T10:03:00Z'),
            run('deploy', 'waiting', null, 20),
          ],
        },
      ],
      [
        'GET',
        `/repos/acme/demo-app/actions/runs?head_sha=${sha}&per_page=100`,
        {
          total_count: 2,
          workflow_runs: [
            { name: 'E2E', check_suite_id: 20, created_at: '2026-10-20T10:01:00Z' },
            { name: 'CI', check_suite_id: 10, created_at: '2026-10-20T10:00:00Z' },
          ],
        },
      ],
    ])
    const ci = await gh.checks('acme/demo-app', sha)
    expect(ci.summary).toBe('failed')
    expect(ci.checks.map((c) => [c.group, c.name, c.state])).toEqual([
      ['CI', 'build', 'passed'],
      ['CI', 'unit', 'running'],
      ['E2E', 'deploy', 'queued'],
      ['E2E', 'e2e', 'queued'],
      ['Codecov', 'coverage', 'failed'],
      [null, 'lint', 'passed'],
    ])
    expect(ci.checks[0]).toMatchObject({ startedAt: Date.parse('2026-10-20T10:00:00Z') / 1000, finishedAt: Date.parse('2026-10-20T10:05:00Z') / 1000 })
    expect(ci.checks[5]).toMatchObject({ url: 'https://ci.example.com/1', finishedAt: Date.parse('2026-10-20T10:01:00Z') / 1000 })
  })

  it('CI: senza Actions (actions/runs non risponde) i check run si raggruppano per app', async () => {
    const sha = 'b'.repeat(40)
    const { gh } = github([
      ['GET', `/repos/acme/demo-app/commits/${sha}/status`, { statuses: [] }],
      [
        'GET',
        `/repos/acme/demo-app/commits/${sha}/check-runs?per_page=100`,
        { check_runs: [{ name: 'scan', status: 'completed', conclusion: 'success', html_url: null, started_at: null, completed_at: null, check_suite: { id: 1 }, app: { name: 'Scanner' } }] },
      ],
    ])
    expect((await gh.checks('acme/demo-app', sha)).checks).toMatchObject([{ name: 'scan', group: 'Scanner', state: 'passed' }])
  })
```

In `test/unit/gitlab.test.ts`, il test della CI diventa:

```ts
  it('CI: i job della pipeline per id, stage nell\'ordine della pipeline, coda, manuali saltati, tempi', async () => {
    const sha = 'a'.repeat(40)
    const job = (id: number, name: string, stage: string, status: string, started: string | null = null) => ({
      id,
      name,
      stage,
      status,
      web_url: `https://gitlab.example.com/j/${id}`,
      started_at: started,
      finished_at: null,
    })
    const { gl } = gitlab([
      ['GET', `${P}/pipelines?sha=${sha}&per_page=1`, [{ id: 7 }]],
      [
        'GET',
        `${P}/pipelines/7/jobs?per_page=100`,
        // GitLab le dà dalla più recente
        [job(5, 'deploy', 'deploy', 'manual'), job(4, 'e2e', 'test', 'pending'), job(3, 'unit', 'test', 'running', '2026-10-20T10:02:00Z'), job(2, 'lint', 'build', 'created'), job(1, 'compile', 'build', 'success', '2026-10-20T10:00:00Z')],
      ],
      ['GET', `${P}/pipelines?sha=${'c'.repeat(40)}&per_page=1`, []],
    ])
    const ci = await gl.checks('acme/demo-app', sha)
    expect(ci.summary).toBe('running')
    expect(ci.checks.map((c) => [c.group, c.name, c.state])).toEqual([
      ['build', 'compile', 'passed'],
      ['build', 'lint', 'queued'],
      ['test', 'unit', 'running'],
      ['test', 'e2e', 'queued'],
      ['deploy', 'deploy', 'skipped'],
    ])
    expect(ci.checks[2]).toMatchObject({ startedAt: Date.parse('2026-10-20T10:02:00Z') / 1000, finishedAt: null, url: 'https://gitlab.example.com/j/3' })
    expect(await gl.checks('acme/demo-app', 'c'.repeat(40))).toEqual({ summary: 'none', checks: [] })
  })
```

Run: `npx vitest run test/unit/hosting.test.ts test/unit/http.test.ts test/unit/github.test.ts test/unit/gitlab.test.ts`
Expected: FAIL (coda, gruppi, tempi e `all` con `items` non esistono).

- [ ] **Step 2: Tipi, `ciSummary`, `all`**

In `src/shared/types.ts`:

```ts
export type CheckState = 'passed' | 'failed' | 'running' | 'queued' | 'skipped' | 'cancelled'

export interface Check {
  name: string
  state: CheckState
  url: string | null
  /** Stage (GitLab) o workflow (GitHub); null per gli altri controlli. */
  group: string | null
  /** Secondi dall'epoch; null se il job non è partito o non è finito. */
  startedAt: number | null
  finishedAt: number | null
}
```

In `src/main/hosting/provider.ts`:

```ts
/** Fallito se un job è fallito, in corso se uno è in corso o in coda, superato se ce ne sono, altrimenti nessuno. */
export function ciSummary(checks: Check[]): CiStatus['summary'] {
  if (checks.some((c) => c.state === 'failed')) return 'failed'
  if (checks.some((c) => c.state === 'running' || c.state === 'queued')) return 'running'
  return checks.length ? 'passed' : 'none'
}
```

e dopo `seconds`:

```ts
/** Come seconds, ma null se la data manca (job non partito o non finito). */
export const optionalSeconds = (iso: string | null | undefined): number | null => (iso ? seconds(iso) : null)
```

In `src/main/hosting/http.ts`, `all` prende gli elementi anche da pagine che sono oggetti:

```ts
  /** GET di tutte le pagine, seguendo Link rel="next", fino a max elementi; items li prende da una pagina che non è un array. */
  async all<T>(path: string, max: number, items: (page: unknown) => T[] = (page) => page as T[]): Promise<T[]> {
    const out: T[] = []
    let url: string | null = `${this.base}${path}`
    while (url && out.length < max) {
      const page = await this.send('GET', url)
      out.push(...items(page.data))
      url = nextLink(page.headers.get('link'))
    }
    return out.slice(0, max)
  }
```

- [ ] **Step 3: GitHub**

In `src/main/hosting/github.ts`:
- importa `optionalSeconds` da `./provider`;
- `GhStatus` e `GhCheckRuns` diventano:

```ts
interface GhStatus {
  statuses: { context: string; state: string; target_url: string | null; created_at: string; updated_at: string }[]
}
interface GhCheckRun {
  name: string
  status: string
  conclusion: string | null
  html_url: string | null
  started_at: string | null
  completed_at: string | null
  check_suite: { id: number } | null
  app: { name: string } | null
}
interface GhWorkflowRun {
  name: string
  check_suite_id: number
  created_at: string
}
```

- `checks` diventa:

```ts
  async checks(project: string, sha: string): Promise<CiStatus> {
    const repo = `/repos/${pathSegments(project)}`
    const commit = `${repo}/commits/${sha}`
    const [status, runs, workflows] = await Promise.all([
      this.c.request<GhStatus>('GET', `${commit}/status`),
      this.c.all<GhCheckRun>(`${commit}/check-runs?per_page=100`, 1000, (page) => (page as { check_runs: GhCheckRun[] }).check_runs),
      // Senza Actions (o senza permessi) i check run si raggruppano per app
      this.c
        .all<GhWorkflowRun>(`${repo}/actions/runs?head_sha=${sha}&per_page=100`, 1000, (page) => (page as { workflow_runs: GhWorkflowRun[] }).workflow_runs)
        .catch((): GhWorkflowRun[] => []),
    ])
    const ordered = workflows.toSorted((a, b) => a.created_at.localeCompare(b.created_at))
    const workflow = new Map(ordered.map((w) => [w.check_suite_id, w.name]))
    const order = [...new Set(ordered.map((w) => w.name))]
    const checks: Check[] = [
      ...runs.map(
        (r): Check => ({
          name: r.name,
          // queued, waiting, requested e pending sono in coda
          state: r.status === 'completed' ? (CONCLUSION[r.conclusion ?? ''] ?? 'failed') : r.status === 'in_progress' ? 'running' : 'queued',
          url: r.html_url,
          group: workflow.get(r.check_suite?.id ?? -1) ?? r.app?.name ?? null,
          startedAt: optionalSeconds(r.started_at),
          finishedAt: optionalSeconds(r.completed_at),
        }),
      ),
      ...status.statuses.map(
        (s): Check => ({
          name: s.context,
          state: STATUS[s.state] ?? 'running',
          url: s.target_url,
          group: null,
          startedAt: seconds(s.created_at),
          finishedAt: s.state === 'pending' ? null : seconds(s.updated_at),
        }),
      ),
    ]
    // I workflow per creazione, poi le app per nome, infine gli altri controlli; nel gruppo per inizio e nome
    const rank = (c: Check) => (c.group === null ? Infinity : order.includes(c.group) ? order.indexOf(c.group) : order.length)
    const sorted = checks.toSorted(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.group ?? '').localeCompare(b.group ?? '') ||
        (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity) ||
        a.name.localeCompare(b.name),
    )
    return { summary: ciSummary(sorted), checks: sorted }
  }
```

(Due differenze fra infiniti danno `NaN`, che con `||` passa al criterio successivo.)

- [ ] **Step 4: GitLab**

In `src/main/hosting/gitlab.ts`:
- importa `optionalSeconds` da `./provider`;
- `GlJob` diventa:

```ts
interface GlJob {
  id: number
  name: string
  stage: string
  status: string
  web_url: string
  started_at: string | null
  finished_at: string | null
}
```

- `JOBS` diventa (il commento sopra cambia di conseguenza):

```ts
// In coda gli stati non elencati: created, pending, preparing, waiting_for_resource, scheduled.
// Un job manuale non parte da solo: come saltato, altrimenti la pipeline non risulterebbe mai finita.
const JOBS: Record<string, CheckState> = {
  success: 'passed',
  failed: 'failed',
  running: 'running',
  canceled: 'cancelled',
  canceling: 'cancelled',
  skipped: 'skipped',
  manual: 'skipped',
}
```

- in `checks`:

```ts
    const jobs = await this.c.all<GlJob>(`${this.project(project)}/pipelines/${pipeline.id}/jobs?per_page=100`, 1000)
    // Per id: l'ordine in cui la pipeline crea i job, quindi anche quello degli stage
    const byId = jobs.toSorted((a, b) => a.id - b.id)
    const stages = [...new Set(byId.map((j) => j.stage))]
    const checks = byId
      .toSorted((a, b) => stages.indexOf(a.stage) - stages.indexOf(b.stage))
      .map(
        (j): Check => ({
          name: j.name,
          state: JOBS[j.status] ?? 'queued',
          url: j.web_url,
          group: j.stage,
          startedAt: optionalSeconds(j.started_at),
          finishedAt: optionalSeconds(j.finished_at),
        }),
      )
    return { summary: ciSummary(checks), checks }
```

Run: `npx vitest run test/unit/hosting.test.ts test/unit/http.test.ts test/unit/github.test.ts test/unit/gitlab.test.ts`
Expected: PASS.

- [ ] **Step 5: Verifica e commit**

`npm run typecheck` segnala i `Record<CheckState, …>` del renderer senza `queued` (`PullRequestDetail.vue`): aggiungi `queued: '○'` al suo `SYMBOL`. Il resto del renderer si sistema nei task successivi.

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: job delle pipeline con coda, stage o workflow e tempi"
```

---

### Task 2: Avanzamento, gruppi e durate (funzioni pure)

**Files:**
- Modify: `src/renderer/pull-requests/model.ts`
- Test: `test/unit/pull-requests.test.ts`

**Interfaces:**
- Produces:
  - `type StateCounts = Record<CheckState, number>`, `countStates(checks): StateCounts`;
  - `isActive(status: CiStatus): boolean`;
  - `ciProgress(status: CiStatus): CiProgressInfo` con `{ total; done; counts; current: string | null; startedAt: number | null; active: boolean }`;
  - `span(checks: Check[], now: number): number | null`;
  - `ciGroups(checks: Check[], now: number): CiGroup[]` con `CiGroup { name: string | null; checks; counts; total; done; state: 'failed' | 'running' | 'queued' | 'passed'; duration: number | null }`;
  - `formatDuration(seconds: number): string`.

- [ ] **Step 1: Test unit**

In `test/unit/pull-requests.test.ts` aggiungi agli import `ciGroups`, `ciProgress`, `formatDuration`, `isActive`, `span` e i tipi `Check`, `CiStatus`, e:

```ts
const job = (name: string, state: Check['state'], group: string | null, startedAt: number | null = null, finishedAt: number | null = null): Check => ({
  name,
  state,
  url: null,
  group,
  startedAt,
  finishedAt,
})
const status = (checks: Check[]): CiStatus => ({ summary: 'running', checks })

describe('avanzamento delle pipeline', () => {
  const checks = [
    job('compile', 'passed', 'build', 100, 160),
    job('lint', 'skipped', 'build'),
    job('unit', 'running', 'test', 200),
    job('api', 'failed', 'test', 210, 260),
    job('e2e', 'queued', 'test'),
    job('deploy', 'queued', 'deploy'),
  ]

  it('conteggi, finiti, gruppo in corso, inizio, attiva', () => {
    expect(ciProgress(status(checks))).toEqual({
      total: 6,
      done: 3,
      counts: { passed: 1, failed: 1, running: 1, queued: 2, skipped: 1, cancelled: 0 },
      current: 'test',
      startedAt: 100,
      active: true,
    })
    // Senza job in corso, il gruppo in corso è il primo in coda
    expect(ciProgress(status([job('a', 'passed', 'build', 1, 2), job('b', 'queued', 'deploy')])).current).toBe('deploy')
    expect(isActive(status([job('a', 'passed', 'build'), job('b', 'failed', 'test')]))).toBe(false)
    expect(isActive(status([job('a', 'failed', 'build'), job('b', 'queued', 'test')]))).toBe(true)
  })

  it('gruppi nell\'ordine dei job, con stato e durata', () => {
    expect(ciGroups(checks, 300).map((g) => [g.name, g.state, `${g.done}/${g.total}`, g.duration])).toEqual([
      ['build', 'passed', '2/2', 60],
      ['test', 'failed', '1/3', 100],
      ['deploy', 'queued', '0/1', null],
    ])
    expect(ciGroups([job('x', 'running', null, 10)], 70)[0]).toMatchObject({ name: null, state: 'running', duration: 60 })
  })

  it('durata di un job e formato', () => {
    expect(span([job('a', 'passed', null, 100, 145)], 999)).toBe(45)
    expect(span([job('a', 'running', null, 100)], 160)).toBe(60)
    expect(span([job('a', 'queued', null)], 160)).toBeNull()
    expect([formatDuration(40.4), formatDuration(360), formatDuration(4320), formatDuration(-5)]).toEqual(['40 s', '6 min', '1 h 12 min', '0 s'])
  })
})
```

Run: `npx vitest run test/unit/pull-requests.test.ts`
Expected: FAIL, le funzioni non esistono.

- [ ] **Step 2: Le funzioni**

In `src/renderer/pull-requests/model.ts` aggiungi `Check`, `CheckState`, `CiStatus` all'import dei tipi e:

```ts
export type StateCounts = Record<CheckState, number>

export interface CiProgressInfo {
  total: number
  /** Job finiti: superati, falliti, saltati, annullati. */
  done: number
  counts: StateCounts
  /** Il primo gruppo con un job in corso, o in coda se nessuno gira. */
  current: string | null
  /** Inizio del primo job; null se nessuno è partito. */
  startedAt: number | null
  /** Ha job in corso o in coda. */
  active: boolean
}

export interface CiGroup {
  /** Stage o workflow; null per gli altri controlli. */
  name: string | null
  checks: Check[]
  counts: StateCounts
  total: number
  done: number
  state: 'failed' | 'running' | 'queued' | 'passed'
  /** Secondi; null se nessun job del gruppo è partito. */
  duration: number | null
}

const STATES: CheckState[] = ['passed', 'failed', 'running', 'queued', 'skipped', 'cancelled']

export function countStates(checks: Check[]): StateCounts {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as StateCounts
  for (const c of checks) counts[c.state]++
  return counts
}

/** La pipeline ha ancora job in corso o in coda (anche se qualcuno è già fallito). */
export const isActive = (status: CiStatus): boolean => status.checks.some((c) => c.state === 'running' || c.state === 'queued')

const starts = (checks: Check[]) => checks.flatMap((c) => (c.startedAt === null ? [] : [c.startedAt]))

export function ciProgress(status: CiStatus): CiProgressInfo {
  const counts = countStates(status.checks)
  const first = starts(status.checks)
  const current = status.checks.find((c) => c.state === 'running') ?? status.checks.find((c) => c.state === 'queued')
  return {
    total: status.checks.length,
    done: status.checks.length - counts.running - counts.queued,
    counts,
    current: current?.group ?? null,
    startedAt: first.length ? Math.min(...first) : null,
    active: counts.running + counts.queued > 0,
  }
}

/** Dall'inizio del primo job alla fine dell'ultimo, o fino a now se uno partito non è finito; null se nessuno è partito. */
export function span(checks: Check[], now: number): number | null {
  const first = starts(checks)
  if (!first.length) return null
  const open = checks.some((c) => c.startedAt !== null && c.finishedAt === null)
  const end = open ? now : Math.max(...checks.flatMap((c) => (c.finishedAt === null ? [] : [c.finishedAt])))
  return Math.max(0, end - Math.min(...first))
}

/** I job divisi per gruppo, nell'ordine in cui arrivano (quello della pipeline). */
export function ciGroups(checks: Check[], now: number): CiGroup[] {
  const groups = new Map<string | null, Check[]>()
  for (const c of checks) {
    let list = groups.get(c.group)
    if (!list) groups.set(c.group, (list = []))
    list.push(c)
  }
  return [...groups].map(([name, list]) => {
    const counts = countStates(list)
    const state = counts.failed ? 'failed' : counts.running ? 'running' : counts.queued ? 'queued' : 'passed'
    return { name, checks: list, counts, total: list.length, done: list.length - counts.running - counts.queued, state, duration: span(list, now) }
  })
}

/** "40 s", "6 min", "1 h 12 min": gli stessi simboli in inglese e in italiano. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
```

Run: `npx vitest run test/unit/pull-requests.test.ts`
Expected: PASS.

- [ ] **Step 3: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: avanzamento, gruppi e durate delle pipeline (funzioni pure)"
```

---

### Task 3: Barra di avanzamento nella lista

**Files:**
- Create: `src/renderer/components/CiProgress.vue`
- Modify: `src/renderer/stores/pull-requests.ts`, `src/renderer/components/PullRequestList.vue`, `src/shared/i18n/en.ts`, `it.ts`

**Interfaces:**
- Consumes: `ciProgress`, `isActive`, `formatDuration` (Task 2).
- Produces:
  - nello store: `now` (secondi), `poll()` sulle pipeline attive, `select(n, tab?)`, `PullRequestTab` con `'checks'`;
  - `CiProgress.vue` con le prop `status: CiStatus` e `now: number`; `data-testid` `ci-progress` e `ci-progress-text`.

- [ ] **Step 1: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `ci.queued.one` / `.other` | {count} queued | {count} in coda |

- [ ] **Step 2: Store**

In `src/renderer/stores/pull-requests.ts`:
- importa `isActive` da `../pull-requests/model`;
- `export type PullRequestTab = 'conversation' | 'commits' | 'changes' | 'checks'`;
- vicino a `ci`:

```ts
    /** Ora (secondi) per le durate delle pipeline: avanza a ogni controllo, senza un timer suo. */
    const now = ref(Math.floor(Date.now() / 1000))
```

- in `loadChecks`, dopo `triggerRef(ci)`: `now.value = Math.floor(Date.now() / 1000)`;
- `poll` diventa:

```ts
    /** Dalla vista, ogni 30 s: le pipeline con job in corso o in coda, anche se qualcuno è già fallito. */
    const poll = () => {
      now.value = Math.floor(Date.now() / 1000)
      return loadChecks([...ci.value].filter(([, s]) => isActive(s)).map(([sha]) => sha))
    }
```

- `select` apre una scheda precisa: `async function select(n: number, next: PullRequestTab = 'conversation')` e `tab.value = next`;
- commit e modifiche si caricano solo per le loro schede: in `loadDetail` e in `setTab` la condizione diventa `(tab.value === 'commits' || tab.value === 'changes') && !changes.value` (in `setTab`, con `next`);
- `now` nel `return`.

- [ ] **Step 3: `CiProgress.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { CheckState, CiStatus } from '../../shared/types'
import { tn } from '../i18n'
import { ciProgress, formatDuration } from '../pull-requests/model'

const props = defineProps<{ status: CiStatus; now: number }>()
// Segmenti in quest'ordine; annullati e saltati insieme
const SEGMENTS: { states: CheckState[]; cls: string }[] = [
  { states: ['passed'], cls: 'passed' },
  { states: ['failed'], cls: 'failed' },
  { states: ['skipped', 'cancelled'], cls: 'skipped' },
  { states: ['running'], cls: 'running' },
  { states: ['queued'], cls: 'queued' },
]
const ORDER: CheckState[] = ['passed', 'failed', 'running', 'queued', 'skipped', 'cancelled']

const p = computed(() => ciProgress(props.status))
const segments = computed(() =>
  SEGMENTS.map((s) => ({ cls: s.cls, n: s.states.reduce((sum, state) => sum + p.value.counts[state], 0) })).filter((s) => s.n > 0),
)
/** "10 passed · 1 failed · 3 in progress · 26 queued" */
const title = computed(() =>
  ORDER.filter((s) => p.value.counts[s] > 0)
    .map((s) => tn(`ci.${s}`, p.value.counts[s]))
    .join(' · '),
)
/** "14/40 · test · 6 min"; con dei falliti "9/40 · 1 failed · 3 min" */
const text = computed(() =>
  [
    `${p.value.done}/${p.value.total}`,
    p.value.counts.failed ? tn('ci.failed', p.value.counts.failed) : p.value.current,
    p.value.startedAt === null ? null : formatDuration(props.now - p.value.startedAt),
  ]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <div class="ci-progress" :title="title" data-testid="ci-progress">
    <div class="bar" role="progressbar" aria-valuemin="0" :aria-valuenow="p.done" :aria-valuemax="p.total" :aria-label="title">
      <span v-for="s in segments" :key="s.cls" :class="s.cls" :style="{ flexGrow: s.n }" />
    </div>
    <span class="text" data-testid="ci-progress-text">{{ text }}</span>
  </div>
</template>

<style scoped>
.ci-progress { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--fg-muted); }
.bar { display: flex; flex: 0 0 140px; height: 6px; overflow: hidden; border-radius: 3px; background: var(--bg-hover); }
.bar span { flex-basis: 0; }
.passed { background: #2da44e; }
.failed { background: var(--danger); }
.skipped { background: var(--border); }
.running { background: #bf8700; animation: pulse 1.6s ease-in-out infinite; }
.queued { background: var(--bg-hover); }
.text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
@keyframes pulse { 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .running { animation: none; } }
</style>
```

- [ ] **Step 4: La terza riga nella lista**

In `PullRequestList.vue`:
- importa `CiProgress` e `isActive` (da `../pull-requests/model`);
- `const ciOf = (sha: string) => prs.ci.get(sha)` e, nel template, `ciOf(p.head.sha)` al posto delle tre `prs.ci.get(p.head.sha)` dell'icona;
- dopo `<div class="second muted">…</div>`:

```vue
        <CiProgress
          v-if="ciOf(p.head.sha) && isActive(ciOf(p.head.sha)!)"
          class="third"
          :status="ciOf(p.head.sha)!"
          :now="prs.now"
          @click.stop="prs.select(p.number, 'checks')"
        />
```

- stile: `.third { margin-top: 4px; cursor: pointer; }`.

- [ ] **Step 5: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde (l'E2E della barra arriva nel Task 4, insieme alla scheda che apre).

```bash
git add src
git commit -m "feat: barra di avanzamento delle pipeline in corso nella lista delle pull request"
```

---

### Task 4: Scheda Controlli con i job per stage

**Files:**
- Create: `src/renderer/components/CiChecks.vue`
- Modify: `src/renderer/components/PullRequestDetail.vue`, `test/e2e/fake-hosting.ts`, `test/e2e/pull-requests.spec.ts`, `src/shared/i18n/en.ts`, `it.ts`

**Interfaces:**
- Consumes: `ciGroups`, `span`, `formatDuration`; `CiProgress`; `prs.now`, `prs.setTab`, `PullRequestTab`.
- Produces: `CiChecks.vue` con le prop `status`, `now`, `pr` (numero, per azzerare filtro e gruppi); `data-testid` `ci-filter`, `ci-group`, `ci-group-head`, `ci-job`, `pr-tab-checks`.

- [ ] **Step 1: Server finto con stage e coda**

In `test/e2e/fake-hosting.ts`:
- `FakePull.checks` diventa `{ name: string; state: 'success' | 'failure' | 'pending' | 'queued'; stage?: string }[]`;
- `JOB` diventa `{ success: 'success', failure: 'failed', pending: 'running', queued: 'pending' } as const`;
- negli stati di GitHub una coda è `pending`: `state: c.state === 'queued' ? 'pending' : c.state`;
- i job di GitLab, dalla più recente come fa GitLab, con stage e inizio:

```ts
      (m) =>
        withPull(m[1] ?? '', (p) => [
          200,
          p.checks
            .map((c, i) => ({
              id: i + 1,
              name: c.name,
              stage: c.stage ?? 'test',
              status: JOB[c.state],
              web_url: 'https://ci.example.com/job',
              started_at: c.state === 'queued' ? null : '2026-10-20T10:00:00Z',
              finished_at: c.state === 'success' || c.state === 'failure' ? '2026-10-20T10:02:00Z' : null,
            }))
            .reverse(),
        ]),
```

- [ ] **Step 2: E2E**

In `test/e2e/pull-requests.spec.ts`:

- nel test `'dettaglio: …'` le righe

```ts
  await page.getByTestId('pr-ci-summary').click()
  await expect(page.getByTestId('pr-checks')).toContainText('test')
```

  diventano (il riepilogo porta alla scheda; il gruppo superato è chiuso):

```ts
  await page.getByTestId('pr-ci-summary').click()
  await expect(page.getByTestId('ci-group')).toContainText('Other checks')
  await page.getByTestId('ci-group-head').click()
  await expect(page.getByTestId('ci-job')).toContainText('test')
  await page.getByTestId('pr-tab-conversation').click()
```

- in fondo:

```ts
test('GitLab: pipeline in corso con 40 job, barra nella lista e controlli per stage con filtro', async () => {
  const repo = demoRepo('gitlab.example.com', (n) => `refs/merge-requests/${n}/head`)
  const pulls = demoPulls(repo)
  // build finito, test in corso, deploy in coda: 15 finiti su 40
  const jobs = (stage: string, n: number, state: (i: number) => 'success' | 'pending' | 'queued') =>
    Array.from({ length: n }, (_, i) => ({ name: `${stage}:${i + 1}`, stage, state: state(i) }))
  pulls[0].checks = [
    ...jobs('build', 4, () => 'success'),
    ...jobs('test', 24, (i) => (i < 11 ? 'success' : i < 14 ? 'pending' : 'queued')),
    ...jobs('deploy', 12, () => 'queued'),
  ]
  const server = await fakeHosting(pulls)
  const { app, page } = await launch([repo.clone], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByTestId('commit-row').first()).toBeVisible()
  await addAccount(page, 'gitlab.example.com', 'gitlab')
  await page.getByTestId('page-pull-requests').click()

  const row = page.getByTestId('pr-row').first()
  await expect(row.getByTestId('ci-progress-text')).toContainText('15/40 · test')
  await expect(row.getByTestId('ci-progress')).toHaveAttribute('title', '15 passed · 3 in progress · 22 queued')
  // La pipeline della #2 è finita: solo l'icona
  await expect(page.getByTestId('pr-row').nth(1).getByTestId('ci-progress')).toHaveCount(0)

  await row.getByTestId('ci-progress').click()
  await expect(page.getByTestId('pr-tab-checks')).toHaveClass(/active/)
  await expect(page.getByTestId('pr-tab-checks')).toContainText('(40)')
  await expect(page.getByTestId('ci-group')).toHaveCount(3)
  // Aperto solo test, che ha job in corso
  await expect(page.getByTestId('ci-job')).toHaveCount(24)
  await page.getByTestId('ci-filter').fill('deploy:1')
  await expect(page.getByTestId('ci-group')).toHaveCount(1)
  await expect(page.getByTestId('ci-job')).toHaveText([/deploy:1\b/, /deploy:10/, /deploy:11/, /deploy:12/])
  await app.close()
  await server.close()
})
```

(Il tooltip: 4 superati in build e 11 in test; 10 in coda in test e 12 in deploy.)

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: FAIL, la scheda Controlli non esiste.

- [ ] **Step 3: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `pr.tab.checks` | Checks | Controlli |
| `pr.loadingChecks` | Loading checks… | Carico i controlli… |
| `ci.none` | No checks for this commit | Nessun controllo per questo commit |
| `ci.filter` | Filter jobs… | Filtra i job… |
| `ci.otherChecks` | Other checks | Altri controlli |
| `ci.queuedLabel` | queued | in coda |

- [ ] **Step 4: `CiChecks.vue`**

```vue
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CheckState, CiStatus } from '../../shared/types'
import { t } from '../i18n'
import { ciGroups, formatDuration, span } from '../pull-requests/model'
import CiProgress from './CiProgress.vue'

const props = defineProps<{ status: CiStatus; now: number; pr: number }>()
/** Oltre questi job compare il filtro. */
const FILTER_FROM = 20
const SYMBOL: Record<CheckState, string> = { passed: '✓', failed: '✕', running: '●', queued: '○', skipped: '–', cancelled: '–' }

const query = ref('')
/** Gruppi aperti o chiusi dall'utente; '' è il gruppo degli altri controlli. */
const toggled = reactive(new Map<string, boolean>())
watch(
  () => props.pr,
  () => {
    toggled.clear()
    query.value = ''
  },
)

const key = (name: string | null) => name ?? ''
const groups = computed(() => {
  const all = ciGroups(props.status.checks, props.now)
  const q = query.value.trim().toLowerCase()
  // All'inizio aperti i gruppi con job falliti o in corso
  if (!q) return all.map((g) => ({ ...g, open: toggled.get(key(g.name)) ?? (g.state === 'failed' || g.state === 'running') }))
  // Con il filtro: solo i gruppi con risultati, aperti (il nome del gruppo vale per tutti i suoi job)
  return all.flatMap((g) => {
    const checks = (g.name ?? '').toLowerCase().includes(q) ? g.checks : g.checks.filter((c) => c.name.toLowerCase().includes(q))
    return checks.length ? [{ ...g, checks, open: true }] : []
  })
})

const duration = (seconds: number | null) => (seconds === null ? '' : formatDuration(seconds))
</script>

<template>
  <div class="ci-checks">
    <p v-if="!status.checks.length" class="muted note">{{ t('ci.none') }}</p>
    <template v-else>
      <header>
        <CiProgress :status="status" :now="now" />
        <input v-if="status.checks.length > FILTER_FROM" v-model="query" data-testid="ci-filter" :placeholder="t('ci.filter')" />
      </header>
      <section v-for="g in groups" :key="key(g.name)" class="group" data-testid="ci-group">
        <button class="head" :aria-expanded="g.open" data-testid="ci-group-head" @click="toggled.set(key(g.name), !g.open)">
          <span class="twisty">{{ g.open ? '▾' : '▸' }}</span>
          <span class="ci" :class="g.state">{{ SYMBOL[g.state] }}</span>
          <span class="name">{{ g.name ?? t('ci.otherChecks') }}</span>
          <span class="muted count">{{ g.done }}/{{ g.total }}</span>
          <span class="muted time">{{ duration(g.duration) }}</span>
        </button>
        <ul v-if="g.open">
          <li v-for="(c, i) in g.checks" :key="i" data-testid="ci-job">
            <span class="ci" :class="c.state">{{ SYMBOL[c.state] }}</span>
            <span class="name">{{ c.name }}</span>
            <span class="muted time">{{ c.state === 'queued' ? t('ci.queuedLabel') : duration(span([c], now)) }}</span>
            <a v-if="c.url" :href="c.url" target="_blank">{{ t('ci.details') }}</a>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ci-checks { flex: 1; min-height: 0; overflow: auto; padding: 8px 12px; }
header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.group { border-bottom: 1px solid var(--border); }
.head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 0; border: 0; border-radius: 0; background: transparent; text-align: left; }
.head:hover { background: var(--bg-hover); }
.twisty { width: 10px; font-size: 10px; color: var(--fg-muted); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count, .time { font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.time { min-width: 64px; text-align: right; }
ul { margin: 0 0 6px; padding: 0 0 0 16px; list-style: none; }
li { display: flex; align-items: center; gap: 6px; padding: 1px 0; font-size: 12px; }
.ci { width: 12px; font-weight: 700; text-align: center; color: var(--fg-muted); }
.ci.passed { color: #2da44e; }
.ci.failed { color: var(--danger); }
.ci.running { color: #bf8700; }
.note { margin: 0; }
</style>
```

- [ ] **Step 5: La scheda nel dettaglio**

In `PullRequestDetail.vue`:
- importa `CiChecks`;
- `TABS` aggiunge `'checks'`; `STATES` aggiunge `'queued'` dopo `'running'`;
- togli `showChecks`, il suo azzeramento nel `watch` e l'elenco `pr-checks` nell'intestazione;
- il riepilogo della CI porta alla scheda: `@click="prs.setTab('checks')"`;
- in `tabLabel`, prima dell'ultimo `return`:

```ts
  if (tab === 'checks') return ci.value ? `${t('pr.tab.checks')} (${ci.value.checks.length})` : t('pr.tab.checks')
```

- prima del `<div v-else class="pane">` delle modifiche:

```vue
      <div v-else-if="prs.tab === 'checks'" class="pane">
        <CiChecks v-if="ci" :status="ci" :now="prs.now" :pr="d.number" />
        <p v-else class="muted note">{{ t('pr.loadingChecks') }}</p>
      </div>
```

- togli gli stili rimasti senza uso (`.checks`, `.checks li`, `.checks .name`).

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: scheda Controlli con i job per stage o workflow, filtro e durate"
```

---

### Task 5: README e verifica finale

**Files:**
- Modify: `README.md`, questo piano (note di esecuzione)

- [ ] **Step 1: README**

Nella sezione "Pull requests", la voce della lista diventa: "A list of pull requests (merge requests on GitLab) with search over title, description, author and branch, an Open / Merged / Closed / All filter, and CI status; running pipelines show a progress bar with finished jobs, the current stage and the elapsed time." E nella voce del dettaglio "and the list of checks" diventa "and a Checks tab with the jobs grouped by stage (GitLab) or workflow (GitHub), with a filter for long pipelines".

- [ ] **Step 2: Verifica completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde, con la finestra nascosta.

Screenshot nascosti (spec temporanea, non committata) della lista con la barra e della scheda Controlli, in inglese e in italiano.

- [ ] **Step 3: Note di esecuzione e commit**

```bash
git add README.md docs
git commit -m "docs: avanzamento delle pipeline nel README e note di esecuzione"
```
