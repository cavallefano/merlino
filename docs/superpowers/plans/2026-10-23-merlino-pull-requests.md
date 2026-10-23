# Merlino — Pull request e merge request (parte 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestire le pull request di GitHub e le merge request di GitLab da Merlino, come in Tower: account con token, lista e ricerca, dettaglio (conversazione, commit, modifiche), commento, checkout, merge, chiusura e riapertura, creazione, stato della CI.

**Architecture:**
- **Main, `src/main/hosting/`**: `remote-url.ts` (da URL del remote a server e progetto), `http.ts` (`HostingClient` su `fetch` iniettato: JSON, timeout, niente redirect, paginazione, errori tradotti, log), `github.ts` e `gitlab.ts` (implementano `HostingProvider` e convertono le risposte nei tipi comuni), `accounts.ts` (account in `settings.json`, token cifrati in `tokens.json`), `pull-requests.ts` (da repo e remote a provider e progetto).
- **Main, git**: `src/main/git/pull-request.ts` scarica gli oggetti della PR senza creare ref, legge commit, file e diff, fa il checkout.
- **Renderer**: `usePullRequestStore(root)` tiene remote, filtro, ricerca, lista, dettaglio, scheda, CI e dialog; `RepoView` passa fra storia e pull request (`repo.page`); componenti per lista, dettaglio, merge, creazione, account e Markdown.
- **Il renderer non vede mai URL o token**: passa root, nome del remote, numero, SHA e testi; il main valida tutto.

**Tech Stack:** Electron 45 (`net.fetch`, `safeStorage`), Vue 3, Pinia, TypeScript, `marked` e `DOMPurify` (nuove, solo nel renderer), Vitest, Playwright con un server HTTP finto; git ≥ 2.35.

Spec: `docs/superpowers/specs/2026-10-23-merlino-pull-requests-design.md`. Branch: `feature/pull-requests`, che parte da `main`.

## Global Constraints

- **API**: `https://api.github.com` per `github.com`; `https://<host>/api/v3` per GitHub Enterprise; `https://<host>/api/v4` per GitLab.
- **Accesso**: solo token personale. GitHub `Authorization: Bearer <token>`; GitLab `PRIVATE-TOKEN: <token>`.
- **Token**: mai al renderer, mai nei log, mai in `settings.json`; va solo al server del suo account, in `https`; redirect rifiutati (`redirect: 'error'`); timeout 20 s.
- **Portachiavi**: token cifrati con `safeStorage` in `tokens.json` (`{ id: base64 }`); se `isEncryptionAvailable()` è falso l'account non si salva. Nei test E2E (`MERLINO_E2E=1`) una cifratura finta, per non far comparire il dialog del Portachiavi.
- **Limiti**: aperte fino a 500; Unite, Chiuse e Tutte le 100 aggiornate più di recente; CI al massimo 4 richieste alla volta; controllo periodico ogni 30 s solo per le CI in corso.
- **Validazione nel main**: remote con `refName` (e deve esistere), numero intero ≥ 1, SHA esadecimali, metodo di merge fra `merge | squash | rebase | ff`, titolo 1–256 caratteri, testi fino a 65 536 caratteri, server senza schema né percorso.
- **Testi**: inglese e italiano, chiavi `area.significato`; "pull request" anche per GitLab. Restano come sono: pull request, merge, squash, rebase, checkout, fast-forward, token, Draft (nel titolo di GitLab).
- **Nomi fittizi** in test e documenti: `acme/demo-app`, `ada`, `grace`, `git.example.com`, `gitlab.example.com`.
- **Test**: nessuna rete vera né token veri; E2E con la finestra nascosta (`launch()` imposta già `MERLINO_E2E=1`) e `MERLINO_E2E_API` verso un server finto su `127.0.0.1`.
- **Dipendenze nuove**: `marked@18.1.0` e `dompurify@3.4.16`, versioni esatte in `devDependencies` come `vue` e `highlight.js` (le impacchetta vite nel renderer).

**Eccezioni volute alla regola "tutto il codice nel piano":**
- Gli **stili** dei componenti Vue non sono qui: seguono quelli dei componenti vicini (`CommitDetail.vue`, `RebaseDialog.vue`, `PromptDialog.vue`, `styles.css`). Script, template e `data-testid` invece sì.
- I **testi** sono nelle tabelle dei task, in inglese e in italiano; vanno in `src/shared/i18n/en.ts` e `it.ts`.

**Scelte prese scrivendo il piano (piccole deviazioni dalla spec):**
- La cache della CI per SHA sta nello store del renderer, non in `pull-requests.ts` del main: il main resta senza stato.
- Il checkout passa da un canale suo (`pr:checkout`) invece che da un nuovo `RepoCommand`: serve il servizio dell'account per il ref della PR. Passa comunque dalla coda di scrittura del repo (`write: true`).
- La lista di GitHub (`GET /pulls`) non dice quanti commenti ha una PR: lì il numero compare solo nel dettaglio (`comments: null` nella lista).
- Nella lista la CI si carica solo per le PR aperte; per le altre si vede nel dettaglio.

## File

| File | Compito |
|---|---|
| `src/shared/types.ts` | Tipi comuni: `HostingAccount`, `PullRequestRemote`, `PullRequest`, `PullRequestDetail`, `CiStatus`, `HostingRepo`, `MergeOptions`, `NewPullRequest`, `PullRequestChanges`; `AppSettings.accounts` e `remoteAccounts`; `GitErrorInfo.code`; `CommandLogEntry.http` |
| `src/main/hosting/remote-url.ts` | `parseRemoteUrl(url)` |
| `src/main/hosting/provider.ts` | Interfaccia `HostingProvider`, `ciSummary`, `byTime`, `seconds`, `pathSegments` |
| `src/main/hosting/http.ts` | `HostingClient`, `HostingError`, `apiBase`, `nextLink`, `serviceMessage` |
| `src/main/hosting/github.ts` / `gitlab.ts` | I due provider |
| `src/main/hosting/accounts.ts` | `TokenStore`, `accountFor`, `addAccount`, `removeAccount`, `setRemoteAccount` |
| `src/main/hosting/pull-requests.ts` | `connect`, `pullRequestRemotes`, `projectOf`, `createProvider` |
| `src/main/git/pull-request.ts` | `fetchPullRequest`, `readPullRequestChanges`, `readPullRequestFileDiff`, `checkoutPullRequest`, `branchSummary` |
| `src/main/ipc-handlers.ts`, `src/shared/ipc.ts`, `src/preload/index.ts` | Canali `accounts:*`, `pr:*` e l'evento `repo:fetched` |
| `src/renderer/pull-requests/model.ts` | Funzioni pure: `matches`, `pickRemote`, `defaultMergeMessage`, `headLabel`, `splitUpstream` |
| `src/renderer/stores/pull-requests.ts` | `usePullRequestStore(root)` |
| `src/renderer/components/PullRequestList.vue`, `PullRequestDetail.vue`, `MergeDialog.vue`, `CreatePullRequestDialog.vue`, `Markdown.vue`, `settings/AccountSettings.vue`, `settings/AccountDialog.vue` | Interfaccia |
| `src/renderer/actions/pull-requests.ts` | Azioni ⌘1/⌘2, nuova PR, `openCreatePullRequest` |
| `test/helpers/hosting.ts` | Servizio finto per i test unit dei provider |
| `test/e2e/fake-hosting.ts` | Server HTTP finto (GitHub e GitLab) e repo di prova per gli E2E |

---

### Task 1: Tipi comuni, URL dei remote, riepilogo della CI

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/hosting/remote-url.ts`, `src/main/hosting/provider.ts`
- Test: `test/unit/hosting.test.ts`

**Interfaces:**
- Produces:
  - i tipi di questa sezione, usati da tutti i task successivi;
  - `parseRemoteUrl(url: string): { host: string; path: string } | null`;
  - `interface HostingProvider` (vedi sotto), `ciSummary(checks: Check[]): CiStatus['summary']`, `byTime(items: TimelineItem[]): TimelineItem[]`, `seconds(iso: string | null | undefined): number`, `pathSegments(path: string): string`.

- [ ] **Step 1: Test unit**

Crea `test/unit/hosting.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ciSummary } from '../../src/main/hosting/provider'
import { parseRemoteUrl } from '../../src/main/hosting/remote-url'
import type { Check } from '../../src/shared/types'

describe('parseRemoteUrl', () => {
  it('https, con o senza .git, utente e porta', () => {
    expect(parseRemoteUrl('https://github.com/acme/demo-app.git')).toEqual({ host: 'github.com', path: 'acme/demo-app' })
    expect(parseRemoteUrl('https://ada:secret@GitLab.Example.com:8443/acme/demo-app/')).toEqual({ host: 'gitlab.example.com:8443', path: 'acme/demo-app' })
  })

  it('ssh in forma scp e come URL; la porta di ssh non conta', () => {
    expect(parseRemoteUrl('git@github.com:acme/demo-app.git')).toEqual({ host: 'github.com', path: 'acme/demo-app' })
    expect(parseRemoteUrl('ssh://git@gitlab.example.com:2222/acme/demo-app.git')).toEqual({ host: 'gitlab.example.com', path: 'acme/demo-app' })
    expect(parseRemoteUrl('gitlab.example.com:acme/demo-app')).toEqual({ host: 'gitlab.example.com', path: 'acme/demo-app' })
  })

  it('sottogruppi di GitLab', () => {
    expect(parseRemoteUrl('git@gitlab.example.com:acme/backend/demo-app.git')).toEqual({ host: 'gitlab.example.com', path: 'acme/backend/demo-app' })
  })

  it('cartelle locali e URL non riconosciuti: null', () => {
    for (const url of ['/srv/git/demo.git', '../demo', 'C:\\repos\\demo', 'C:/repos/demo', 'file:///srv/git/demo.git', 'https://github.com/solo-owner', 'ftp://example.com/a/b']) {
      expect(parseRemoteUrl(url), url).toBeNull()
    }
  })
})

describe('ciSummary', () => {
  const check = (state: Check['state']): Check => ({ name: state, state, url: null })
  it('fallito batte in corso, in corso batte superato; senza check: nessuno', () => {
    expect(ciSummary([check('passed'), check('running'), check('failed')])).toBe('failed')
    expect(ciSummary([check('passed'), check('running')])).toBe('running')
    expect(ciSummary([check('passed'), check('skipped'), check('cancelled')])).toBe('passed')
    expect(ciSummary([])).toBe('none')
  })
})
```

Run: `npx vitest run test/unit/hosting.test.ts`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 2: Tipi**

In `src/shared/types.ts`:

- in `CommandLogEntry`, dopo `stderr: string`:

```ts
  /** Chiamata alle API di un servizio: args è [metodo, URL] ed exitCode lo stato HTTP. */
  http?: boolean
```

- in `GitErrorInfo`, dopo `message: string`:

```ts
  /** Errori dei servizi: 'auth' quando il token non è (più) valido, per proporre di aggiornarlo. */
  code?: 'auth'
```

- in `AppSettings`, dopo `defaultTemplates`:

```ts
  /** Account di GitHub e GitLab, senza token (stanno cifrati in tokens.json). */
  accounts: HostingAccount[]
  /** "<radice del repo>\n<remote>" → id dell'account scelto dal menu del remote. */
  remoteAccounts: Record<string, string>
```

- in fondo al file:

```ts
export type HostingService = 'github' | 'gitlab'

/** Account di GitHub o GitLab; il token sta cifrato in tokens.json, mai qui. */
export interface HostingAccount {
  id: string
  service: HostingService
  /** Server, es. github.com o gitlab.example.com:8443 */
  host: string
  username: string
}

/** Un remote del repo e l'account che Merlino usa per le sue pull request. */
export interface PullRequestRemote {
  name: string
  /** null se l'URL non è di un server (cartella locale, file://). */
  host: string | null
  account: HostingAccount | null
}

export type PullRequestState = 'open' | 'merged' | 'closed'
export type PullRequestFilter = PullRequestState | 'all'

export interface PullRequest {
  number: number
  title: string
  body: string
  author: string
  state: PullRequestState
  draft: boolean
  head: { branch: string; sha: string }
  base: { branch: string }
  /** La PR viene da un altro repository. */
  fork: boolean
  /** Proprietario del fork (utente o gruppo); null se non è un fork o non è noto. */
  headOwner: string | null
  /** Secondi dall'epoch, come i commit. */
  createdAt: number
  updatedAt: number
  /** null se il servizio non lo dice nella lista (GitHub). */
  comments: number | null
  url: string
}

export type TimelineItem =
  | { kind: 'comment'; id: string; author: string; time: number; body: string }
  | { kind: 'commit'; sha: string; author: string; time: number; subject: string }

/** Perché il servizio non permette il merge. */
export type MergeBlock = 'conflicts' | 'checks' | 'approvals' | 'draft' | 'discussions' | 'rebase' | 'blocked' | 'closed'

export interface PullRequestDetail extends PullRequest {
  /** Inizio della PR: GitHub base.sha, GitLab diff_refs.base_sha ('' se il servizio non lo dà ancora). */
  baseSha: string
  mergeBlock: MergeBlock | null
  /** Commenti e commit in ordine di tempo. */
  timeline: TimelineItem[]
}

export type MergeMethod = 'merge' | 'squash' | 'rebase' | 'ff'

/** Impostazioni del repository sul server che servono a Merlino. */
export interface HostingRepo {
  defaultBranch: string
  /** GitHub: fra merge, squash e rebase; GitLab: quello del progetto (merge o ff). */
  methods: MergeMethod[]
  /** Squash di GitLab; null su GitHub, dove è un metodo. */
  squash: 'never' | 'optional' | 'default' | 'always' | null
  deleteBranch: boolean
}

export type CheckState = 'passed' | 'failed' | 'running' | 'skipped' | 'cancelled'

export interface Check {
  name: string
  state: CheckState
  url: string | null
}

export interface CiStatus {
  summary: 'passed' | 'failed' | 'running' | 'none'
  checks: Check[]
}

export interface MergeOptions {
  method: MergeMethod
  /** Testa mostrata all'utente: se nel frattempo è cambiata, il servizio rifiuta. */
  sha: string
  /** '' = messaggio predefinito del servizio. */
  message: string
  /** Squash di GitLab (su GitHub è il metodo). */
  squash: boolean
  deleteBranch: boolean
}

export interface NewPullRequest {
  /** Remote di destinazione. */
  remote: string
  base: string
  /** Remote del branch con le modifiche: lo stesso o un fork sullo stesso server. */
  headRemote: string
  head: string
  title: string
  body: string
  draft: boolean
}

/** Commit e file di una PR, letti con git dopo averne scaricato gli oggetti. */
export interface PullRequestChanges {
  commits: Commit[]
  files: FileChange[]
}
```

- [ ] **Step 3: `src/main/hosting/remote-url.ts`**

```ts
/** Server e percorso del progetto dall'URL configurato del remote; null per cartelle locali e URL non riconosciuti. */
export function parseRemoteUrl(url: string): { host: string; path: string } | null {
  let host: string
  let path: string
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return null
    }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(u.protocol) || !u.hostname) return null
    // La porta conta solo per http(s): quella di ssh non è quella delle API
    host = u.protocol.startsWith('http') ? u.host : u.hostname
    path = decodeURIComponent(u.pathname)
  } else {
    // Forma scp di ssh: [utente@]server:percorso (C:\… e C:/… sono cartelle di Windows)
    const scp = /^(?:[^@/]+@)?([^:/\\]+):(?![/\\])(.+)$/.exec(url)
    if (!scp) return null
    host = scp[1]
    path = scp[2]
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  return path.includes('/') ? { host: host.toLowerCase(), path } : null
}
```

- [ ] **Step 4: `src/main/hosting/provider.ts`**

```ts
import type { Check, CiStatus, HostingRepo, MergeOptions, NewPullRequest, PullRequest, PullRequestDetail, PullRequestFilter, TimelineItem } from '../../shared/types'

/** Le operazioni di un servizio (GitHub, GitLab) su un progetto; project è il percorso, es. acme/demo-app. */
export interface HostingProvider {
  /** Nome utente del token. */
  verify(): Promise<string>
  repo(project: string): Promise<HostingRepo>
  list(project: string, filter: PullRequestFilter): Promise<PullRequest[]>
  detail(project: string, number: number): Promise<PullRequestDetail>
  checks(project: string, sha: string): Promise<CiStatus>
  comment(project: string, number: number, body: string): Promise<void>
  merge(project: string, number: number, options: MergeOptions): Promise<void>
  setState(project: string, number: number, state: 'open' | 'closed'): Promise<void>
  /** headProject: il progetto del branch con le modifiche (un fork, o lo stesso). Restituisce il numero della nuova PR. */
  create(project: string, headProject: string, input: NewPullRequest): Promise<number>
  /** Ref della PR sul remote di destinazione. */
  pullRef(number: number): string
}

/** Fallito se un check è fallito, in corso se uno gira, superato se ce ne sono, altrimenti nessuno. */
export function ciSummary(checks: Check[]): CiStatus['summary'] {
  if (checks.some((c) => c.state === 'failed')) return 'failed'
  if (checks.some((c) => c.state === 'running')) return 'running'
  return checks.length ? 'passed' : 'none'
}

/** Commenti e commit in ordine di tempo (a parità, l'ordine di arrivo). */
export const byTime = (items: TimelineItem[]): TimelineItem[] => items.toSorted((a, b) => a.time - b.time)

/** Secondi dall'epoch da una data ISO, come i commit. */
export const seconds = (iso: string | null | undefined): number => (iso ? Math.floor(Date.parse(iso) / 1000) : 0)

/** Segmenti di un percorso codificati uno per uno: gli "/" restano. */
export const pathSegments = (path: string): string => path.split('/').map(encodeURIComponent).join('/')
```

Run: `npx vitest run test/unit/hosting.test.ts`
Expected: PASS.

- [ ] **Step 5: Verifica e commit**

`npm run typecheck` segnala `accounts` e `remoteAccounts` mancanti nei default di `src/main/settings.ts` e in `test/unit/settings.test.ts`: in `DEFAULTS` di `settings.ts` aggiungi `accounts: [],` e `remoteAccounts: {},`; nel `base` di `settings.test.ts` aggiungi `accounts: [], remoteAccounts: {}`.

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: tipi delle pull request, server e progetto dall'URL del remote, riepilogo della CI"
```

---

### Task 2: Client HTTP dei servizi

**Files:**
- Create: `src/main/hosting/http.ts`
- Modify: `src/main/git/runner.ts` (`logId`), `src/renderer/components/OutputPanel.vue`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/unit/http.test.ts`

**Interfaces:**
- Consumes: `HostingAccount`, `CommandLogEntry` (Task 1).
- Produces:
  - `type Fetch = (url: string, init: RequestInit) => Promise<Response>`;
  - `class HostingError extends Error { kind: 'auth' | 'rateLimit' | 'forbidden' | 'notFound' | 'rejected' | 'network' }`;
  - `apiBase(account: Pick<HostingAccount, 'service' | 'host'>): string`;
  - `class HostingClient { constructor(o: ClientOptions); request<T>(method, path, body?): Promise<T>; all<T>(path, max): Promise<T[]> }`, con `ClientOptions = { account: Pick<HostingAccount, 'service' | 'host' | 'username'>; token: string; fetch: Fetch; log: (e: CommandLogEntry) => void; repo: string | null }`;
  - `logId(): number` in `runner.ts`.

- [ ] **Step 1: Test unit**

Crea `test/unit/http.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HostingClient, type HostingError, nextLink } from '../../src/main/hosting/http'
import type { CommandLogEntry } from '../../src/shared/types'

const github = { service: 'github' as const, host: 'github.com', username: 'ada' }
const gitlab = { service: 'gitlab' as const, host: 'gitlab.example.com', username: 'ada' }
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init })

/** Client con un fetch finto che risponde con le risposte in coda (un Error = errore di rete). */
function client(account: typeof github | typeof gitlab, ...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const log: CommandLogEntry[] = []
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next || next instanceof Error) throw next ?? new Error('nessuna risposta')
    return next
  }
  return { c: new HostingClient({ account, token: 'tok-secret', fetch, log: (e) => log.push(e), repo: '/repo' }), calls, log }
}

async function failure(p: Promise<unknown>): Promise<HostingError> {
  try {
    await p
  } catch (e) {
    return e as HostingError
  }
  throw new Error('nessun errore')
}

describe('HostingClient', () => {
  it('GitHub: api.github.com, Bearer, niente redirect, timeout; il token non finisce nel log', async () => {
    const { c, calls, log } = client(github, json({ login: 'ada' }))
    expect(await c.request('GET', '/user')).toEqual({ login: 'ada' })
    expect(calls[0].url).toBe('https://api.github.com/user')
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer tok-secret' })
    expect(calls[0].init.redirect).toBe('error')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
    expect(log).toMatchObject([{ args: ['GET', 'https://api.github.com/user'], http: true, exitCode: 200, ok: true, repo: '/repo' }])
    expect(JSON.stringify(log)).not.toContain('tok-secret')
  })

  it('GitLab: /api/v4 e PRIVATE-TOKEN; il corpo va in JSON', async () => {
    const { c, calls } = client(gitlab, json({ id: 1 }, { status: 201 }))
    await c.request('POST', '/projects/1/merge_requests/2/notes', { body: 'ciao' })
    expect(calls[0].url).toBe('https://gitlab.example.com/api/v4/projects/1/merge_requests/2/notes')
    expect(calls[0].init.headers).toMatchObject({ 'PRIVATE-TOKEN': 'tok-secret', 'Content-Type': 'application/json' })
    expect(calls[0].init.body).toBe('{"body":"ciao"}')
  })

  it('paginazione: segue Link rel="next" fino al massimo', async () => {
    const next = (page: number) => ({ link: `<https://api.github.com/items?page=${page}>; rel="next", <https://api.github.com/items?page=9>; rel="last"` })
    const { c, calls } = client(github, json([1, 2], { headers: next(2) }), json([3, 4], { headers: next(3) }), json([5]))
    expect(await c.all('/items?page=1', 3)).toEqual([1, 2, 3])
    expect(calls.map((x) => x.url)).toEqual(['https://api.github.com/items?page=1', 'https://api.github.com/items?page=2'])
  })

  it('un link verso un altro server non riceve il token', async () => {
    const { c, calls } = client(github, json([1], { headers: { link: '<https://evil.example.com/x>; rel="next"' } }))
    await expect(c.all('/items', 10)).rejects.toThrow()
    expect(calls).toHaveLength(1)
  })

  it('errori tradotti', async () => {
    const cases: [Response, HostingError['kind'], RegExp][] = [
      [new Response('{"message":"Bad credentials"}', { status: 401 }), 'auth', /ada@github\.com/],
      [new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' } }), 'rateLimit', /try again at/],
      [new Response('{}', { status: 429, headers: { 'ratelimit-reset': '1700000000' } }), 'rateLimit', /try again at/],
      [new Response('{}', { status: 403 }), 'forbidden', /repo/],
      [new Response('{}', { status: 404 }), 'notFound', /github\.com/],
      [new Response('{"message":"Head branch was modified. Review and try the merge again."}', { status: 409 }), 'rejected', /changed in the meantime/],
      [new Response('{"message":"Validation Failed","errors":[{"message":"A pull request already exists for acme:feature/login."}]}', { status: 422 }), 'rejected', /already exists/],
      [new Response('', { status: 502 }), 'network', /github\.com is not responding/],
    ]
    for (const [res, kind, message] of cases) {
      const e = await failure(client(github, res).c.request('GET', '/x'))
      expect(e.kind, String(res.status)).toBe(kind)
      expect(e.message).toMatch(message)
    }
    expect(await failure(client(github, new Error('ECONNRESET')).c.request('GET', '/x'))).toMatchObject({ kind: 'network', message: 'github.com is not responding' })
  })

  it('nextLink', () => {
    expect(nextLink(null)).toBeNull()
    expect(nextLink('<https://a.example/x?page=1>; rel="prev", <https://a.example/x?page=3>; rel="next"')).toBe('https://a.example/x?page=3')
  })
})
```

Run: `npx vitest run test/unit/http.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `logId` e testi**

In `src/main/git/runner.ts`, dopo `let nextLogId = 1`:

```ts
/** Id della prossima riga del log dei comandi (git e chiamate HTTP). */
export const logId = (): number => nextLogId++
```

e in `exec` sostituisci `id: nextLogId++` con `id: logId()`.

In `en.ts` e `it.ts`, dopo le chiavi `error.*`:

| Chiave | Inglese | Italiano |
|---|---|---|
| `hosting.tokenInvalid` | The token for {account} is not valid or has expired | Il token di {account} non è valido o è scaduto |
| `hosting.rateLimit` | Request limit reached: try again at {time} | Limite di richieste raggiunto: riprova alle {time} |
| `hosting.forbidden` | The token does not have the required permissions ({scope} is needed) | Il token non ha i permessi necessari (serve {scope}) |
| `hosting.notFound` | Repository not found on {host}, or the token cannot see it | Repository non trovato su {host}, o il token non può vederlo |
| `hosting.unreachable` | {host} is not responding | {host} non risponde |
| `hosting.insecure` | Merlino sends the token to {host} only over https | Merlino manda il token a {host} solo in https |
| `hosting.shaChanged` | The pull request changed in the meantime: refresh and try again | La pull request è cambiata nel frattempo: aggiorna e riprova |
| `hosting.conflicts` | The pull request has conflicts | La pull request ha dei conflitti |
| `hosting.requiredChecks` | Required checks have not passed | I controlli obbligatori non sono superati |
| `hosting.httpError` | The server answered with an error (HTTP {status}) | Il server ha risposto con un errore (HTTP {status}) |

- [ ] **Step 3: `src/main/hosting/http.ts`**

```ts
import { dateLocale } from '../../shared/i18n'
import type { CommandLogEntry, HostingAccount } from '../../shared/types'
import { logId } from '../git/runner'
import { language, t } from '../i18n'

export type Fetch = (url: string, init: RequestInit) => Promise<Response>
export type HostingErrorKind = 'auth' | 'rateLimit' | 'forbidden' | 'notFound' | 'rejected' | 'network'

export class HostingError extends Error {
  constructor(
    readonly kind: HostingErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'HostingError'
  }
}

export interface ClientOptions {
  account: Pick<HostingAccount, 'service' | 'host' | 'username'>
  token: string
  fetch: Fetch
  log: (entry: CommandLogEntry) => void
  /** Repo per cui si fa la chiamata, per il log dei comandi; null per la verifica di un account. */
  repo: string | null
}

const TIMEOUT_MS = 20_000
const e2e = () => process.env.MERLINO_E2E === '1'

/** Indirizzo delle API; nei test E2E MERLINO_E2E_API porta tutto al server finto. */
export function apiBase(account: Pick<HostingAccount, 'service' | 'host'>): string {
  const fake = e2e() ? process.env.MERLINO_E2E_API : undefined
  const origin = fake ?? `https://${account.host}`
  if (account.service === 'gitlab') return `${origin}/api/v4`
  return !fake && account.host === 'github.com' ? 'https://api.github.com' : `${origin}/api/v3`
}

/** L'URL della pagina successiva dall'header Link (rel="next"). */
export function nextLink(header: string | null): string | null {
  return /<([^>]+)>\s*;\s*rel="next"/.exec(header ?? '')?.[1] ?? null
}

/** Il messaggio del servizio nel corpo di un errore: GitHub { message, errors }, GitLab { message } o { error }. */
export function serviceMessage(body: string): string {
  const flat = (v: unknown): string[] =>
    typeof v === 'string'
      ? [v]
      : Array.isArray(v)
        ? v.flatMap(flat)
        : v && typeof v === 'object'
          ? Object.entries(v).flatMap(([k, x]) => flat(x).map((s) => `${k} ${s}`))
          : []
  try {
    const v = JSON.parse(body) as { message?: unknown; error?: unknown; errors?: unknown }
    const errors = Array.isArray(v.errors) ? v.errors.flatMap((e: { message?: unknown } | null) => flat(e?.message)) : []
    return [...flat(v.message), ...flat(v.error), ...errors].join(' ')
  } catch {
    return body.slice(0, 200)
  }
}

/** I rifiuti più comuni, tradotti; gli altri restano col testo del servizio. */
function rejection(message: string): string {
  if (/head branch was modified|sha does not match/i.test(message)) return t('hosting.shaChanged')
  if (/conflict|not mergeable|cannot be merged/i.test(message)) return t('hosting.conflicts')
  if (/status check|pipeline must succeed/i.test(message)) return t('hosting.requiredChecks')
  return message
}

/** Chiamate alle API di un account: JSON, timeout di 20 s, niente redirect, errori tradotti, una riga nel log per chiamata. */
export class HostingClient {
  readonly base: string

  constructor(private readonly o: ClientOptions) {
    this.base = apiBase(o.account)
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await this.send(method, `${this.base}${path}`, body)).data as T
  }

  /** GET di tutte le pagine, seguendo Link rel="next", fino a max elementi. */
  async all<T>(path: string, max: number): Promise<T[]> {
    const items: T[] = []
    let url: string | null = `${this.base}${path}`
    while (url && items.length < max) {
      const page = await this.send('GET', url)
      items.push(...(page.data as T[]))
      url = nextLink(page.headers.get('link'))
    }
    return items.slice(0, max)
  }

  private headers(json: boolean): Record<string, string> {
    const auth: Record<string, string> =
      this.o.account.service === 'github'
        ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.o.token}`, 'X-GitHub-Api-Version': '2022-11-28' }
        : { Accept: 'application/json', 'PRIVATE-TOKEN': this.o.token }
    return { ...auth, 'User-Agent': 'Merlino', ...(json ? { 'Content-Type': 'application/json' } : {}) }
  }

  private async send(method: string, url: string, body?: unknown): Promise<{ data: unknown; headers: Headers }> {
    const { host } = this.o.account
    const target = new URL(url)
    // Il token va solo al server dell'account e solo cifrato (http solo verso il server finto dei test E2E)
    const secure = target.protocol === 'https:' || (e2e() && target.hostname === '127.0.0.1')
    if (target.origin !== new URL(this.base).origin || !secure) throw new HostingError('network', t('hosting.insecure', { host }))
    const startedAt = Date.now()
    const log = (exitCode: number | null, ok: boolean, stderr: string) =>
      this.o.log({
        id: logId(),
        repo: this.o.repo,
        args: [method, `${target.origin}${target.pathname}${target.search}`],
        http: true,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode,
        ok,
        stderr,
      })
    let res: Response
    let text: string
    try {
      res = await this.o.fetch(url, {
        method,
        headers: this.headers(body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      text = await res.text()
    } catch (e) {
      log(null, false, e instanceof Error ? e.message : String(e))
      throw new HostingError('network', t('hosting.unreachable', { host }))
    }
    if (res.ok) {
      log(res.status, true, '')
      return { data: text ? JSON.parse(text) : null, headers: res.headers }
    }
    const detail = serviceMessage(text)
    log(res.status, false, detail)
    throw this.error(res, detail)
  }

  private error(res: Response, detail: string): HostingError {
    const { service, host, username } = this.o.account
    const h = res.headers
    const remaining = h.get('x-ratelimit-remaining') ?? h.get('ratelimit-remaining')
    if (res.status === 429 || (res.status === 403 && remaining === '0')) {
      const reset = Number(h.get('x-ratelimit-reset') ?? h.get('ratelimit-reset'))
      const time = reset ? new Date(reset * 1000).toLocaleTimeString(dateLocale(language()), { hour: '2-digit', minute: '2-digit' }) : '?'
      return new HostingError('rateLimit', t('hosting.rateLimit', { time }))
    }
    switch (res.status) {
      case 401:
        return new HostingError('auth', t('hosting.tokenInvalid', { account: username ? `${username}@${host}` : host }))
      case 403:
        return new HostingError('forbidden', t('hosting.forbidden', { scope: service === 'github' ? 'repo' : 'api' }))
      case 404:
        return new HostingError('notFound', t('hosting.notFound', { host }))
      case 405:
      case 409:
      case 422:
        return new HostingError('rejected', rejection(detail) || t('hosting.httpError', { status: res.status }))
    }
    if (res.status >= 500) return new HostingError('network', t('hosting.unreachable', { host }))
    return new HostingError('rejected', detail || t('hosting.httpError', { status: res.status }))
  }
}
```

Run: `npx vitest run test/unit/http.test.ts`
Expected: PASS.

- [ ] **Step 4: Le chiamate HTTP nel pannello di output**

In `src/renderer/components/OutputPanel.vue` le righe HTTP mostrano metodo e URL invece di `git …`, e lo stato HTTP invece dell'exit code:

```vue
        <code>{{ e.http ? e.args.join(' ') : e.args.length ? `git ${e.args.join(' ')}` : t('output.uiError') }}</code>
        <span class="muted">{{ e.durationMs }} ms</span>
        <span v-if="!e.ok && e.exitCode !== null" class="error">{{ e.http ? `HTTP ${e.exitCode}` : `exit ${e.exitCode}` }}</span>
```

- [ ] **Step 5: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: client HTTP dei servizi (timeout, niente redirect, paginazione, errori tradotti, log)"
```

---

### Task 3: Provider di GitHub

**Files:**
- Create: `src/main/hosting/github.ts`, `test/helpers/hosting.ts`
- Test: `test/unit/github.test.ts`

**Interfaces:**
- Consumes: `HostingClient` (Task 2); `HostingProvider`, `ciSummary`, `byTime`, `seconds`, `pathSegments` (Task 1).
- Produces: `class GitHub implements HostingProvider`, `fromGitHub(p: GhPull): PullRequest`, `interface GhPull`; `fakeService(service, host, routes)` per i test.

- [ ] **Step 1: Servizio finto per i test**

Crea `test/helpers/hosting.ts`:

```ts
import { HostingClient } from '../../src/main/hosting/http'
import type { HostingService } from '../../src/shared/types'

export type Route = [method: string, path: string, body: unknown]

/** Un servizio finto: risponde per metodo e percorso (query compresa), 404 altrimenti, e registra le richieste. */
export function fakeService(service: HostingService, host: string, routes: Route[]) {
  const requests: { method: string; path: string; body: unknown }[] = []
  const fetch = async (url: string, init: RequestInit) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    const path = u.pathname + u.search
    requests.push({ method, path, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    const route = routes.find(([m, p]) => m === method && p === path)
    return route ? new Response(JSON.stringify(route[2])) : new Response('{"message":"404 Not Found"}', { status: 404 })
  }
  return { client: new HostingClient({ account: { service, host, username: 'ada' }, token: 'tok', fetch, log: () => {}, repo: null }), requests }
}
```

- [ ] **Step 2: Test unit**

Crea `test/unit/github.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { type GhPull, GitHub } from '../../src/main/hosting/github'
import { fakeService, type Route } from '../helpers/hosting'

function github(routes: Route[]) {
  const { client, requests } = fakeService('github', 'github.com', routes)
  return { gh: new GitHub(client), requests }
}

const repo = (owner: string) => ({ full_name: `${owner}/demo-app`, owner: { login: owner } })
const pull = (n: number, extra: Partial<GhPull> = {}): GhPull => ({
  number: n,
  title: `PR ${n}`,
  body: 'Descrizione',
  user: { login: 'ada' },
  state: 'open',
  draft: false,
  merged_at: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  html_url: `https://github.com/acme/demo-app/pull/${n}`,
  head: { ref: 'feature/login', sha: 'a'.repeat(40), repo: repo('acme') },
  base: { ref: 'main', sha: 'b'.repeat(40), repo: repo('acme') },
  ...extra,
})
const closedList = '/repos/acme/demo-app/pulls?state=closed&sort=updated&direction=desc&per_page=100'

describe('GitHub', () => {
  it('lista: closed comprende le unite, separate con merged_at; fork col proprietario', async () => {
    const merged = pull(2, { state: 'closed', merged_at: '2026-10-03T10:00:00Z' })
    const fork = pull(3, { state: 'closed', head: { ref: 'fix', sha: 'c'.repeat(40), repo: repo('grace') } })
    const { gh } = github([['GET', closedList, [merged, fork]]])
    expect((await gh.list('acme/demo-app', 'merged')).map((p) => p.number)).toEqual([2])
    expect(await gh.list('acme/demo-app', 'closed')).toMatchObject([
      { number: 3, state: 'closed', fork: true, headOwner: 'grace', comments: null, updatedAt: Date.parse('2026-10-02T10:00:00Z') / 1000 },
    ])
  })

  it('dettaglio: commenti e commit in ordine di tempo, motivo del blocco, commenti contati', async () => {
    const { gh } = github([
      ['GET', '/repos/acme/demo-app/pulls/1', pull(1, { mergeable_state: 'dirty', comments: 1, review_comments: 2 })],
      ['GET', '/repos/acme/demo-app/issues/1/comments?per_page=100', [{ id: 7, user: { login: 'grace' }, body: 'Fatto?', created_at: '2026-10-01T12:00:00Z' }]],
      [
        'GET',
        '/repos/acme/demo-app/pulls/1/commits?per_page=100',
        [
          { sha: 'c1', author: { login: 'ada' }, commit: { message: 'Primo\n\ncorpo', author: { name: 'Ada', date: '2026-10-01T11:00:00Z' }, committer: { date: '2026-10-01T11:00:00Z' } } },
          { sha: 'c2', author: null, commit: { message: 'Secondo', author: { name: 'Ada', date: '2026-10-01T13:00:00Z' }, committer: { date: '2026-10-01T13:00:00Z' } } },
        ],
      ],
    ])
    const d = await gh.detail('acme/demo-app', 1)
    expect(d).toMatchObject({ baseSha: 'b'.repeat(40), mergeBlock: 'conflicts', comments: 3 })
    expect(d.timeline.map((x) => (x.kind === 'commit' ? x.subject : x.body))).toEqual(['Primo', 'Fatto?', 'Secondo'])
    expect(d.timeline[2]).toMatchObject({ author: 'Ada' })
  })

  it('CI: stati combinati e check run', async () => {
    const sha = 'a'.repeat(40)
    const { gh } = github([
      ['GET', `/repos/acme/demo-app/commits/${sha}/status`, { statuses: [{ context: 'lint', state: 'success', target_url: 'https://ci.example.com/1' }] }],
      [
        'GET',
        `/repos/acme/demo-app/commits/${sha}/check-runs?per_page=100`,
        {
          check_runs: [
            { name: 'test', status: 'completed', conclusion: 'failure', html_url: null },
            { name: 'build', status: 'in_progress', conclusion: null, html_url: null },
            { name: 'docs', status: 'completed', conclusion: 'skipped', html_url: null },
          ],
        },
      ],
    ])
    expect(await gh.checks('acme/demo-app', sha)).toEqual({
      summary: 'failed',
      checks: [
        { name: 'lint', state: 'passed', url: 'https://ci.example.com/1' },
        { name: 'test', state: 'failed', url: null },
        { name: 'build', state: 'running', url: null },
        { name: 'docs', state: 'skipped', url: null },
      ],
    })
  })

  it('merge: metodo, SHA e messaggio; poi cancella il branch, ma non quello di un fork', async () => {
    const options = { method: 'squash' as const, sha: 'a'.repeat(40), message: 'Titolo (#1)\n\nCorpo', squash: false, deleteBranch: true }
    const { gh, requests } = github([
      ['GET', '/repos/acme/demo-app/pulls/1', pull(1)],
      ['PUT', '/repos/acme/demo-app/pulls/1/merge', { merged: true }],
      ['DELETE', '/repos/acme/demo-app/git/refs/heads/feature/login', null],
    ])
    await gh.merge('acme/demo-app', 1, options)
    expect(requests.slice(1)).toEqual([
      { method: 'PUT', path: '/repos/acme/demo-app/pulls/1/merge', body: { merge_method: 'squash', sha: 'a'.repeat(40), commit_title: 'Titolo (#1)', commit_message: 'Corpo' } },
      { method: 'DELETE', path: '/repos/acme/demo-app/git/refs/heads/feature/login', body: undefined },
    ])

    const forked = pull(1, { head: { ref: 'fix', sha: 'a'.repeat(40), repo: repo('grace') } })
    const second = github([
      ['GET', '/repos/acme/demo-app/pulls/1', forked],
      ['PUT', '/repos/acme/demo-app/pulls/1/merge', { merged: true }],
    ])
    await second.gh.merge('acme/demo-app', 1, { ...options, method: 'rebase' })
    expect(second.requests.map((r) => r.method)).toEqual(['GET', 'PUT'])
    expect(second.requests[1]?.body).toEqual({ merge_method: 'rebase', sha: 'a'.repeat(40) })
  })

  it('creazione da un fork: head è proprietario:branch', async () => {
    const { gh, requests } = github([['POST', '/repos/acme/demo-app/pulls', pull(9)]])
    const input = { remote: 'upstream', base: 'main', headRemote: 'origin', head: 'feature/login', title: 'Login', body: '', draft: true }
    expect(await gh.create('acme/demo-app', 'grace/demo-app', input)).toBe(9)
    expect(requests[0]?.body).toEqual({ title: 'Login', body: '', head: 'grace:feature/login', base: 'main', draft: true })
  })

  it('impostazioni del repo: metodi permessi e cancellazione del branch', async () => {
    const { gh } = github([
      ['GET', '/repos/acme/demo-app', { default_branch: 'main', allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: true, delete_branch_on_merge: true }],
    ])
    expect(await gh.repo('acme/demo-app')).toEqual({ defaultBranch: 'main', methods: ['squash', 'rebase'], squash: null, deleteBranch: true })
  })
})
```

Run: `npx vitest run test/unit/github.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 3: `src/main/hosting/github.ts`**

```ts
import type {
  Check,
  CheckState,
  CiStatus,
  HostingRepo,
  MergeBlock,
  MergeMethod,
  MergeOptions,
  NewPullRequest,
  PullRequest,
  PullRequestDetail,
  PullRequestFilter,
  TimelineItem,
} from '../../shared/types'
import type { HostingClient } from './http'
import { byTime, ciSummary, type HostingProvider, pathSegments, seconds } from './provider'

// Le parti delle risposte di GitHub che Merlino usa
interface GhUser {
  login: string
}
interface GhRef {
  ref: string
  sha: string
  /** null se il fork è stato cancellato. */
  repo: { full_name: string; owner: GhUser } | null
}
export interface GhPull {
  number: number
  title: string
  body: string | null
  user: GhUser | null
  state: 'open' | 'closed'
  draft?: boolean
  merged_at: string | null
  created_at: string
  updated_at: string
  html_url: string
  head: GhRef
  base: GhRef
  /** Solo nel dettaglio. */
  comments?: number
  review_comments?: number
  mergeable_state?: string
}
interface GhComment {
  id: number
  user: GhUser | null
  body: string | null
  created_at: string
}
interface GhCommit {
  sha: string
  author: GhUser | null
  commit: { message: string; author: { name: string; date: string } | null; committer: { date: string } | null }
}
interface GhRepo {
  default_branch: string
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
  delete_branch_on_merge?: boolean
}
interface GhStatus {
  statuses: { context: string; state: string; target_url: string | null }[]
}
interface GhCheckRuns {
  check_runs: { name: string; status: string; conclusion: string | null; html_url: string | null }[]
}

const STATUS: Record<string, CheckState> = { success: 'passed', failure: 'failed', error: 'failed', pending: 'running' }
// Le altre conclusioni (failure, timed_out, action_required, startup_failure) sono fallimenti
const CONCLUSION: Record<string, CheckState> = { success: 'passed', neutral: 'passed', skipped: 'skipped', stale: 'skipped', cancelled: 'cancelled' }
// mergeable_state: clean, unstable (CI facoltativa fallita), has_hooks e unknown (ancora in calcolo) non bloccano
const BLOCKS: Record<string, MergeBlock> = { dirty: 'conflicts', behind: 'rebase', blocked: 'blocked', draft: 'draft' }

export function fromGitHub(p: GhPull): PullRequest {
  const fork = p.head.repo?.full_name !== p.base.repo?.full_name
  return {
    number: p.number,
    title: p.title,
    body: p.body ?? '',
    author: p.user?.login ?? '',
    state: p.merged_at ? 'merged' : p.state,
    draft: p.draft === true,
    head: { branch: p.head.ref, sha: p.head.sha },
    base: { branch: p.base.ref },
    fork,
    headOwner: fork ? (p.head.repo?.owner.login ?? null) : null,
    createdAt: seconds(p.created_at),
    updatedAt: seconds(p.updated_at),
    comments: p.comments === undefined ? null : p.comments + (p.review_comments ?? 0),
    url: p.html_url,
  }
}

function mergeBlock(p: GhPull): MergeBlock | null {
  if (p.state !== 'open' || p.merged_at) return 'closed'
  if (p.draft) return 'draft'
  return BLOCKS[p.mergeable_state ?? ''] ?? null
}

export class GitHub implements HostingProvider {
  constructor(private readonly c: HostingClient) {}

  async verify(): Promise<string> {
    return (await this.c.request<GhUser>('GET', '/user')).login
  }

  async repo(project: string): Promise<HostingRepo> {
    const r = await this.c.request<GhRepo>('GET', `/repos/${pathSegments(project)}`)
    // Senza permessi di scrittura i campi allow_* mancano: si propongono tutti, il servizio dirà di no
    const methods: MergeMethod[] = []
    if (r.allow_merge_commit !== false) methods.push('merge')
    if (r.allow_squash_merge !== false) methods.push('squash')
    if (r.allow_rebase_merge !== false) methods.push('rebase')
    return { defaultBranch: r.default_branch, methods, squash: null, deleteBranch: r.delete_branch_on_merge === true }
  }

  async list(project: string, filter: PullRequestFilter): Promise<PullRequest[]> {
    // state=closed comprende anche le unite: si separano con merged_at
    const state = filter === 'merged' ? 'closed' : filter
    const pulls = await this.c.all<GhPull>(
      `/repos/${pathSegments(project)}/pulls?state=${state}&sort=updated&direction=desc&per_page=100`,
      filter === 'open' ? 500 : 100,
    )
    return pulls.map(fromGitHub).filter((p) => filter === 'all' || p.state === filter)
  }

  async detail(project: string, number: number): Promise<PullRequestDetail> {
    const repo = `/repos/${pathSegments(project)}`
    const [p, comments, commits] = await Promise.all([
      this.c.request<GhPull>('GET', `${repo}/pulls/${number}`),
      this.c.all<GhComment>(`${repo}/issues/${number}/comments?per_page=100`, 1000),
      this.c.all<GhCommit>(`${repo}/pulls/${number}/commits?per_page=100`, 250),
    ])
    const timeline: TimelineItem[] = [
      ...comments.map((c): TimelineItem => ({ kind: 'comment', id: String(c.id), author: c.user?.login ?? '', time: seconds(c.created_at), body: c.body ?? '' })),
      ...commits.map(
        (c): TimelineItem => ({
          kind: 'commit',
          sha: c.sha,
          author: c.author?.login ?? c.commit.author?.name ?? '',
          time: seconds(c.commit.committer?.date ?? c.commit.author?.date),
          subject: c.commit.message.split('\n')[0] ?? '',
        }),
      ),
    ]
    return { ...fromGitHub(p), baseSha: p.base.sha, mergeBlock: mergeBlock(p), timeline: byTime(timeline) }
  }

  async checks(project: string, sha: string): Promise<CiStatus> {
    const commit = `/repos/${pathSegments(project)}/commits/${sha}`
    const [status, runs] = await Promise.all([
      this.c.request<GhStatus>('GET', `${commit}/status`),
      this.c.request<GhCheckRuns>('GET', `${commit}/check-runs?per_page=100`),
    ])
    const checks: Check[] = [
      ...status.statuses.map((s): Check => ({ name: s.context, state: STATUS[s.state] ?? 'running', url: s.target_url })),
      ...runs.check_runs.map(
        (r): Check => ({ name: r.name, state: r.status !== 'completed' ? 'running' : (CONCLUSION[r.conclusion ?? ''] ?? 'failed'), url: r.html_url }),
      ),
    ]
    return { summary: ciSummary(checks), checks }
  }

  async comment(project: string, number: number, body: string): Promise<void> {
    await this.c.request('POST', `/repos/${pathSegments(project)}/issues/${number}/comments`, { body })
  }

  async merge(project: string, number: number, o: MergeOptions): Promise<void> {
    const repo = `/repos/${pathSegments(project)}`
    const p = await this.c.request<GhPull>('GET', `${repo}/pulls/${number}`)
    const [title = '', ...rest] = o.message.split('\n')
    const message = o.method !== 'rebase' && o.message.trim() ? { commit_title: title, commit_message: rest.join('\n').trim() } : {}
    await this.c.request('PUT', `${repo}/pulls/${number}/merge`, { merge_method: o.method, sha: o.sha, ...message })
    // Il branch di un fork non è di questo repository
    if (o.deleteBranch && p.head.repo?.full_name === p.base.repo?.full_name) {
      await this.c.request('DELETE', `${repo}/git/refs/heads/${pathSegments(p.head.ref)}`)
    }
  }

  async setState(project: string, number: number, state: 'open' | 'closed'): Promise<void> {
    await this.c.request('PATCH', `/repos/${pathSegments(project)}/pulls/${number}`, { state })
  }

  async create(project: string, headProject: string, input: NewPullRequest): Promise<number> {
    // Da un fork head è "proprietario:branch"
    const head = headProject === project ? input.head : `${headProject.split('/')[0]}:${input.head}`
    const p = await this.c.request<GhPull>('POST', `/repos/${pathSegments(project)}/pulls`, {
      title: input.title,
      body: input.body,
      head,
      base: input.base,
      draft: input.draft,
    })
    return p.number
  }

  pullRef(number: number): string {
    return `refs/pull/${number}/head`
  }
}
```

Run: `npx vitest run test/unit/github.test.ts`
Expected: PASS.

- [ ] **Step 4: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: provider di GitHub (lista, dettaglio, CI, commento, merge, stato, creazione)"
```

---

### Task 4: Provider di GitLab

**Files:**
- Create: `src/main/hosting/gitlab.ts`
- Test: `test/unit/gitlab.test.ts`

**Interfaces:**
- Consumes: come il Task 3, più `fakeService`.
- Produces: `class GitLab implements HostingProvider`, `fromGitLab(m: GlMergeRequest): PullRequest`, `interface GlMergeRequest`.

- [ ] **Step 1: Test unit**

Crea `test/unit/gitlab.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GitLab, type GlMergeRequest } from '../../src/main/hosting/gitlab'
import { fakeService, type Route } from '../helpers/hosting'

function gitlab(routes: Route[]) {
  const { client, requests } = fakeService('gitlab', 'gitlab.example.com', routes)
  return { gl: new GitLab(client), requests }
}

const P = '/api/v4/projects/acme%2Fdemo-app'
const mr = (iid: number, extra: Partial<GlMergeRequest> = {}): GlMergeRequest => ({
  iid,
  title: `MR ${iid}`,
  description: null,
  author: { username: 'ada' },
  state: 'opened',
  draft: false,
  source_branch: 'feature/login',
  target_branch: 'main',
  sha: 'a'.repeat(40),
  source_project_id: 1,
  target_project_id: 1,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  web_url: `https://gitlab.example.com/acme/demo-app/-/merge_requests/${iid}`,
  user_notes_count: 2,
  ...extra,
})

describe('GitLab', () => {
  it('lista: stato e progetto codificato, anche con i sottogruppi', async () => {
    const { gl } = gitlab([['GET', '/api/v4/projects/acme%2Fbackend%2Fdemo-app/merge_requests?state=merged&order_by=updated_at&sort=desc&per_page=100', [mr(4, { state: 'merged' })]]])
    expect(await gl.list('acme/backend/demo-app', 'merged')).toMatchObject([{ number: 4, state: 'merged', body: '', comments: 2, fork: false }])
  })

  it('dettaglio: note di sistema escluse, base_sha, fork col gruppo, motivo del blocco', async () => {
    const { gl } = gitlab([
      ['GET', `${P}/merge_requests/5`, mr(5, { source_project_id: 2, detailed_merge_status: 'not_approved', diff_refs: { base_sha: 'b'.repeat(40) } })],
      [
        'GET',
        `${P}/merge_requests/5/notes?sort=asc&order_by=created_at&per_page=100`,
        [
          { id: 1, body: 'added 1 commit', author: { username: 'ada' }, created_at: '2026-10-01T11:00:00Z', system: true },
          { id: 2, body: 'Ottimo', author: { username: 'grace' }, created_at: '2026-10-01T12:00:00Z', system: false },
        ],
      ],
      ['GET', `${P}/merge_requests/5/commits?per_page=100`, [{ id: 'c1', title: 'Primo', author_name: 'Ada', created_at: '2026-10-01T10:30:00Z' }]],
      ['GET', '/api/v4/projects/2', { id: 2, default_branch: 'main', namespace: { full_path: 'grace' } }],
    ])
    const d = await gl.detail('acme/demo-app', 5)
    expect(d).toMatchObject({ fork: true, headOwner: 'grace', baseSha: 'b'.repeat(40), mergeBlock: 'approvals' })
    expect(d.timeline.map((x) => x.kind)).toEqual(['commit', 'comment'])
  })

  it('CI: la pipeline dello SHA e i suoi job; senza pipeline nessun check', async () => {
    const sha = 'a'.repeat(40)
    const { gl } = gitlab([
      ['GET', `${P}/pipelines?sha=${sha}&per_page=1`, [{ id: 7 }]],
      [
        'GET',
        `${P}/pipelines/7/jobs?per_page=100`,
        [
          { name: 'lint', status: 'success', web_url: 'https://gitlab.example.com/j/1' },
          { name: 'test', status: 'running', web_url: 'https://gitlab.example.com/j/2' },
          { name: 'deploy', status: 'manual', web_url: 'https://gitlab.example.com/j/3' },
        ],
      ],
      ['GET', `${P}/pipelines?sha=${'c'.repeat(40)}&per_page=1`, []],
    ])
    expect(await gl.checks('acme/demo-app', sha)).toMatchObject({ summary: 'running', checks: [{ state: 'passed' }, { state: 'running' }, { state: 'skipped' }] })
    expect(await gl.checks('acme/demo-app', 'c'.repeat(40))).toEqual({ summary: 'none', checks: [] })
  })

  it('merge: squash col suo messaggio, branch da eliminare, SHA', async () => {
    const { gl, requests } = gitlab([['PUT', `${P}/merge_requests/5/merge`, {}]])
    await gl.merge('acme/demo-app', 5, { method: 'merge', sha: 'a'.repeat(40), message: 'Login', squash: true, deleteBranch: true })
    expect(requests[0]?.body).toEqual({ sha: 'a'.repeat(40), squash: true, should_remove_source_branch: true, squash_commit_message: 'Login' })
  })

  it('chiusura e riapertura con state_event', async () => {
    const { gl, requests } = gitlab([['PUT', `${P}/merge_requests/5`, mr(5)]])
    await gl.setState('acme/demo-app', 5, 'closed')
    await gl.setState('acme/demo-app', 5, 'open')
    expect(requests.map((r) => r.body)).toEqual([{ state_event: 'close' }, { state_event: 'reopen' }])
  })

  it('creazione: bozza col prefisso Draft:, da un fork col progetto di destinazione', async () => {
    const { gl, requests } = gitlab([
      ['GET', P, { id: 1, default_branch: 'main', namespace: { full_path: 'acme' } }],
      ['POST', '/api/v4/projects/grace%2Fdemo-app/merge_requests', mr(8)],
    ])
    const input = { remote: 'upstream', base: 'main', headRemote: 'origin', head: 'feature/login', title: 'Login', body: 'Corpo', draft: true }
    expect(await gl.create('acme/demo-app', 'grace/demo-app', input)).toBe(8)
    expect(requests[1]?.body).toEqual({ source_branch: 'feature/login', target_branch: 'main', title: 'Draft: Login', description: 'Corpo', target_project_id: 1 })
  })

  it('impostazioni del progetto: metodo, squash, cancellazione del branch', async () => {
    const { gl } = gitlab([
      ['GET', P, { id: 1, default_branch: 'develop', merge_method: 'ff', squash_option: 'default_on', remove_source_branch_after_merge: true, namespace: { full_path: 'acme' } }],
    ])
    expect(await gl.repo('acme/demo-app')).toEqual({ defaultBranch: 'develop', methods: ['ff'], squash: 'default', deleteBranch: true })
  })
})
```

Run: `npx vitest run test/unit/gitlab.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/main/hosting/gitlab.ts`**

```ts
import type {
  Check,
  CheckState,
  CiStatus,
  HostingRepo,
  MergeBlock,
  MergeOptions,
  NewPullRequest,
  PullRequest,
  PullRequestDetail,
  PullRequestFilter,
  TimelineItem,
} from '../../shared/types'
import type { HostingClient } from './http'
import { byTime, ciSummary, type HostingProvider, seconds } from './provider'

// Le parti delle risposte di GitLab che Merlino usa
interface GlUser {
  username: string
}
export interface GlMergeRequest {
  iid: number
  title: string
  description: string | null
  author: GlUser | null
  state: 'opened' | 'closed' | 'locked' | 'merged'
  draft?: boolean
  source_branch: string
  target_branch: string
  sha: string
  source_project_id: number
  target_project_id: number
  created_at: string
  updated_at: string
  web_url: string
  user_notes_count?: number
  /** Solo nel dettaglio. */
  detailed_merge_status?: string
  has_conflicts?: boolean
  diff_refs?: { base_sha: string } | null
}
interface GlNote {
  id: number
  body: string
  author: GlUser | null
  created_at: string
  system: boolean
}
interface GlCommit {
  id: string
  title: string
  author_name: string
  committed_date?: string
  created_at: string
}
interface GlProject {
  id: number
  default_branch: string
  merge_method?: string
  squash_option?: string
  remove_source_branch_after_merge?: boolean
  namespace: { full_path: string }
}
interface GlJob {
  name: string
  status: string
  web_url: string
}

const STATES = { open: 'opened', merged: 'merged', closed: 'closed', all: 'all' } as const
// I job in attesa (created, pending, preparing, scheduled, waiting_for_resource) contano come in corso
const JOBS: Record<string, CheckState> = { success: 'passed', failed: 'failed', canceled: 'cancelled', canceling: 'cancelled', skipped: 'skipped', manual: 'skipped' }
// detailed_merge_status: gli stati non elencati (mergeable, checking, unchecked…) non bloccano
const BLOCKS: Record<string, MergeBlock> = {
  conflict: 'conflicts',
  broken_status: 'conflicts',
  ci_must_pass: 'checks',
  ci_still_running: 'checks',
  external_status_checks: 'checks',
  not_approved: 'approvals',
  requested_changes: 'approvals',
  draft_status: 'draft',
  discussions_not_resolved: 'discussions',
  need_rebase: 'rebase',
  not_open: 'closed',
  blocked_status: 'blocked',
  merge_request_blocked: 'blocked',
  jira_association_missing: 'blocked',
  locked_paths: 'blocked',
  locked_lfs_files: 'blocked',
  security_policy_violations: 'blocked',
  title_regex: 'blocked',
}
const SQUASH: Record<string, HostingRepo['squash']> = { never: 'never', always: 'always', default_on: 'default', default_off: 'optional' }

export function fromGitLab(m: GlMergeRequest): PullRequest {
  return {
    number: m.iid,
    title: m.title,
    body: m.description ?? '',
    author: m.author?.username ?? '',
    state: m.state === 'opened' ? 'open' : m.state === 'merged' ? 'merged' : 'closed',
    draft: m.draft === true,
    head: { branch: m.source_branch, sha: m.sha },
    base: { branch: m.target_branch },
    fork: m.source_project_id !== m.target_project_id,
    headOwner: null,
    createdAt: seconds(m.created_at),
    updatedAt: seconds(m.updated_at),
    comments: m.user_notes_count ?? null,
    url: m.web_url,
  }
}

export class GitLab implements HostingProvider {
  constructor(private readonly c: HostingClient) {}

  /** Il progetto nelle API: percorso codificato (acme%2Fdemo-app) o id numerico. */
  private project(path: string | number): string {
    return `/projects/${encodeURIComponent(path)}`
  }

  async verify(): Promise<string> {
    return (await this.c.request<GlUser>('GET', '/user')).username
  }

  async repo(project: string): Promise<HostingRepo> {
    const p = await this.c.request<GlProject>('GET', this.project(project))
    return {
      defaultBranch: p.default_branch,
      methods: [p.merge_method === 'ff' ? 'ff' : 'merge'],
      squash: SQUASH[p.squash_option ?? ''] ?? 'optional',
      deleteBranch: p.remove_source_branch_after_merge === true,
    }
  }

  async list(project: string, filter: PullRequestFilter): Promise<PullRequest[]> {
    const mrs = await this.c.all<GlMergeRequest>(
      `${this.project(project)}/merge_requests?state=${STATES[filter]}&order_by=updated_at&sort=desc&per_page=100`,
      filter === 'open' ? 500 : 100,
    )
    return mrs.map(fromGitLab)
  }

  async detail(project: string, number: number): Promise<PullRequestDetail> {
    const mr = `${this.project(project)}/merge_requests/${number}`
    const [m, notes, commits] = await Promise.all([
      this.c.request<GlMergeRequest>('GET', mr),
      this.c.all<GlNote>(`${mr}/notes?sort=asc&order_by=created_at&per_page=100`, 1000),
      this.c.all<GlCommit>(`${mr}/commits?per_page=100`, 250),
    ])
    const pr = fromGitLab(m)
    // Il gruppo del fork è un'altra chiamata; se quel progetto non è visibile resta sconosciuto
    const headOwner = pr.fork
      ? await this.c.request<GlProject>('GET', this.project(m.source_project_id)).then(
          (p) => p.namespace.full_path,
          () => null,
        )
      : null
    const timeline: TimelineItem[] = [
      // Le note di sistema ("added 1 commit", …) non sono commenti
      ...notes
        .filter((n) => !n.system)
        .map((n): TimelineItem => ({ kind: 'comment', id: String(n.id), author: n.author?.username ?? '', time: seconds(n.created_at), body: n.body })),
      ...commits.map((c): TimelineItem => ({ kind: 'commit', sha: c.id, author: c.author_name, time: seconds(c.committed_date ?? c.created_at), subject: c.title })),
    ]
    const mergeBlock = m.state !== 'opened' ? 'closed' : (BLOCKS[m.detailed_merge_status ?? ''] ?? (m.has_conflicts ? 'conflicts' : null))
    return { ...pr, headOwner, baseSha: m.diff_refs?.base_sha ?? '', mergeBlock, timeline: byTime(timeline) }
  }

  async checks(project: string, sha: string): Promise<CiStatus> {
    const [pipeline] = await this.c.request<{ id: number }[]>('GET', `${this.project(project)}/pipelines?sha=${sha}&per_page=1`)
    if (!pipeline) return { summary: 'none', checks: [] }
    const jobs = await this.c.all<GlJob>(`${this.project(project)}/pipelines/${pipeline.id}/jobs?per_page=100`, 500)
    const checks = jobs.map((j): Check => ({ name: j.name, state: JOBS[j.status] ?? 'running', url: j.web_url }))
    return { summary: ciSummary(checks), checks }
  }

  async comment(project: string, number: number, body: string): Promise<void> {
    await this.c.request('POST', `${this.project(project)}/merge_requests/${number}/notes`, { body })
  }

  async merge(project: string, number: number, o: MergeOptions): Promise<void> {
    // Il metodo lo decide il progetto; il messaggio va allo squash o al merge commit (con il fast-forward a nessuno)
    const message = !o.message.trim() ? {} : o.squash ? { squash_commit_message: o.message } : o.method === 'ff' ? {} : { merge_commit_message: o.message }
    await this.c.request('PUT', `${this.project(project)}/merge_requests/${number}/merge`, {
      sha: o.sha,
      squash: o.squash,
      should_remove_source_branch: o.deleteBranch,
      ...message,
    })
  }

  async setState(project: string, number: number, state: 'open' | 'closed'): Promise<void> {
    await this.c.request('PUT', `${this.project(project)}/merge_requests/${number}`, { state_event: state === 'closed' ? 'close' : 'reopen' })
  }

  async create(project: string, headProject: string, input: NewPullRequest): Promise<number> {
    // Da un fork la merge request si crea sul fork, indicando il progetto di destinazione
    const target = headProject === project ? {} : { target_project_id: (await this.c.request<GlProject>('GET', this.project(project))).id }
    const m = await this.c.request<GlMergeRequest>('POST', `${this.project(headProject)}/merge_requests`, {
      source_branch: input.head,
      target_branch: input.base,
      title: input.draft ? `Draft: ${input.title}` : input.title,
      description: input.body,
      ...target,
    })
    return m.iid
  }

  pullRef(number: number): string {
    return `refs/merge-requests/${number}/head`
  }
}
```

Run: `npx vitest run test/unit/gitlab.test.ts`
Expected: PASS.

- [ ] **Step 3: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: provider di GitLab (merge request, note, pipeline, merge, stato, creazione)"
```

---

### Task 5: Account e token cifrati

**Files:**
- Create: `src/main/hosting/accounts.ts`
- Modify: `src/main/settings.ts` (`saveJson`), `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/unit/accounts.test.ts`

**Interfaces:**
- Consumes: `SettingsStore`, `AppSettings`, `HostingAccount`.
- Produces:
  - `saveJson(file: string, data: unknown, mode?: number): void` in `settings.ts`;
  - `interface Crypto { isEncryptionAvailable(): boolean; encryptString(text: string): Buffer; decryptString(data: Buffer): string }`;
  - `class TokenStore { constructor(file: string, crypto: Crypto); get(id): string | null; set(id, token): void; delete(id): void }`;
  - `accountKey(root, remote): string`, `accountFor(settings, root, remote, host): HostingAccount | null`;
  - `addAccount(settings, tokens, draft: { service; host }, token, verify: () => Promise<string>): Promise<{ settings: AppSettings; account: HostingAccount }>`;
  - `removeAccount(settings, tokens, id): AppSettings`, `setRemoteAccount(settings, root, remote, id | null): AppSettings`.

- [ ] **Step 1: Test unit**

Crea `test/unit/accounts.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountFor, addAccount, type Crypto, removeAccount, setRemoteAccount, TokenStore } from '../../src/main/hosting/accounts'
import { SettingsStore } from '../../src/main/settings'

// "Cifratura" finta: il testo al contrario, così si vede che nel file non c'è in chiaro
const crypto = (available: boolean): Crypto => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...s].reverse().join('')),
  decryptString: (b) => [...b.toString()].reverse().join(''),
})

function stores(available = true) {
  const dir = mkdtempSync(join(tmpdir(), 'merlino-accounts-'))
  const file = join(dir, 'tokens.json')
  return { settings: new SettingsStore(join(dir, 'settings.json')), tokens: new TokenStore(file, crypto(available)), file }
}
const github = { service: 'github' as const, host: 'github.com' }

describe('account e token', () => {
  it('aggiunge dopo la verifica; il token è cifrato in tokens.json e non sta in settings.json', async () => {
    const { settings, tokens, file } = stores()
    const { account } = await addAccount(settings, tokens, github, 'tok-123', async () => 'ada')
    expect(settings.get().accounts).toEqual([{ id: account.id, service: 'github', host: 'github.com', username: 'ada' }])
    expect(tokens.get(account.id)).toBe('tok-123')
    expect(readFileSync(file, 'utf8')).not.toContain('tok-123')
    expect(JSON.stringify(settings.get())).not.toContain('tok-123')
  })

  it('stesso utente sullo stesso server: aggiorna il token, niente doppioni', async () => {
    const { settings, tokens } = stores()
    const first = await addAccount(settings, tokens, github, 'vecchio', async () => 'ada')
    const second = await addAccount(settings, tokens, github, 'nuovo', async () => 'ada')
    expect(second.account.id).toBe(first.account.id)
    expect(settings.get().accounts).toHaveLength(1)
    expect(tokens.get(first.account.id)).toBe('nuovo')
  })

  it('verifica fallita o portachiavi assente: non si salva niente', async () => {
    const a = stores()
    await expect(addAccount(a.settings, a.tokens, github, 't', () => Promise.reject(new Error('401')))).rejects.toThrow('401')
    const b = stores(false)
    await expect(addAccount(b.settings, b.tokens, github, 't', async () => 'ada')).rejects.toThrow(/keychain/)
    expect([...a.settings.get().accounts, ...b.settings.get().accounts]).toEqual([])
  })

  it('account di un remote: quello scelto, altrimenti il primo dello stesso server; rimuoverlo torna ad Automatico', async () => {
    const { settings, tokens } = stores()
    const ada = (await addAccount(settings, tokens, github, 'a', async () => 'ada')).account
    const grace = (await addAccount(settings, tokens, github, 'g', async () => 'grace')).account
    expect(accountFor(settings.get(), '/repo', 'origin', 'github.com')).toEqual(ada)
    expect(accountFor(settings.get(), '/repo', 'origin', 'gitlab.example.com')).toBeNull()
    setRemoteAccount(settings, '/repo', 'origin', grace.id)
    expect(accountFor(settings.get(), '/repo', 'origin', 'github.com')).toEqual(grace)
    // La scelta vale anche per un alias ssh con un altro nome di server
    expect(accountFor(settings.get(), '/repo', 'origin', 'github-lavoro')).toEqual(grace)
    expect(() => setRemoteAccount(settings, '/repo', 'origin', 'manca')).toThrow()
    removeAccount(settings, tokens, grace.id)
    expect(settings.get().remoteAccounts).toEqual({})
    expect(tokens.get(grace.id)).toBeNull()
    expect(accountFor(settings.get(), '/repo', 'origin', 'github.com')).toEqual(ada)
  })
})
```

Run: `npx vitest run test/unit/accounts.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `saveJson` in `settings.ts`**

In `src/main/settings.ts` la scrittura atomica diventa una funzione esportata, usata anche per i token:

```ts
/** Scrittura atomica: un crash non lascia il file a metà. mode vale per i file nuovi (0o600 per i token). */
export function saveJson(file: string, data: unknown, mode = 0o644): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode })
  renameSync(tmp, file)
}
```

e `update` diventa:

```ts
  update(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch }
    saveJson(this.file, this.data)
    return this.get()
  }
```

- [ ] **Step 3: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `hosting.noKeychain` | The system keychain is not available: the token cannot be saved securely | Il portachiavi del sistema non è disponibile: il token non si può salvare in modo sicuro |
| `hosting.accountNotFound` | Account not found | Account non trovato |

- [ ] **Step 4: `src/main/hosting/accounts.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AppSettings, HostingAccount, HostingService } from '../../shared/types'
import { t } from '../i18n'
import { saveJson, type SettingsStore } from '../settings'

/** La parte di safeStorage di Electron che serve (nei test una finta). */
export interface Crypto {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(data: Buffer): string
}

/** Token degli account in tokens.json, cifrati con il portachiavi del sistema: { id: base64 }. */
export class TokenStore {
  constructor(
    private readonly file: string,
    private readonly crypto: Crypto,
  ) {}

  private read(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  get(id: string): string | null {
    const saved = this.read()[id]
    return saved ? this.crypto.decryptString(Buffer.from(saved, 'base64')) : null
  }

  set(id: string, token: string): void {
    if (!this.crypto.isEncryptionAvailable()) throw new Error(t('hosting.noKeychain'))
    saveJson(this.file, { ...this.read(), [id]: this.crypto.encryptString(token).toString('base64') }, 0o600)
  }

  delete(id: string): void {
    const data = this.read()
    delete data[id]
    saveJson(this.file, data, 0o600)
  }
}

/** Chiave di remoteAccounts: la stessa usata dal renderer per mostrare la scelta. */
export const accountKey = (root: string, remote: string): string => `${root}\n${remote}`

/** L'account di un remote: quello scelto dal menu del remote, altrimenti il primo con lo stesso server. */
export function accountFor(
  s: Pick<AppSettings, 'accounts' | 'remoteAccounts'>,
  root: string,
  remote: string,
  host: string | null,
): HostingAccount | null {
  const chosen = s.remoteAccounts[accountKey(root, remote)]
  return s.accounts.find((a) => a.id === chosen) ?? s.accounts.find((a) => a.host === host) ?? null
}

/** Aggiunge un account dopo aver verificato il token (verify dà il nome utente). Lo stesso utente sullo stesso server aggiorna il token. */
export async function addAccount(
  settings: SettingsStore,
  tokens: TokenStore,
  draft: { service: HostingService; host: string },
  token: string,
  verify: () => Promise<string>,
): Promise<{ settings: AppSettings; account: HostingAccount }> {
  const username = await verify()
  const { accounts } = settings.get()
  const existing = accounts.find((a) => a.service === draft.service && a.host === draft.host && a.username === username)
  const account = existing ?? { id: randomUUID(), ...draft, username }
  tokens.set(account.id, token)
  return { settings: existing ? settings.get() : settings.update({ accounts: [...accounts, account] }), account }
}

export function removeAccount(settings: SettingsStore, tokens: TokenStore, id: string): AppSettings {
  const { accounts, remoteAccounts } = settings.get()
  tokens.delete(id)
  return settings.update({
    accounts: accounts.filter((a) => a.id !== id),
    // I remote che usavano questo account tornano su "Automatico"
    remoteAccounts: Object.fromEntries(Object.entries(remoteAccounts).filter(([, v]) => v !== id)),
  })
}

/** id null: "Automatico", cioè il primo account dello stesso server. */
export function setRemoteAccount(settings: SettingsStore, root: string, remote: string, id: string | null): AppSettings {
  const { accounts, remoteAccounts } = settings.get()
  if (id !== null && !accounts.some((a) => a.id === id)) throw new Error(t('hosting.accountNotFound'))
  const key = accountKey(root, remote)
  if (id === null) delete remoteAccounts[key]
  else remoteAccounts[key] = id
  return settings.update({ remoteAccounts })
}
```

Run: `npx vitest run test/unit/accounts.test.ts test/unit/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: account di GitHub e GitLab con i token cifrati nel portachiavi"
```

---

### Task 6: Git di una pull request

**Files:**
- Create: `src/main/git/pull-request.ts`
- Modify: `src/main/git/commit.ts` (`fileChanges`), `src/main/git/refs.ts` (`readRemotes`), `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/integration/pull-request.test.ts`

**Interfaces:**
- Consumes: `checkoutRemote` (`branches.ts`), `parseLog`/`LOG_FORMAT`, `diffFlags`/`limitedDiff`, `parseNameStatus`/`parseNumstat`.
- Produces:
  - `fileChanges(nameStatus: string, numstat: string): FileChange[]` in `commit.ts`;
  - `readRemotes(runner): Promise<{ name: string; url: string }[]>` in `refs.ts`;
  - `fetchPullRequest(r, remote, pullRef, base, baseSha, headSha): Promise<void>`;
  - `readPullRequestChanges(r, baseSha, headSha): Promise<PullRequestChanges>`;
  - `readPullRequestFileDiff(r, baseSha, headSha, file: DiffRequest, options: DiffOptions): Promise<FileDiff>`;
  - `checkoutPullRequest(r, remote, pullRef, number, branch: string | null): Promise<void>`;
  - `branchSummary(r, base, head): Promise<{ count: number; message: string }>`.

- [ ] **Step 1: Test di integrazione**

Crea `test/integration/pull-request.test.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { branchSummary, checkoutPullRequest, fetchPullRequest, readPullRequestChanges, readPullRequestFileDiff } from '../../src/main/git/pull-request'
import { readRemotes } from '../../src/main/git/refs'
import { GitRunner } from '../../src/main/git/runner'
import { cloneOf, git, makeRemotePair } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})
const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const rev = (repo: string, ref = 'HEAD') => git(repo, 'rev-parse', ref).trim()
const options = { ignoreWhitespace: false, force: false }

/**
 * Un "server" (repo bare) e il clone dell'utente, fatto prima delle PR (non ne ha gli oggetti).
 * PR #1 dello stesso repo: refs/pull/1/head = feature/login. PR #2 da fork: refs/merge-requests/2/head, su nessun branch.
 * Dopo l'apertura delle PR main va avanti di un commit.
 */
function server() {
  const { bare, clone: user } = makeRemotePair()
  const author = cloneOf(bare)
  const base = rev(author)
  git(author, 'switch', '-q', '-c', 'feature/login')
  commitFile(author, 'login.txt', 'login\n', 'Aggiunge il login')
  commitFile(author, 'file1.txt', '1\nmodificato\n', 'Cambia file1')
  git(author, 'push', '-q', 'origin', 'feature/login', 'HEAD:refs/pull/1/head')
  git(author, 'switch', '-q', '--detach', base)
  commitFile(author, 'fork.txt', 'fork\n', 'Dal fork')
  git(author, 'push', '-q', 'origin', 'HEAD:refs/merge-requests/2/head')
  git(author, 'switch', '-q', 'main')
  commitFile(author, 'altro.txt', 'altro\n', 'Su main')
  git(author, 'push', '-q', 'origin', 'main')
  return { bare, user, author, base, login: rev(bare, 'refs/pull/1/head'), fork: rev(bare, 'refs/merge-requests/2/head'), main: rev(bare, 'main') }
}

describe('pull request con git', () => {
  it('scarica gli oggetti senza creare ref; commit e file dal punto di partenza alla testa', async () => {
    const s = server()
    const r = runnerFor(s.user)
    const refs = git(s.user, 'for-each-ref')
    // baseSha è la punta attuale di main: i file restano quelli della PR (diff dal merge-base)
    await fetchPullRequest(r, 'origin', 'refs/pull/1/head', 'main', s.main, s.login)
    expect(git(s.user, 'for-each-ref')).toBe(refs)
    const changes = await readPullRequestChanges(r, s.main, s.login)
    expect(changes.commits.map((c) => c.subject)).toEqual(['Cambia file1', 'Aggiunge il login'])
    expect(changes.files.map((f) => [f.status, f.path, f.added])).toEqual([
      ['M', 'file1.txt', 1],
      ['A', 'login.txt', 1],
    ])
    const diff = await readPullRequestFileDiff(r, s.main, s.login, { path: 'file1.txt' }, options)
    expect(diff.hunks[0]?.lines.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(['modificato'])

    // Con gli oggetti già presenti non serve la rete, anche col server irraggiungibile
    git(s.user, 'remote', 'set-url', 'origin', join(s.bare, 'manca'))
    await expect(fetchPullRequest(r, 'origin', 'refs/pull/1/head', 'main', s.main, s.login)).resolves.toBeUndefined()
  })

  it('checkout: stesso repo con un branch che segue il remote; da fork pr/<n>, aggiornato solo in fast-forward', async () => {
    const s = server()
    const r = runnerFor(s.user)
    await checkoutPullRequest(r, 'origin', 'refs/pull/1/head', 1, 'feature/login')
    expect(git(s.user, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('feature/login')
    expect(git(s.user, 'rev-parse', '--abbrev-ref', 'feature/login@{u}').trim()).toBe('origin/feature/login')

    await checkoutPullRequest(r, 'origin', 'refs/merge-requests/2/head', 2, null)
    expect(git(s.user, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('pr/2')
    expect(rev(s.user)).toBe(s.fork)
    expect(git(s.user, 'for-each-ref', '--format=%(upstream)', 'refs/heads/pr/2').trim()).toBe('')

    // L'autore aggiunge un commit: un nuovo checkout aggiorna pr/2 anche se è il branch corrente
    git(s.author, 'switch', '-q', '--detach', s.fork)
    commitFile(s.author, 'fork2.txt', 'f\n', 'Ancora dal fork')
    git(s.author, 'push', '-q', 'origin', 'HEAD:refs/merge-requests/2/head')
    await checkoutPullRequest(r, 'origin', 'refs/merge-requests/2/head', 2, null)
    expect(rev(s.user)).toBe(rev(s.author))

    // Con commit locali su pr/2 l'aggiornamento non è un fast-forward: messaggio dedicato
    commitFile(s.user, 'locale.txt', 'l\n', 'Locale')
    git(s.user, 'switch', '-q', 'main')
    commitFile(s.author, 'fork3.txt', 'f\n', 'Terzo dal fork')
    git(s.author, 'push', '-q', 'origin', 'HEAD:refs/merge-requests/2/head')
    await expect(checkoutPullRequest(r, 'origin', 'refs/merge-requests/2/head', 2, null)).rejects.toThrow(/pr\/2 cannot be fast-forwarded/)
  })

  it('riepilogo del branch per titolo e descrizione proposti', async () => {
    const { clone } = makeRemotePair()
    git(clone, 'switch', '-q', '-c', 'feature/uno')
    commitFile(clone, 'a.txt', 'a\n', 'Titolo\n\nCorpo del commit')
    expect(await branchSummary(runnerFor(clone), 'origin/main', 'feature/uno')).toEqual({ count: 1, message: 'Titolo\n\nCorpo del commit' })
    commitFile(clone, 'b.txt', 'b\n', 'Secondo')
    expect(await branchSummary(runnerFor(clone), 'origin/main', 'feature/uno')).toEqual({ count: 2, message: '' })
  })

  it('remote con il loro URL configurato', async () => {
    const { bare, clone } = makeRemotePair()
    git(clone, 'remote', 'add', 'upstream', 'git@gitlab.example.com:acme/demo-app.git')
    expect(await readRemotes(runnerFor(clone))).toEqual([
      { name: 'origin', url: bare },
      { name: 'upstream', url: 'git@gitlab.example.com:acme/demo-app.git' },
    ])
  })
})
```

Run: `npx vitest run test/integration/pull-request.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `fileChanges` e `readRemotes`**

In `src/main/git/commit.ts`, dopo `parseNumstat`:

```ts
/** File cambiati, dall'output di --name-status -z e --numstat -z dello stesso diff. */
export function fileChanges(nameStatus: string, numstat: string): FileChange[] {
  const counts = parseNumstat(numstat)
  return parseNameStatus(nameStatus).map((f) => ({ ...f, ...(counts.get(f.path) ?? { added: null, deleted: null }) }))
}
```

e in `readCommitDetail` togli `const counts = …` e usa `files: fileChanges(nameStatus.stdout, numstat.stdout),`.

In `src/main/git/refs.ts`:

```ts
// exit 1: nessun remote configurato
const readRemoteConfig = async (runner: GitRunner): Promise<string> =>
  (await runner.run(['config', '--get-regexp', '^remote\\..*\\.url$'], { okCodes: [0, 1] })).stdout

export async function readRefs(runner: GitRunner): Promise<RefsSnapshot> {
  const [refs, config] = await Promise.all([
    runner.run(['for-each-ref', `--format=${REFS_FORMAT}`, 'refs/heads', 'refs/remotes', 'refs/tags']),
    readRemoteConfig(runner),
  ])
  return parseRefs(refs.stdout, config)
}

/** I remote con l'URL configurato, senza le riscritture insteadOf. */
export async function readRemotes(runner: GitRunner): Promise<{ name: string; url: string }[]> {
  return parseRefs('', await readRemoteConfig(runner)).remotes.map(({ name, url }) => ({ name, url }))
}
```

- [ ] **Step 3: Testo**

| Chiave | Inglese | Italiano |
|---|---|---|
| `error.prNotFastForward` | {branch} cannot be fast-forwarded to the pull request: it has commits the pull request does not have | {branch} non si può aggiornare in fast-forward alla pull request: ha commit che la pull request non ha |

- [ ] **Step 4: `src/main/git/pull-request.ts`**

```ts
import type { DiffOptions, FileDiff, PullRequestChanges } from '../../shared/types'
import { t } from '../i18n'
import { checkoutRemote } from './branches'
import { fileChanges } from './commit'
import { type DiffRequest, diffFlags, limitedDiff } from './diff'
import { LOG_FORMAT, parseLog } from './log'
import { GitError, type GitRunner } from './runner'

const write = { write: true }

const hasCommit = async (r: GitRunner, sha: string): Promise<boolean> =>
  (await r.run(['cat-file', '-e', `${sha}^{commit}`], { okCodes: [0, 1, 128] })).exitCode === 0

/**
 * Scarica gli oggetti della PR (la testa e il branch di destinazione) senza creare né aggiornare ref,
 * così la storia non cambia. Se gli oggetti ci sono già, niente rete.
 */
export async function fetchPullRequest(r: GitRunner, remote: string, pullRef: string, base: string, baseSha: string, headSha: string): Promise<void> {
  if ((await hasCommit(r, baseSha)) && (await hasCommit(r, headSha))) return
  // --refmap= vuoto: niente aggiornamento "opportunistico" di <remote>/<base>
  await r.run(['fetch', '--no-write-fetch-head', '--no-tags', '--refmap=', remote, pullRef, `refs/heads/${base}`], write)
}

/** Commit da base a testa; file dal punto in cui la PR si è staccata (base...testa), come li mostra il servizio. */
export async function readPullRequestChanges(r: GitRunner, baseSha: string, headSha: string): Promise<PullRequestChanges> {
  const range = `${baseSha}...${headSha}`
  const [log, nameStatus, numstat] = await Promise.all([
    r.run(['log', '-z', '--decorate=full', `--format=${LOG_FORMAT}`, `${baseSha}..${headSha}`]),
    r.run(['diff', '-z', '-M', '--name-status', range]),
    r.run(['diff', '-z', '-M', '--numstat', range]),
  ])
  return { commits: parseLog(log.stdout), files: fileChanges(nameStatus.stdout, numstat.stdout) }
}

export async function readPullRequestFileDiff(r: GitRunner, baseSha: string, headSha: string, file: DiffRequest, options: DiffOptions): Promise<FileDiff> {
  const args = ['diff', '--no-color', '--no-ext-diff', '-M', ...diffFlags(options), `${baseSha}...${headSha}`]
  // Con la rinomina servono entrambi i percorsi
  args.push('--', ...(file.oldPath ? [file.oldPath, file.path] : [file.path]))
  return limitedDiff((await r.run(args)).stdout, file, options.force)
}

/**
 * Checkout di una PR. Stesso repository (branch): il branch locale che segue <remote>/<branch>, o uno nuovo, con un
 * fetch se il branch remoto non c'è ancora. Da un fork (branch null): pr/<n>, senza upstream, aggiornato solo in fast-forward.
 */
export async function checkoutPullRequest(r: GitRunner, remote: string, pullRef: string, number: number, branch: string | null): Promise<void> {
  if (branch) {
    const tracking = `refs/remotes/${remote}/${branch}`
    const known = await r.run(['rev-parse', '--verify', '--quiet', tracking], { okCodes: [0, 1] })
    if (known.exitCode !== 0) await r.run(['fetch', remote, `+refs/heads/${branch}:${tracking}`], write)
    return checkoutRemote(r, `${remote}/${branch}`)
  }
  const local = `pr/${number}`
  const current = (await r.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], { okCodes: [0, 1] })).stdout.trim()
  try {
    if (current === local) {
      // fetch non aggiorna il branch su cui si è: si scarica e poi fast-forward
      await r.run(['fetch', remote, pullRef], write)
      await r.run(['merge', '--ff-only', 'FETCH_HEAD'], write)
    } else {
      await r.run(['fetch', remote, `${pullRef}:refs/heads/${local}`], write)
      await r.run(['switch', local], write)
    }
  } catch (e) {
    // git lo segnala come "[rejected]", che explain() tradurrebbe in un push rifiutato
    if (e instanceof GitError && /rejected|non-fast-forward|Not possible to fast-forward/i.test(e.info.stderr)) {
      throw new GitError({ ...e.info, message: t('error.prNotFastForward', { branch: local }) })
    }
    throw e
  }
}

/** Commit di head che base non ha: quanti, e il messaggio se è uno solo (titolo e descrizione proposti per la PR). */
export async function branchSummary(r: GitRunner, base: string, head: string): Promise<{ count: number; message: string }> {
  const count = Number((await r.run(['rev-list', '--count', `${base}..${head}`])).stdout.trim())
  const message = count === 1 ? (await r.run(['log', '-1', '--format=%B', head])).stdout.trim() : ''
  return { count, message }
}
```

Run: `npx vitest run test/integration/pull-request.test.ts`
Expected: PASS.

- [ ] **Step 5: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: oggetti, commit, diff e checkout di una pull request con git"
```

---

### Task 7: Collegamento nel main (IPC, validazione, token) e prova con un server finto

**Files:**
- Create: `src/main/hosting/pull-requests.ts`, `test/e2e/fake-hosting.ts`, `test/e2e/pull-requests-api.spec.ts`
- Modify: `src/main/validate.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts`, `src/main/index.ts`, `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/unit/validate.test.ts`, `test/e2e/pull-requests-api.spec.ts`

**Interfaces:**
- Consumes: tutto quello dei Task 1–6.
- Produces:
  - `HostingDeps`, `Connection`, `createProvider`, `projectOf`, `pullRequestRemotes`, `connect` in `pull-requests.ts`;
  - validatori `server`, `token`, `accountId`, `prNumber`, `limitedText`, `mergeOptions`, `newPullRequest`, `pullRequestRefs`, `HOSTING_SERVICES`, `PR_FILTERS`;
  - canali e metodi dell'`Api`:

```ts
  addAccount(service: HostingService, host: string, token: string): Promise<Result<{ settings: AppSettings; account: HostingAccount }>>
  removeAccount(id: string): Promise<Result<AppSettings>>
  /** id null: "Automatico". */
  setRemoteAccount(root: string, remote: string, id: string | null): Promise<Result<AppSettings>>
  prRemotes(root: string): Promise<Result<PullRequestRemote[]>>
  prRepo(root: string, remote: string): Promise<Result<HostingRepo>>
  prList(root: string, remote: string, filter: PullRequestFilter): Promise<Result<PullRequest[]>>
  prDetail(root: string, remote: string, number: number): Promise<Result<PullRequestDetail>>
  prChecks(root: string, remote: string, sha: string): Promise<Result<CiStatus>>
  /** Scarica gli oggetti della PR se mancano, poi commit e file. */
  prChanges(root: string, remote: string, number: number, refs: { base: string; baseSha: string; headSha: string }): Promise<Result<PullRequestChanges>>
  prFileDiff(root: string, baseSha: string, headSha: string, file: { path: string; oldPath?: string }, options: DiffOptions): Promise<Result<FileDiff>>
  prComment(root: string, remote: string, number: number, body: string): Promise<Result<void>>
  prMerge(root: string, remote: string, number: number, options: MergeOptions): Promise<Result<void>>
  prSetState(root: string, remote: string, number: number, state: 'open' | 'closed'): Promise<Result<void>>
  /** Restituisce il numero della nuova PR. */
  prCreate(root: string, input: NewPullRequest): Promise<Result<number>>
  /** branch null: PR da fork (pr/<n>). */
  prCheckout(root: string, remote: string, number: number, branch: string | null): Promise<Result<void>>
  prBranchSummary(root: string, base: string, head: string): Promise<Result<{ count: number; message: string }>>
  /** Dopo ogni fetch (manuale, pull o automatico) di un repo. */
  onFetched(cb: (root: string) => void): () => void
```

- [ ] **Step 1: Test unit della validazione**

In `test/unit/validate.test.ts` aggiungi agli import `limitedText, mergeOptions, newPullRequest, prNumber, server, token` e, dentro il `describe`:

```ts
  it('account e pull request', () => {
    expect(server(' GitLab.Example.com:8443 ')).toBe('gitlab.example.com:8443')
    for (const bad of ['https://github.com', 'github.com/acme', '-x', 'a b', '']) expect(() => server(bad)).toThrow()
    expect(token(' ghp_abc ')).toBe('ghp_abc')
    expect(() => token('ab cd')).toThrow()
    expect(prNumber(42)).toBe(42)
    for (const bad of [0, -1, 1.5, '3']) expect(() => prNumber(bad)).toThrow()
    expect(() => limitedText('x'.repeat(11), 'testo', 10)).toThrow()
    expect(() => limitedText('  ', 'testo', 10, true)).toThrow()
    expect(mergeOptions({ method: 'squash', sha: 'abc1234', message: 'x', deleteBranch: 1 })).toEqual({ method: 'squash', sha: 'abc1234', message: 'x', squash: false, deleteBranch: false })
    expect(() => mergeOptions({ method: 'octopus', sha: 'abc1234' })).toThrow()
    expect(() => mergeOptions({ method: 'merge', sha: 'HEAD' })).toThrow()
    const pr = { remote: 'origin', base: 'main', headRemote: 'origin', head: 'feature/a', title: ' Login ', draft: 'yes' }
    expect(newPullRequest(pr)).toEqual({ remote: 'origin', base: 'main', headRemote: 'origin', head: 'feature/a', title: 'Login', body: '', draft: false })
    for (const bad of [{ title: '   ' }, { title: 'x'.repeat(257) }, { head: '--force' }, { remote: 'a b' }]) expect(() => newPullRequest({ ...pr, ...bad })).toThrow()
  })
```

Run: `npx vitest run test/unit/validate.test.ts`
Expected: FAIL, i validatori non esistono.

- [ ] **Step 2: Validatori e testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `field.server` | server | server |
| `field.title` | title | titolo |
| `field.message` | message | messaggio |
| `field.comment` | comment | commento |
| `validation.invalidServer` | Invalid server: {value} (write only the name, e.g. github.com) | Server non valido: {value} (scrivi solo il nome, es. github.com) |
| `validation.tooLong` | {name}: at most {max} characters | {name}: al massimo {max} caratteri |
| `hosting.noAccount` | No account for {host} | Nessun account per {host} |
| `hosting.unknownRemote` | The remote {remote} is not on a GitHub or GitLab server | Il remote {remote} non è su un server GitHub o GitLab |
| `hosting.differentServer` | The branch and the target are on different servers | Il branch e la destinazione sono su server diversi |

In `src/main/validate.ts`, con gli import dei nuovi tipi (`HostingService`, `MergeMethod`, `MergeOptions`, `NewPullRequest`, `PullRequestFilter`):

```ts
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
```

Run: `npx vitest run test/unit/validate.test.ts`
Expected: PASS.

- [ ] **Step 3: `src/main/hosting/pull-requests.ts`**

```ts
import type { CommandLogEntry, HostingAccount, PullRequestRemote } from '../../shared/types'
import { readRemotes } from '../git/refs'
import type { GitRunner } from '../git/runner'
import { t } from '../i18n'
import type { SettingsStore } from '../settings'
import { accountFor, type TokenStore } from './accounts'
import { GitHub } from './github'
import { GitLab } from './gitlab'
import { type Fetch, HostingClient } from './http'
import type { HostingProvider } from './provider'
import { parseRemoteUrl } from './remote-url'

export interface HostingDeps {
  settings: SettingsStore
  tokens: TokenStore
  fetch: Fetch
  log: (entry: CommandLogEntry) => void
}

/** Un remote collegato al suo servizio: il provider con il token dell'account e il percorso del progetto. */
export interface Connection {
  remote: string
  host: string
  project: string
  account: HostingAccount
  provider: HostingProvider
}

export function createProvider(
  deps: Pick<HostingDeps, 'fetch' | 'log'>,
  account: Pick<HostingAccount, 'service' | 'host' | 'username'>,
  token: string,
  repo: string | null,
): HostingProvider {
  const client = new HostingClient({ account, token, fetch: deps.fetch, log: deps.log, repo })
  return account.service === 'github' ? new GitHub(client) : new GitLab(client)
}

/** Server e progetto di un remote dall'URL configurato; errore se il remote non c'è o non è su un server. */
export async function projectOf(runner: GitRunner, remote: string): Promise<{ host: string; path: string }> {
  const url = (await readRemotes(runner)).find((r) => r.name === remote)?.url
  const parsed = url ? parseRemoteUrl(url) : null
  if (!parsed) throw new Error(t('hosting.unknownRemote', { remote }))
  return parsed
}

/** I remote del repo con il loro server e l'account che li serve (runner.cwd è la radice del repo). */
export async function pullRequestRemotes(deps: HostingDeps, runner: GitRunner): Promise<PullRequestRemote[]> {
  const settings = deps.settings.get()
  return (await readRemotes(runner)).map(({ name, url }) => {
    const host = parseRemoteUrl(url)?.host ?? null
    return { name, host, account: host ? accountFor(settings, runner.cwd, name, host) : null }
  })
}

export async function connect(deps: HostingDeps, runner: GitRunner, remote: string): Promise<Connection> {
  const { host, path } = await projectOf(runner, remote)
  const account = accountFor(deps.settings.get(), runner.cwd, remote, host)
  const token = account && deps.tokens.get(account.id)
  if (!account || !token) throw new Error(t('hosting.noAccount', { host }))
  return { remote, host, project: path, account, provider: createProvider(deps, account, token, runner.cwd) }
}
```

- [ ] **Step 4: Canali, `Api` e preload**

In `src/shared/ipc.ts`:
- importa i nuovi tipi (`CiStatus`, `HostingAccount`, `HostingRepo`, `HostingService`, `MergeOptions`, `NewPullRequest`, `PullRequest`, `PullRequestChanges`, `PullRequestDetail`, `PullRequestFilter`, `PullRequestRemote`);
- in `Channels`, prima di `// eventi dal main al renderer`:

```ts
  addAccount: 'accounts:add',
  removeAccount: 'accounts:remove',
  setRemoteAccount: 'accounts:set-remote',
  prRemotes: 'pr:remotes',
  prRepo: 'pr:repo',
  prList: 'pr:list',
  prDetail: 'pr:detail',
  prChecks: 'pr:checks',
  prChanges: 'pr:changes',
  prFileDiff: 'pr:file-diff',
  prComment: 'pr:comment',
  prMerge: 'pr:merge',
  prSetState: 'pr:set-state',
  prCreate: 'pr:create',
  prCheckout: 'pr:checkout',
  prBranchSummary: 'pr:branch-summary',
```

e dopo `repoChanged: 'repo:changed',`:

```ts
  fetched: 'repo:fetched',
```

- nell'interfaccia `Api`, prima di `onProgress`, i metodi elencati in **Interfaces** (con `onFetched` vicino a `onRepoChanged`).

In `src/preload/index.ts`:

```ts
  addAccount: (service, host, token) => ipcRenderer.invoke(Channels.addAccount, service, host, token),
  removeAccount: (id) => ipcRenderer.invoke(Channels.removeAccount, id),
  setRemoteAccount: (root, remote, id) => ipcRenderer.invoke(Channels.setRemoteAccount, root, remote, id),
  prRemotes: (root) => ipcRenderer.invoke(Channels.prRemotes, root),
  prRepo: (root, remote) => ipcRenderer.invoke(Channels.prRepo, root, remote),
  prList: (root, remote, filter) => ipcRenderer.invoke(Channels.prList, root, remote, filter),
  prDetail: (root, remote, number) => ipcRenderer.invoke(Channels.prDetail, root, remote, number),
  prChecks: (root, remote, sha) => ipcRenderer.invoke(Channels.prChecks, root, remote, sha),
  prChanges: (root, remote, number, refs) => ipcRenderer.invoke(Channels.prChanges, root, remote, number, refs),
  prFileDiff: (root, baseSha, headSha, file, options) => ipcRenderer.invoke(Channels.prFileDiff, root, baseSha, headSha, file, options),
  prComment: (root, remote, number, body) => ipcRenderer.invoke(Channels.prComment, root, remote, number, body),
  prMerge: (root, remote, number, options) => ipcRenderer.invoke(Channels.prMerge, root, remote, number, options),
  prSetState: (root, remote, number, state) => ipcRenderer.invoke(Channels.prSetState, root, remote, number, state),
  prCreate: (root, input) => ipcRenderer.invoke(Channels.prCreate, root, input),
  prCheckout: (root, remote, number, branch) => ipcRenderer.invoke(Channels.prCheckout, root, remote, number, branch),
  prBranchSummary: (root, base, head) => ipcRenderer.invoke(Channels.prBranchSummary, root, base, head),
  onFetched: (cb) => on(Channels.fetched, cb),
```

- [ ] **Step 5: Handler nel main**

In `src/main/ipc-handlers.ts`:

- import: `addAccount`, `removeAccount`, `setRemoteAccount`, `type TokenStore` da `./hosting/accounts`; `type Fetch`, `HostingError` da `./hosting/http`; `connect`, `type Connection`, `createProvider`, `type HostingDeps`, `projectOf`, `pullRequestRemotes` da `./hosting/pull-requests`; `branchSummary`, `checkoutPullRequest`, `fetchPullRequest`, `readPullRequestChanges`, `readPullRequestFileDiff` da `./git/pull-request`; dai validatori `accountId`, `HOSTING_SERVICES`, `limitedText`, `MAX_BODY`, `mergeOptions`, `newPullRequest`, `PR_FILTERS`, `prNumber`, `pullRequestRefs`, `refName`, `revision`, `server`, `token`.

- `fail` passa al renderer il codice degli errori di autenticazione:

```ts
function fail(e: unknown): { ok: false; error: GitErrorInfo } {
  if (e instanceof GitError) return { ok: false, error: e.info }
  const message = e instanceof Error ? e.message : String(e)
  // Il renderer propone "Aggiorna token…"
  const code = e instanceof HostingError && e.kind === 'auth' ? { code: 'auth' as const } : {}
  return { ok: false, error: { args: [], exitCode: null, stderr: message, message, ...code } }
}
```

- la firma diventa `registerIpc(win, settings, initialPath, hosting: { tokens: TokenStore; fetch: Fetch })`;

- dopo un fetch le pull request vanno ricaricate: nell'`AutoFetch`

```ts
    for (const s of sessions.values()) gitFetch(s.runner, () => {}, prune).then(() => send(Channels.fetched, s.root), () => {})
```

e l'handler di `Channels.command` diventa:

```ts
  ipcMain.handle(Channels.command, (_e, root: unknown, command: unknown) =>
    withSession(root, async (s) => {
      const c = repoCommand(command)
      await runCommand(s.runner, c, progress(s.root), settings.get().preferences.fetchPrune)
      if (c.kind === 'fetch' || c.kind === 'pull') send(Channels.fetched, s.root)
    }),
  )
```

- in fondo, prima del `return`:

```ts
  // --- Account e pull request: il token resta qui, il renderer passa solo root, remote, numeri, SHA e testi ---
  const deps: HostingDeps = { settings, tokens: hosting.tokens, fetch: hosting.fetch, log: onLog }
  /** Un'operazione sul servizio del remote, con il repo aperto. */
  const onRemote = <T>(root: unknown, remote: unknown, fn: (c: Connection, s: RepoSession) => Promise<T>) =>
    withSession(root, async (s) => fn(await connect(deps, s.runner, refName(remote)), s))

  ipcMain.handle(Channels.addAccount, (_e, service: unknown, host: unknown, secret: unknown) =>
    attempt(() => {
      const draft = { service: oneOf(service, HOSTING_SERVICES, 'service'), host: server(host) }
      const value = token(secret)
      return addAccount(settings, hosting.tokens, draft, value, () => createProvider(deps, { ...draft, username: '' }, value, null).verify())
    }),
  )
  ipcMain.handle(Channels.removeAccount, (_e, id: unknown) => attempt(() => removeAccount(settings, hosting.tokens, accountId(id))))
  ipcMain.handle(Channels.setRemoteAccount, (_e, root: unknown, remote: unknown, id: unknown) =>
    attempt(() => setRemoteAccount(settings, str(root, 'root'), refName(remote), id === null ? null : accountId(id))),
  )
  ipcMain.handle(Channels.prRemotes, (_e, root: unknown) => withSession(root, (s) => pullRequestRemotes(deps, s.runner)))
  ipcMain.handle(Channels.prRepo, (_e, root: unknown, remote: unknown) => onRemote(root, remote, (c) => c.provider.repo(c.project)))
  ipcMain.handle(Channels.prList, (_e, root: unknown, remote: unknown, filter: unknown) =>
    onRemote(root, remote, (c) => c.provider.list(c.project, oneOf(filter, PR_FILTERS, 'filter'))),
  )
  ipcMain.handle(Channels.prDetail, (_e, root: unknown, remote: unknown, n: unknown) => onRemote(root, remote, (c) => c.provider.detail(c.project, prNumber(n))))
  ipcMain.handle(Channels.prChecks, (_e, root: unknown, remote: unknown, commit: unknown) =>
    onRemote(root, remote, (c) => c.provider.checks(c.project, sha(commit))),
  )
  ipcMain.handle(Channels.prChanges, (_e, root: unknown, remote: unknown, n: unknown, refs: unknown) =>
    onRemote(root, remote, async (c, s) => {
      const { base, baseSha, headSha } = pullRequestRefs(refs)
      await fetchPullRequest(s.runner, c.remote, c.provider.pullRef(prNumber(n)), base, baseSha, headSha)
      return readPullRequestChanges(s.runner, baseSha, headSha)
    }),
  )
  ipcMain.handle(Channels.prFileDiff, (_e, root: unknown, base: unknown, head: unknown, file: unknown, options: unknown) =>
    withSession(root, (s) => readPullRequestFileDiff(s.runner, sha(base), sha(head), fileRequest(file), diffOptions(options))),
  )
  ipcMain.handle(Channels.prComment, (_e, root: unknown, remote: unknown, n: unknown, body: unknown) =>
    onRemote(root, remote, (c) => c.provider.comment(c.project, prNumber(n), limitedText(body, t('field.comment'), MAX_BODY, true))),
  )
  ipcMain.handle(Channels.prMerge, (_e, root: unknown, remote: unknown, n: unknown, options: unknown) =>
    onRemote(root, remote, (c) => c.provider.merge(c.project, prNumber(n), mergeOptions(options))),
  )
  ipcMain.handle(Channels.prSetState, (_e, root: unknown, remote: unknown, n: unknown, state: unknown) =>
    onRemote(root, remote, (c) => c.provider.setState(c.project, prNumber(n), oneOf(state, ['open', 'closed'] as const, 'state'))),
  )
  ipcMain.handle(Channels.prCreate, (_e, root: unknown, input: unknown) =>
    withSession(root, async (s) => {
      const pr = newPullRequest(input)
      const c = await connect(deps, s.runner, pr.remote)
      const head = await projectOf(s.runner, pr.headRemote)
      if (head.host !== c.host) throw new Error(t('hosting.differentServer'))
      return c.provider.create(c.project, head.path, pr)
    }),
  )
  ipcMain.handle(Channels.prCheckout, (_e, root: unknown, remote: unknown, n: unknown, branch: unknown) =>
    onRemote(root, remote, (c, s) => {
      const number = prNumber(n)
      return checkoutPullRequest(s.runner, c.remote, c.provider.pullRef(number), number, branch === null ? null : refName(branch))
    }),
  )
  ipcMain.handle(Channels.prBranchSummary, (_e, root: unknown, base: unknown, head: unknown) =>
    withSession(root, (s) => branchSummary(s.runner, revision(base), revision(head))),
  )
```

`RepoSession` va importato come tipo se non lo è già (`import { RepoSession } from './repo-session'` c'è già).

- [ ] **Step 6: Token e `fetch` in `index.ts`**

In `src/main/index.ts`:
- import: `net`, `safeStorage` da `electron`; `type Crypto`, `TokenStore` da `./hosting/accounts`;
- dopo `const hidden = …`:

```ts
// Test E2E: niente portachiavi, che su macOS chiederebbe il permesso con un dialog del sistema
const PLAIN: Crypto = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() }
```

- in `whenReady`:

```ts
    const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
    const tokens = new TokenStore(join(app.getPath('userData'), 'tokens.json'), hidden ? PLAIN : safeStorage)
    // net.fetch usa la rete di Chromium: proxy e certificati del sistema
    const ipc = registerIpc(() => win, settings, argvPath(process.argv, process.cwd()), { tokens, fetch: (url, init) => net.fetch(url, init) })
```

- [ ] **Step 7: Server finto e repo di prova per gli E2E**

Crea `test/e2e/fake-hosting.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { cloneOf, git, makeRemotePair } from '../helpers/repo'

/** Una PR del server finto, nel modello comune; il server la presenta come GitHub (/api/v3) o GitLab (/api/v4). */
export interface FakePull {
  number: number
  title: string
  body: string
  author: string
  state: 'open' | 'closed' | 'merged'
  draft?: boolean
  head: string
  headSha: string
  /** Proprietario del fork; assente se la PR è dello stesso repository. */
  fork?: string
  base: string
  baseSha: string
  comments: { author: string; body: string; at: string }[]
  commits: { sha: string; message: string; at: string }[]
  checks: { name: string; state: 'success' | 'failure' | 'pending' }[]
  updatedAt: string
}

export interface FakeHosting {
  url: string
  pulls: FakePull[]
  /** "METODO /percorso" e corpo di ogni richiesta. */
  requests: { line: string; body: Record<string, unknown> }[]
  close(): Promise<void>
}

export const TOKEN = 'good-token'
const USER = 'ada'
type Reply = [status: number, body: unknown]
type Handler = (m: RegExpExecArray, body: Record<string, unknown>, query: URLSearchParams) => Reply
const JOB = { success: 'success', failure: 'failed', pending: 'running' } as const

/** Server HTTP locale che risponde come le API di GitHub e GitLab per il progetto acme/demo-app. */
export async function fakeHosting(pulls: FakePull[]): Promise<FakeHosting> {
  const requests: FakeHosting['requests'] = []
  const now = () => new Date().toISOString()
  const find = (n: string) => pulls.find((p) => p.number === Number(n))
  const withPull = (n: string, fn: (p: FakePull) => Reply): Reply => {
    const p = find(n)
    return p ? fn(p) : [404, { message: 'Not Found' }]
  }
  const owner = (p: FakePull) => p.fork ?? 'acme'
  const gh = (p: FakePull) => ({
    number: p.number,
    title: p.title,
    body: p.body,
    user: { login: p.author },
    state: p.state === 'open' ? 'open' : 'closed',
    draft: p.draft ?? false,
    merged_at: p.state === 'merged' ? p.updatedAt : null,
    created_at: p.updatedAt,
    updated_at: p.updatedAt,
    html_url: `https://git.example.com/acme/demo-app/pull/${p.number}`,
    head: { ref: p.head, sha: p.headSha, repo: { full_name: `${owner(p)}/demo-app`, owner: { login: owner(p) } } },
    base: { ref: p.base, sha: p.baseSha, repo: { full_name: 'acme/demo-app', owner: { login: 'acme' } } },
    comments: p.comments.length,
    review_comments: 0,
    mergeable_state: 'clean',
  })
  const gl = (p: FakePull) => ({
    iid: p.number,
    title: p.title,
    description: p.body,
    author: { username: p.author },
    state: p.state === 'open' ? 'opened' : p.state,
    draft: p.draft ?? false,
    source_branch: p.head,
    target_branch: p.base,
    sha: p.headSha,
    source_project_id: p.fork ? 2 : 1,
    target_project_id: 1,
    created_at: p.updatedAt,
    updated_at: p.updatedAt,
    web_url: `https://gitlab.example.com/acme/demo-app/-/merge_requests/${p.number}`,
    user_notes_count: p.comments.length,
    detailed_merge_status: 'mergeable',
    diff_refs: { base_sha: p.baseSha },
  })
  const checksOf = (sha: string) => pulls.find((p) => p.headSha === sha)?.checks ?? []
  const GH = '^/api/v3/repos/acme/demo-app'
  const GL = '^/api/v4/projects/(?:acme%2Fdemo-app|1)'
  const routes: [string, RegExp, Handler][] = [
    // GitHub
    ['GET', /^\/api\/v3\/user$/, () => [200, { login: USER }]],
    ['GET', new RegExp(`${GH}$`), () => [200, { default_branch: 'main', allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false, delete_branch_on_merge: false }]],
    [
      'GET',
      new RegExp(`${GH}/pulls$`),
      (_m, _b, q) => {
        const state = q.get('state')
        return [200, pulls.filter((p) => state === 'all' || (state === 'open') === (p.state === 'open')).map(gh)]
      },
    ],
    [
      'POST',
      new RegExp(`${GH}/pulls$`),
      (_m, b) => {
        const [fork, head] = String(b.head).includes(':') ? String(b.head).split(':') : [undefined, String(b.head)]
        const p: FakePull = {
          number: Math.max(0, ...pulls.map((x) => x.number)) + 1,
          title: String(b.title),
          body: String(b.body ?? ''),
          author: USER,
          state: 'open',
          draft: b.draft === true,
          head: head ?? '',
          headSha: '0'.repeat(40),
          ...(fork ? { fork } : {}),
          base: String(b.base),
          baseSha: '0'.repeat(40),
          comments: [],
          commits: [],
          checks: [],
          updatedAt: now(),
        }
        pulls.unshift(p)
        return [201, gh(p)]
      },
    ],
    ['GET', new RegExp(`${GH}/pulls/(\\d+)$`), (m) => withPull(m[1] ?? '', (p) => [200, gh(p)])],
    [
      'PATCH',
      new RegExp(`${GH}/pulls/(\\d+)$`),
      (m, b) =>
        withPull(m[1] ?? '', (p) => {
          p.state = b.state === 'open' ? 'open' : 'closed'
          return [200, gh(p)]
        }),
    ],
    [
      'PUT',
      new RegExp(`${GH}/pulls/(\\d+)/merge$`),
      (m, b) =>
        withPull(m[1] ?? '', (p) => {
          if (b.sha !== p.headSha) return [409, { message: 'Head branch was modified. Review and try the merge again.' }]
          p.state = 'merged'
          return [200, { merged: true }]
        }),
    ],
    [
      'GET',
      new RegExp(`${GH}/pulls/(\\d+)/commits$`),
      (m) =>
        withPull(m[1] ?? '', (p) => [
          200,
          p.commits.map((c) => ({ sha: c.sha, author: { login: p.author }, commit: { message: c.message, author: { name: p.author, date: c.at }, committer: { date: c.at } } })),
        ]),
    ],
    [
      'GET',
      new RegExp(`${GH}/issues/(\\d+)/comments$`),
      (m) => withPull(m[1] ?? '', (p) => [200, p.comments.map((c, i) => ({ id: i + 1, user: { login: c.author }, body: c.body, created_at: c.at }))]),
    ],
    [
      'POST',
      new RegExp(`${GH}/issues/(\\d+)/comments$`),
      (m, b) =>
        withPull(m[1] ?? '', (p) => {
          p.comments.push({ author: USER, body: String(b.body), at: now() })
          return [201, {}]
        }),
    ],
    ['GET', new RegExp(`${GH}/commits/(\\w+)/status$`), (m) => [200, { statuses: checksOf(m[1] ?? '').map((c) => ({ context: c.name, state: c.state, target_url: null })) }]],
    ['GET', new RegExp(`${GH}/commits/(\\w+)/check-runs$`), () => [200, { check_runs: [] }]],
    ['DELETE', new RegExp(`${GH}/git/refs/heads/.+$`), () => [204, null]],
    // GitLab: il progetto acme/demo-app (id 1) e il fork di grace (id 2)
    ['GET', /^\/api\/v4\/user$/, () => [200, { username: USER }]],
    ['GET', new RegExp(`${GL}$`), () => [200, { id: 1, default_branch: 'main', merge_method: 'merge', squash_option: 'default_off', remove_source_branch_after_merge: true, namespace: { full_path: 'acme' } }]],
    ['GET', /^\/api\/v4\/projects\/2$/, () => [200, { id: 2, default_branch: 'main', namespace: { full_path: 'grace' } }]],
    [
      'GET',
      new RegExp(`${GL}/merge_requests$`),
      (_m, _b, q) => [200, pulls.filter((p) => q.get('state') === 'all' || gl(p).state === q.get('state')).map(gl)],
    ],
    ['GET', new RegExp(`${GL}/merge_requests/(\\d+)$`), (m) => withPull(m[1] ?? '', (p) => [200, gl(p)])],
    [
      'GET',
      new RegExp(`${GL}/merge_requests/(\\d+)/notes$`),
      (m) => withPull(m[1] ?? '', (p) => [200, p.comments.map((c, i) => ({ id: i + 1, body: c.body, author: { username: c.author }, created_at: c.at, system: false }))]),
    ],
    [
      'GET',
      new RegExp(`${GL}/merge_requests/(\\d+)/commits$`),
      (m) => withPull(m[1] ?? '', (p) => [200, p.commits.map((c) => ({ id: c.sha, title: c.message.split('\n')[0], author_name: p.author, created_at: c.at }))]),
    ],
    [
      'GET',
      new RegExp(`${GL}/pipelines$`),
      (_m, _b, q) => {
        const p = pulls.find((x) => x.headSha === q.get('sha'))
        return [200, p?.checks.length ? [{ id: p.number }] : []]
      },
    ],
    [
      'GET',
      new RegExp(`${GL}/pipelines/(\\d+)/jobs$`),
      (m) => withPull(m[1] ?? '', (p) => [200, p.checks.map((c) => ({ name: c.name, status: JOB[c.state], web_url: 'https://ci.example.com/job' }))]),
    ],
  ]

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const text = Buffer.concat(chunks).toString()
      const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>
      requests.push({ line: `${req.method} ${url.pathname}`, body })
      const authorized = req.headers.authorization === `Bearer ${TOKEN}` || req.headers['private-token'] === TOKEN
      let reply: Reply = authorized ? [404, { message: 'Not Found' }] : [401, { message: 'Bad credentials' }]
      for (const [method, path, handle] of authorized ? routes : []) {
        const m = path.exec(url.pathname)
        if (m && method === req.method) {
          reply = handle(m, body, url.searchParams)
          break
        }
      }
      res.writeHead(reply[0], { 'content-type': 'application/json' })
      res.end(reply[1] === null ? '' : JSON.stringify(reply[1]))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    pulls,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const rev = (repo: string) => git(repo, 'rev-parse', 'HEAD').trim()

/**
 * Un "server" git (repo bare) con due PR scritte da un altro clone: #1 dello stesso repo (feature/login) e #2 da un
 * fork (su nessun branch). Il clone dell'utente non ha i loro oggetti e il suo origin ha l'URL di un server finto
 * (https://<host>/acme/demo-app.git), riscritto con insteadOf sul repo bare.
 */
export function demoRepo(host: string, prRef: (n: number) => string) {
  const { bare, clone } = makeRemotePair()
  const author = cloneOf(bare)
  const baseSha = rev(author)
  git(author, 'switch', '-q', '-c', 'feature/login')
  commitFile(author, 'login.txt', 'login\n', 'Add the login page')
  git(author, 'push', '-q', 'origin', 'feature/login', `HEAD:${prRef(1)}`)
  const loginSha = rev(author)
  git(author, 'switch', '-q', '--detach', baseSha)
  commitFile(author, 'typo.txt', 'fixed\n', 'Fix a typo')
  git(author, 'push', '-q', 'origin', `HEAD:${prRef(2)}`)
  const forkSha = rev(author)
  const url = `https://${host}/acme/demo-app.git`
  git(clone, 'remote', 'set-url', 'origin', url)
  git(clone, 'config', `url.${bare}.insteadOf`, url)
  return { bare, clone, baseSha, loginSha, forkSha }
}

/** Le PR del repo di prova: #1 aperta con CI superata, #2 da fork con CI fallita, #3 unita. */
export function demoPulls(r: ReturnType<typeof demoRepo>): FakePull[] {
  const at = (hour: number) => new Date(Date.UTC(2026, 9, 20, hour)).toISOString()
  return [
    {
      number: 1,
      title: 'Add the login page',
      body: 'Adds **login** with a form.',
      author: 'ada',
      state: 'open',
      head: 'feature/login',
      headSha: r.loginSha,
      base: 'main',
      baseSha: r.baseSha,
      comments: [{ author: 'grace', body: 'Looks good', at: at(11) }],
      commits: [{ sha: r.loginSha, message: 'Add the login page', at: at(10) }],
      checks: [{ name: 'test', state: 'success' }],
      updatedAt: at(12),
    },
    {
      number: 2,
      title: 'Fix a typo',
      body: '',
      author: 'grace',
      state: 'open',
      head: 'fix-typo',
      headSha: r.forkSha,
      fork: 'grace',
      base: 'main',
      baseSha: r.baseSha,
      comments: [],
      commits: [{ sha: r.forkSha, message: 'Fix a typo', at: at(9) }],
      checks: [{ name: 'test', state: 'failure' }],
      updatedAt: at(11),
    },
    {
      number: 3,
      title: 'Old experiment',
      body: '',
      author: 'ada',
      state: 'merged',
      head: 'old',
      headSha: r.baseSha,
      base: 'main',
      baseSha: r.baseSha,
      comments: [],
      commits: [],
      checks: [],
      updatedAt: at(8),
    },
  ]
}
```

- [ ] **Step 8: E2E dell'`Api`**

Crea `test/e2e/pull-requests-api.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { git } from '../helpers/repo'
import { demoPulls, demoRepo, fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'

type Win = { api: Api }

test('window.api: account, remote, lista e modifiche di una PR con il server finto; il token non arriva al renderer', async () => {
  const repo = demoRepo('git.example.com', (n) => `refs/pull/${n}/head`)
  const server = await fakeHosting(demoPulls(repo))
  const { app, page } = await launch([], tempUserData(), { MERLINO_E2E_API: server.url })
  await page.evaluate((r) => (globalThis as unknown as Win).api.openRepo(r), repo.clone)

  const bad = await page.evaluate(() => (globalThis as unknown as Win).api.addAccount('github', 'git.example.com', 'wrong'))
  expect(bad).toMatchObject({ ok: false, error: { code: 'auth' } })
  const added = await page.evaluate(() => (globalThis as unknown as Win).api.addAccount('github', 'git.example.com', 'good-token'))
  expect(added).toMatchObject({ ok: true, value: { account: { username: 'ada', host: 'git.example.com', service: 'github' } } })

  const remotes = await page.evaluate((r) => (globalThis as unknown as Win).api.prRemotes(r), repo.clone)
  expect(remotes).toMatchObject({ ok: true, value: [{ name: 'origin', host: 'git.example.com', account: { username: 'ada' } }] })
  const list = await page.evaluate((r) => (globalThis as unknown as Win).api.prList(r, 'origin', 'open'), repo.clone)
  expect(list.ok && list.value.map((p) => p.number)).toEqual([1, 2])

  const refs = git(repo.clone, 'for-each-ref')
  const changes = await page.evaluate(
    ({ r, base, head }) => (globalThis as unknown as Win).api.prChanges(r, 'origin', 1, { base: 'main', baseSha: base, headSha: head }),
    { r: repo.clone, base: repo.baseSha, head: repo.loginSha },
  )
  expect(changes).toMatchObject({ ok: true, value: { commits: [{ subject: 'Add the login page' }], files: [{ path: 'login.txt', status: 'A' }] } })
  expect(git(repo.clone, 'for-each-ref')).toBe(refs)

  const evil = await page.evaluate((r) => (globalThis as unknown as Win).api.prList(r, '--upload-pack=x', 'open'), repo.clone)
  expect(evil.ok).toBe(false)
  expect(JSON.stringify(await page.evaluate(() => (globalThis as unknown as Win).api.getSettings()))).not.toContain('good-token')
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests-api.spec.ts`
Expected: PASS.

- [ ] **Step 9: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: canali IPC di account e pull request, validati nel main; server finto per gli E2E"
```

---

### Task 8: Store delle pull request nel renderer

**Files:**
- Create: `src/renderer/pull-requests/model.ts`, `src/renderer/stores/pull-requests.ts`
- Modify: `src/renderer/stores/repo.ts` (`page`), `src/renderer/stores/app.ts`
- Test: `test/unit/pull-requests.test.ts`

**Interfaces:**
- Consumes: i metodi dell'`Api` del Task 7.
- Produces:
  - in `model.ts`: `matches(p, query): boolean`, `pickRemote(remotes, saved): string | null`, `defaultMergeMessage(service, method, squash, pr): string`, `headLabel(p): string`, `splitUpstream(upstream, remotes): { remote; branch } | null`;
  - `usePullRequestStore(root)` con: `remotes`, `remote`, `filter`, `query`, `list`, `openCount`, `stale`, `error`, `selected`, `detail`, `tab`, `changes`, `changesError`, `commit`, `file`, `diff`, `ci`, `busy`, `merging`, `creating`, `current`, `withAccount`, `visible`, `refresh()`, `load()`, `poll()`, `select(n)`, `loadDetail()`, `setTab(tab)`, `loadChanges()`, `selectFile(f)`, `loadDiff(force?)`, `openCommit(sha)`, `comment(body)`, `setState(state)`, `merge(options)`, `checkout()`, `create(input, push)`, `setRemote(name)`, `setFilter(filter)`; `disposePullRequestStore(root)`; `type PullRequestTab`;
  - `repo.page: 'history' | 'pullRequests'`;
  - nello store dell'app: `SettingsSection` con `'accounts'`, `accountDialog: { service; host } | null`, `openAccountDialog(draft)`.

- [ ] **Step 1: Test unit delle funzioni pure**

Crea `test/unit/pull-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defaultMergeMessage, headLabel, matches, pickRemote, splitUpstream } from '../../src/renderer/pull-requests/model'
import type { HostingAccount, PullRequestDetail, PullRequestRemote } from '../../src/shared/types'

const pr: PullRequestDetail = {
  number: 7,
  title: 'Add login',
  body: 'Adds the form',
  author: 'ada',
  state: 'open',
  draft: false,
  head: { branch: 'feature/login', sha: 'a'.repeat(40) },
  base: { branch: 'main' },
  fork: false,
  headOwner: null,
  createdAt: 0,
  updatedAt: 0,
  comments: null,
  url: 'https://github.com/acme/demo-app/pull/7',
  baseSha: 'b'.repeat(40),
  mergeBlock: null,
  timeline: [],
}
const account: HostingAccount = { id: 'a1', service: 'github', host: 'github.com', username: 'ada' }
const remote = (name: string, withAccount: boolean, host: string | null = 'github.com'): PullRequestRemote => ({ name, host, account: withAccount ? account : null })

describe('pull request nel renderer', () => {
  it('ricerca: titolo, descrizione, autore, branch e numero', () => {
    for (const q of ['login', 'FORM', 'ada', 'feature/', 'main', '#7', '7', '']) expect(matches(pr, q), q).toBe(true)
    for (const q of ['grace', '#8', 'logout']) expect(matches(pr, q), q).toBe(false)
  })

  it('remote proposto: il ricordato, poi origin, poi il primo con un account; senza account il primo con un server', () => {
    const remotes = [remote('fork', true), remote('origin', true), remote('local', false, null)]
    expect(pickRemote(remotes, 'fork')).toBe('fork')
    expect(pickRemote(remotes, 'sparito')).toBe('origin')
    expect(pickRemote([remote('upstream', true), remote('origin', false)], null)).toBe('upstream')
    expect(pickRemote([remote('local', false, null), remote('upstream', false)], null)).toBe('upstream')
    expect(pickRemote([], null)).toBeNull()
  })

  it('messaggio proposto per il merge', () => {
    expect(defaultMergeMessage('github', 'merge', false, pr)).toBe('Merge pull request #7 from acme/feature/login\n\nAdd login')
    expect(defaultMergeMessage('github', 'squash', false, pr)).toBe('Add login (#7)\n\nAdds the form')
    expect(defaultMergeMessage('github', 'rebase', false, pr)).toBe('')
    expect(defaultMergeMessage('github', 'merge', false, { ...pr, fork: true, headOwner: 'grace' })).toBe('Merge pull request #7 from grace/feature/login\n\nAdd login')
    expect(defaultMergeMessage('gitlab', 'merge', false, pr)).toBe("Merge branch 'feature/login' into 'main'\n\nAdd login")
    expect(defaultMergeMessage('gitlab', 'merge', true, pr)).toBe('Add login')
    expect(defaultMergeMessage('gitlab', 'ff', false, pr)).toBe('')
  })

  it('branch della testa e upstream', () => {
    expect(headLabel(pr)).toBe('feature/login')
    expect(headLabel({ ...pr, fork: true, headOwner: 'grace' })).toBe('grace:feature/login')
    expect(splitUpstream('team/origin/feature/a', ['origin', 'team/origin'])).toEqual({ remote: 'team/origin', branch: 'feature/a' })
    expect(splitUpstream('origin/main', ['origin'])).toEqual({ remote: 'origin', branch: 'main' })
    expect(splitUpstream(null, ['origin'])).toBeNull()
  })
})
```

Run: `npx vitest run test/unit/pull-requests.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/renderer/pull-requests/model.ts`**

```ts
import type { HostingService, MergeMethod, PullRequest, PullRequestRemote } from '../../shared/types'

/** La PR corrisponde alla ricerca: titolo, descrizione, autore, branch, o il numero (anche "#42"). */
export function matches(p: PullRequest, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const number = /^#?(\d+)$/.exec(q)?.[1]
  return (number !== undefined && String(p.number) === number) || [p.title, p.body, p.author, p.head.branch, p.base.branch].some((s) => s.toLowerCase().includes(q))
}

/** Remote proposto: quello scelto l'ultima volta, poi origin, poi il primo con un account; senza account il primo su un server. */
export function pickRemote(remotes: PullRequestRemote[], saved: string | null): string | null {
  const withAccount = remotes.filter((r) => r.account)
  const pool = withAccount.length ? withAccount : remotes.filter((r) => r.host)
  return (pool.find((r) => r.name === saved) ?? pool.find((r) => r.name === 'origin') ?? pool[0])?.name ?? null
}

/** Il branch della testa, con il proprietario se la PR viene da un fork. */
export const headLabel = (p: PullRequest): string => (p.fork && p.headOwner ? `${p.headOwner}:${p.head.branch}` : p.head.branch)

/** Remote e branch di un upstream (origin/feature/a); il nome di un remote può contenere "/": vince il più lungo. */
export function splitUpstream(upstream: string | null, remotes: string[]): { remote: string; branch: string } | null {
  if (!upstream) return null
  const remote = remotes.toSorted((a, b) => b.length - a.length).find((r) => upstream.startsWith(`${r}/`))
  return remote ? { remote, branch: upstream.slice(remote.length + 1) } : null
}

/** Il messaggio proposto nel dialog del merge, come lo scriverebbe il servizio; '' se il metodo non crea un commit. */
export function defaultMergeMessage(service: HostingService, method: MergeMethod, squash: boolean, pr: PullRequest): string {
  if (service === 'gitlab') {
    if (squash) return pr.title
    return method === 'ff' ? '' : `Merge branch '${pr.head.branch}' into '${pr.base.branch}'\n\n${pr.title}`
  }
  if (method === 'squash') return `${pr.title} (#${pr.number})${pr.body.trim() ? `\n\n${pr.body.trim()}` : ''}`
  if (method !== 'merge') return ''
  // Stesso repository: il proprietario è quello del repository, dall'URL della PR
  const owner = pr.headOwner ?? new URL(pr.url).pathname.split('/')[1]
  return `Merge pull request #${pr.number} from ${owner}/${pr.head.branch}\n\n${pr.title}`
}
```

Run: `npx vitest run test/unit/pull-requests.test.ts`
Expected: PASS.

- [ ] **Step 3: `repo.page` e store dell'app**

In `src/renderer/stores/repo.ts`, vicino a `view`:

```ts
    /** Cosa mostrano i pannelli centrale e destro: la storia o le pull request. */
    const page = ref<'history' | 'pullRequests'>('history')
```

e aggiungi `page` al `return`, accanto a `view`.

In `src/renderer/stores/app.ts`:
- `export type SettingsSection = 'general' | 'commit' | 'diff' | 'integrations' | 'accounts' | 'git'`;
- importa `HostingService` dai tipi e `disposePullRequestStore`, `usePullRequestStore` da `./pull-requests`;
- dopo `settingsSection`:

```ts
  /** Dialog "Aggiungi account" aperto, con servizio e server proposti. */
  const accountDialog = shallowRef<{ service: HostingService; host: string } | null>(null)

  /** Impostazioni → Account con il dialog aperto (da "Collega account…" o "Aggiorna token…"). */
  function openAccountDialog(draft: { service: HostingService; host: string }) {
    accountDialog.value = draft
    settingsSection.value = 'accounts'
  }
```

- in `init`, dopo `onRepoChanged`:

```ts
    // Dopo un fetch (anche automatico) le pull request possono essere cambiate
    window.api.onFetched((root) => {
      if (tabs.value.includes(root)) void usePullRequestStore(root).load()
    })
```

- in `close`, dopo `disposeRepoStore(root)`: `disposePullRequestStore(root)`;
- nel `return`: `accountDialog`, `openAccountDialog`.

- [ ] **Step 4: `src/renderer/stores/pull-requests.ts`**

```ts
import { defineStore, getActivePinia } from 'pinia'
import { computed, ref, shallowRef, triggerRef, watch } from 'vue'
import type { Result } from '../../shared/ipc'
import type {
  CiStatus,
  FileChange,
  FileDiff,
  GitErrorInfo,
  MergeOptions,
  NewPullRequest,
  PullRequest,
  PullRequestChanges,
  PullRequestDetail,
  PullRequestFilter,
  PullRequestRemote,
} from '../../shared/types'
import { matches, pickRemote } from '../pull-requests/model'
import { useAppStore } from './app'
import { useRepoStore } from './repo'

const storeId = (root: string) => `pull-requests:${root}`
/** Il remote scelto, per repo: una comodità locale, nel localStorage della finestra. */
const remoteKey = (root: string) => `merlino.pullRequestRemote:${root}`
const CI_WORKERS = 4

export type PullRequestTab = 'conversation' | 'commits' | 'changes'

function define(root: string) {
  return defineStore(storeId(root), () => {
    const app = useAppStore()
    const repo = useRepoStore(root)
    const remotes = shallowRef<PullRequestRemote[]>([])
    const remote = ref<string | null>(null)
    const filter = ref<PullRequestFilter>('open')
    const query = ref('')
    const list = shallowRef<PullRequest[] | null>(null)
    /** PR aperte del remote scelto, per la sidebar. */
    const openCount = ref<number | null>(null)
    /** L'ultimo caricamento è fallito: la lista mostrata è quella di prima. */
    const stale = ref(false)
    const error = shallowRef<GitErrorInfo | null>(null)
    const selected = ref<number | null>(null)
    const detail = shallowRef<PullRequestDetail | null>(null)
    const tab = ref<PullRequestTab>('conversation')
    const changes = shallowRef<PullRequestChanges | null>(null)
    const changesError = ref<string | null>(null)
    /** Commit aperto nella scheda Commit; il suo dettaglio è quello dello store del repo (CommitDetail). */
    const commit = ref<string | null>(null)
    const file = shallowRef<FileChange | null>(null)
    const diff = shallowRef<FileDiff | null>(null)
    /** CI per SHA: resta in memoria; si ricontrollano solo quelle in corso. */
    const ci = shallowRef(new Map<string, CiStatus>())
    /** Un'azione sul server in corso (commento, merge, chiusura). */
    const busy = ref(false)
    const merging = ref(false)
    /** Dialog di una nuova PR aperto, con il branch proposto. */
    const creating = shallowRef<{ branch: string } | null>(null)
    let listRequest = 0
    let detailRequest = 0
    let diffRequest = 0

    const current = computed(() => remotes.value.find((r) => r.name === remote.value) ?? null)
    const withAccount = computed(() => remotes.value.filter((r) => r.account))
    const visible = computed(() => (list.value ?? []).filter((p) => matches(p, query.value)))

    function clear() {
      list.value = null
      openCount.value = null
      stale.value = false
      error.value = null
      selected.value = null
      detail.value = null
      changes.value = null
    }

    async function loadRemotes() {
      const r = await window.api.prRemotes(root)
      if (!r.ok) return
      remotes.value = r.value
      const name = pickRemote(r.value, localStorage.getItem(remoteKey(root)))
      if (name !== remote.value) {
        remote.value = name
        clear()
      }
    }

    /** Remote e account (cambiano dalle Impostazioni), lista e PR selezionata. */
    async function refresh() {
      await loadRemotes()
      await Promise.all([load(), loadDetail()])
    }

    async function load() {
      const name = remote.value
      if (!name || !current.value?.account) return
      const which = filter.value
      const request = ++listRequest
      const r = await window.api.prList(root, name, which)
      if (request !== listRequest) return
      if (!r.ok) {
        error.value = r.error
        stale.value = list.value !== null
        return
      }
      list.value = r.value
      stale.value = false
      error.value = null
      if (which === 'open') openCount.value = r.value.length
      void loadChecks(r.value.filter((p) => p.state === 'open' && !ci.value.has(p.head.sha)).map((p) => p.head.sha))
    }

    /** CI di più SHA, al massimo CI_WORKERS richieste alla volta. */
    async function loadChecks(shas: string[]) {
      const name = remote.value
      if (!name) return
      const queue = [...new Set(shas)]
      const worker = async () => {
        for (let sha = queue.shift(); sha; sha = queue.shift()) {
          const r = await window.api.prChecks(root, name, sha)
          if (!r.ok || remote.value !== name) continue
          ci.value.set(sha, r.value)
          triggerRef(ci)
        }
      }
      await Promise.all(Array.from({ length: CI_WORKERS }, worker))
    }

    /** Dalla vista, ogni 30 s: solo le CI ancora in corso. */
    const poll = () => loadChecks([...ci.value].filter(([, s]) => s.summary === 'running').map(([sha]) => sha))

    async function select(n: number) {
      selected.value = n
      detail.value = null
      tab.value = 'conversation'
      commit.value = null
      changes.value = null
      changesError.value = null
      file.value = null
      diff.value = null
      await loadDetail()
    }

    async function loadDetail() {
      const name = remote.value
      const n = selected.value
      if (!name || n === null) return
      const request = ++detailRequest
      const r = await window.api.prDetail(root, name, n)
      if (request !== detailRequest) return
      if (!r.ok) {
        error.value = r.error
        return
      }
      // Nuovi commit sulla PR: commit e modifiche vanno riletti
      if (detail.value && detail.value.head.sha !== r.value.head.sha) {
        changes.value = null
        changesError.value = null
      }
      detail.value = r.value
      if (!ci.value.has(r.value.head.sha)) void loadChecks([r.value.head.sha])
      if (tab.value !== 'conversation' && !changes.value) await loadChanges()
    }

    async function setTab(next: PullRequestTab) {
      tab.value = next
      commit.value = null
      if (next !== 'conversation' && !changes.value) await loadChanges()
    }

    /** Scarica gli oggetti della PR (se mancano) e legge commit e file con git. */
    async function loadChanges() {
      const d = detail.value
      const name = remote.value
      if (!d || !name) return
      changesError.value = null
      const r = await window.api.prChanges(root, name, d.number, { base: d.base.branch, baseSha: d.baseSha, headSha: d.head.sha })
      if (detail.value?.number !== d.number || detail.value.head.sha !== d.head.sha) return
      if (!r.ok) {
        changesError.value = r.error.message
        return
      }
      changes.value = r.value
      await selectFile(r.value.files[0] ?? null)
    }

    async function selectFile(f: FileChange | null) {
      file.value = f
      await loadDiff()
    }

    async function loadDiff(force = false) {
      const d = detail.value
      const f = file.value
      const request = ++diffRequest
      if (!d || !f) {
        diff.value = null
        return
      }
      const target = f.oldPath ? { path: f.path, oldPath: f.oldPath } : { path: f.path }
      const prefs = app.preferences
      const options = { ignoreWhitespace: repo.diffOptions.ignoreWhitespace, force, context: prefs.diffContext, algorithm: prefs.diffAlgorithm }
      const r = await window.api.prFileDiff(root, d.baseSha, d.head.sha, target, options)
      if (request !== diffRequest) return
      if (r.ok) diff.value = r.value
      else changesError.value = r.error.message
    }

    /** Un commit della PR nella scheda Commit; prima servono i suoi oggetti. */
    async function openCommit(sha: string) {
      tab.value = 'commits'
      commit.value = sha
      if (!changes.value) await loadChanges()
      await repo.select(sha)
    }

    /** Un'azione sul server; poi si ricaricano lista e dettaglio, e l'eventuale errore resta visibile. */
    async function act(op: () => Promise<Result<unknown>>): Promise<boolean> {
      busy.value = true
      error.value = null
      const r = await op()
      await Promise.all([load(), loadDetail()])
      busy.value = false
      if (!r.ok) error.value = r.error
      return r.ok
    }

    const target = () => ({ name: remote.value ?? '', n: selected.value ?? 0 })
    const comment = (body: string) => act(() => window.api.prComment(root, target().name, target().n, body))
    const setState = (state: 'open' | 'closed') => act(() => window.api.prSetState(root, target().name, target().n, state))

    /** Dopo il merge anche un fetch del repo. */
    async function merge(options: MergeOptions): Promise<boolean> {
      const ok = await act(() => window.api.prMerge(root, target().name, target().n, options))
      if (ok) await repo.git({ kind: 'fetch' })
      return ok
    }

    async function checkout() {
      const d = detail.value
      if (!d || !remote.value) return
      await repo.run(window.api.prCheckout(root, remote.value, d.number, d.fork ? null : d.head.branch))
    }

    /** push: prima il branch con le modifiche (con upstream), se sul remote manca o è indietro. Poi si apre la nuova PR. */
    async function create(input: NewPullRequest, push: { remote: string; branch: string; remoteBranch: string } | null): Promise<boolean> {
      if (push && !(await repo.git({ kind: 'pushBranch', ...push }))) return false
      const r = await window.api.prCreate(root, input)
      if (!r.ok) {
        error.value = r.error
        return false
      }
      repo.page = 'pullRequests'
      if (remote.value !== input.remote) setRemote(input.remote)
      filter.value = 'open'
      await load()
      await select(r.value)
      return true
    }

    function setRemote(name: string) {
      remote.value = name
      localStorage.setItem(remoteKey(root), name)
      clear()
      void load()
    }

    function setFilter(next: PullRequestFilter) {
      filter.value = next
      list.value = null
      void load()
    }

    // Account nuovi o tolti, o un altro account per un remote: si riparte da lì
    watch(
      () => JSON.stringify([app.settings?.accounts, app.settings?.remoteAccounts]),
      () => void refresh(),
    )
    // "Ignora gli spazi" vale anche per il diff della PR
    watch(
      () => repo.diffOptions.ignoreWhitespace,
      () => void loadDiff(),
    )

    return {
      root, remotes, remote, filter, query, list, openCount, stale, error, selected, detail, tab, changes, changesError, commit, file, diff, ci,
      busy, merging, creating, current, withAccount, visible,
      refresh, load, poll, select, loadDetail, setTab, loadChanges, selectFile, loadDiff, openCommit, comment, setState, merge, checkout, create,
      setRemote, setFilter,
    }
  })
}

const definitions = new Map<string, ReturnType<typeof define>>()

/** Uno store per ogni repo aperto, come quello del repo. */
export function usePullRequestStore(root: string) {
  let useStore = definitions.get(root)
  if (!useStore) {
    useStore = define(root)
    definitions.set(root, useStore)
  }
  return useStore()
}

export function disposePullRequestStore(root: string): void {
  const useStore = definitions.get(root)
  if (!useStore) return
  useStore().$dispose()
  delete getActivePinia()?.state.value[storeId(root)]
  definitions.delete(root)
}
```

- [ ] **Step 5: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: store delle pull request nel renderer (lista, CI, dettaglio, azioni)"
```

---

### Task 9: Impostazioni → Account

**Files:**
- Create: `src/renderer/components/settings/AccountSettings.vue`, `src/renderer/components/settings/AccountDialog.vue`, `test/e2e/pull-requests.spec.ts`
- Modify: `src/renderer/components/SettingsView.vue`, `src/shared/i18n/en.ts`, `it.ts`

**Interfaces:**
- Consumes: `app.accountDialog`, `app.openAccountDialog` (Task 8); `window.api.addAccount`, `removeAccount` (Task 7).
- Produces: la sezione `accounts` delle Impostazioni; `data-testid`: `settings-accounts`, `account-row`, `account-add`, `account-remove`, `account-connected`, `account-dialog`, `account-service`, `account-host`, `account-token`, `account-create-token`, `account-error`, `account-save`.

- [ ] **Step 1: E2E**

Crea `test/e2e/pull-requests.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Impostazioni → Account: token rifiutato, poi collegato; il server segue il servizio; rimozione', async () => {
  const server = await fakeHosting([])
  const { app, page } = await launch([], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByText('Open Repository…')).toBeVisible()
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-accounts').click()
  await page.getByTestId('account-add').click()
  await expect(page.getByTestId('account-host')).toHaveValue('github.com')
  await page.getByTestId('account-service').selectOption('gitlab')
  await expect(page.getByTestId('account-host')).toHaveValue('gitlab.com')
  await page.getByTestId('account-host').fill('gitlab.example.com')
  await page.getByTestId('account-token').fill('wrong')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-error')).toHaveText('The token for gitlab.example.com is not valid or has expired')
  await page.getByTestId('account-token').fill('good-token')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-connected')).toHaveText('Connected as ada (gitlab.example.com)')
  await expect(page.getByTestId('account-row')).toHaveText([/GitLab.*ada@gitlab\.example\.com/])
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('account-remove').click()
  await expect(page.getByTestId('account-row')).toHaveCount(0)
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: FAIL, la sezione non esiste.

- [ ] **Step 2: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `settings.accounts` | Accounts | Account |
| `account.none` | No accounts yet. Connect GitHub or GitLab to work with pull requests in Merlino. | Nessun account. Collega GitHub o GitLab per lavorare con le pull request in Merlino. |
| `account.add` | Add Account… | Aggiungi account… |
| `account.remove` | Remove | Rimuovi |
| `account.openInBrowser` | Open in Browser | Apri nel browser |
| `account.confirmRemove` | Remove the account {account}? Its token is deleted from this computer. | Rimuovere l'account {account}? Il suo token viene cancellato da questo computer. |
| `account.connected` | Connected as {user} ({host}) | Connesso come {user} ({host}) |
| `account.title` | Add account | Aggiungi account |
| `account.service` | Service | Servizio |
| `account.server` | Server | Server |
| `account.token` | Token | Token |
| `account.tokenHint` | A personal access token with the {scope} scope, kept encrypted in the system keychain. | Un token personale con il permesso {scope}, cifrato nel portachiavi del sistema. |
| `account.createToken` | Create Token… | Crea token… |
| `account.save` | Connect | Collega |
| `account.checking` | Checking… | Verifica… |

- [ ] **Step 3: `settings/AccountDialog.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { HostingAccount, HostingService } from '../../../shared/types'
import { t } from '../../i18n'
import { useAppStore } from '../../stores/app'

const emit = defineEmits<{ saved: [account: HostingAccount] }>()
const app = useAppStore()
const DEFAULT_HOST: Record<HostingService, string> = { github: 'github.com', gitlab: 'gitlab.com' }
const service = ref<HostingService>(app.accountDialog?.service ?? 'github')
const host = ref(app.accountDialog?.host ?? DEFAULT_HOST[service.value])
const token = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())

function setService(next: HostingService) {
  // Il server predefinito segue il servizio, se l'utente non l'ha cambiato
  if (host.value === DEFAULT_HOST[service.value]) host.value = DEFAULT_HOST[next]
  service.value = next
}

/** Pagina del servizio per creare un token con i permessi giusti, già compilata (si apre nel browser). */
function createToken() {
  const h = host.value.trim() || DEFAULT_HOST[service.value]
  window.open(
    service.value === 'github'
      ? `https://${h}/settings/tokens/new?scopes=repo&description=Merlino`
      : `https://${h}/-/user_settings/personal_access_tokens?name=Merlino&scopes=api`,
  )
}

async function save() {
  busy.value = true
  error.value = null
  const r = await window.api.addAccount(service.value, host.value, token.value)
  busy.value = false
  if (!r.ok) {
    error.value = r.error.message
    return
  }
  app.settings = r.value.settings
  app.accountDialog = null
  emit('saved', r.value.account)
}
</script>

<template>
  <dialog ref="dialog" data-testid="account-dialog" @cancel.prevent="app.accountDialog = null">
    <form @submit.prevent="save">
      <h2>{{ t('account.title') }}</h2>
      <label class="field">
        <span>{{ t('account.service') }}</span>
        <select :value="service" data-testid="account-service" @change="setService(($event.target as HTMLSelectElement).value as HostingService)">
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('account.server') }}</span>
        <input v-model="host" data-testid="account-host" />
      </label>
      <label class="field">
        <span>{{ t('account.token') }}</span>
        <input v-model="token" type="password" autocomplete="off" data-testid="account-token" />
      </label>
      <p class="hint">
        {{ t('account.tokenHint', { scope: service === 'github' ? 'repo' : 'api' }) }}
        <button type="button" class="link" data-testid="account-create-token" @click="createToken">{{ t('account.createToken') }}</button>
      </p>
      <p v-if="error" class="error" data-testid="account-error">{{ error }}</p>
      <footer>
        <button type="button" @click="app.accountDialog = null">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="account-save" :disabled="busy || !host.trim() || !token.trim()">
          {{ busy ? t('account.checking') : t('account.save') }}
        </button>
      </footer>
    </form>
  </dialog>
</template>
```

- [ ] **Step 4: `settings/AccountSettings.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { HostingAccount } from '../../../shared/types'
import { t } from '../../i18n'
import { useAppStore } from '../../stores/app'
import AccountDialog from './AccountDialog.vue'

const app = useAppStore()
const SERVICE = { github: 'GitHub', gitlab: 'GitLab' } as const
/** Conferma dell'ultimo account collegato. */
const connected = ref<string | null>(null)

function add() {
  connected.value = null
  app.accountDialog = { service: 'github', host: 'github.com' }
}

const openSite = (a: HostingAccount) => window.open(`https://${a.host}`)

async function remove(a: HostingAccount) {
  if (!window.confirm(t('account.confirmRemove', { account: `${a.username}@${a.host}` }))) return
  const r = await window.api.removeAccount(a.id)
  if (r.ok) app.settings = r.value
  else app.error = r.error.message
}
</script>

<template>
  <div class="accounts">
    <p v-if="!app.settings?.accounts.length" class="muted">{{ t('account.none') }}</p>
    <ul v-else>
      <li v-for="a in app.settings.accounts" :key="a.id" data-testid="account-row">
        <strong>{{ SERVICE[a.service] }}</strong>
        <span class="name">{{ a.username }}@{{ a.host }}</span>
        <button type="button" @click="openSite(a)">{{ t('account.openInBrowser') }}</button>
        <button type="button" data-testid="account-remove" @click="remove(a)">{{ t('account.remove') }}</button>
      </li>
    </ul>
    <button type="button" data-testid="account-add" @click="add">{{ t('account.add') }}</button>
    <p v-if="connected" class="muted" data-testid="account-connected">{{ connected }}</p>
    <AccountDialog v-if="app.accountDialog" @saved="(a) => (connected = t('account.connected', { user: a.username, host: a.host }))" />
  </div>
</template>
```

- [ ] **Step 5: La sezione nelle Impostazioni**

In `SettingsView.vue` importa `AccountSettings` e aggiungi a `SECTIONS`, dopo `integrations`:

```ts
  { id: 'accounts', title: 'settings.accounts', component: AccountSettings },
```

In `src/renderer/styles.css`, dopo `button.primary`, lo stile dei pulsanti-link usati da qui in avanti:

```css
button.link { padding: 0; border: 0; background: none; color: var(--accent); }
button.link:hover { background: none; text-decoration: underline; }
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: Impostazioni → Account (collega con un token, rimuovi, crea token nel browser)"
```

---

### Task 10: Vista Pull requests: lista, dettaglio, Markdown, ⌘1/⌘2

**Files:**
- Create: `src/renderer/components/PullRequestList.vue`, `src/renderer/components/PullRequestDetail.vue`, `src/renderer/components/Markdown.vue`, `src/renderer/actions/pull-requests.ts`
- Modify: `package.json` (dipendenze), `src/renderer/components/RepoView.vue`, `src/renderer/components/RepoSidebar.vue`, `src/renderer/App.vue`, `src/renderer/actions/working.ts`, `src/renderer/actions/history.ts`, `src/shared/shortcuts.ts`, `src/main/menu.ts`, `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/e2e/pull-requests.spec.ts`

**Interfaces:**
- Consumes: `usePullRequestStore` e `model.ts` (Task 8); `app.openAccountDialog` (Task 8); `popup` da `actions/branches.ts`; `CommitDetail`, `DiffView`.
- Produces:
  - azioni `view.history` (⌘1) e `view.pullRequests` (⌘2), anche nel menu Vista;
  - `registerPullRequestActions()`;
  - `data-testid`: `page-history`, `page-pull-requests`, `pr-search`, `pr-filter`, `pr-remote`, `pr-new`, `pr-reload`, `pr-error`, `pr-update-token`, `pr-no-account`, `pr-connect`, `pr-row`, `pr-ci`, `pr-stale`, `pr-title`, `pr-state`, `pr-ci-summary`, `pr-checks`, `pr-checkout`, `pr-merge`, `pr-close`, `pr-reopen`, `pr-more`, `pr-tab-conversation`, `pr-tab-commits`, `pr-tab-changes`, `timeline-comment`, `timeline-commit`, `pr-comment`, `pr-comment-send`, `pr-commit`, `pr-back`, `pr-file`.

- [ ] **Step 1: E2E**

In `test/e2e/pull-requests.spec.ts` importa anche `type Page` da `@playwright/test`, `git` da `../helpers/repo` e `demoPulls`, `demoRepo` da `./fake-hosting`, e aggiungi:

```ts
/** Impostazioni → Account → Aggiungi, con il token del server finto; poi torna al repo. */
async function addAccount(page: Page, host: string, service: 'github' | 'gitlab' = 'github') {
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-accounts').click()
  await page.getByTestId('account-add').click()
  await page.getByTestId('account-service').selectOption(service)
  await page.getByTestId('account-host').fill(host)
  await page.getByTestId('account-token').fill('good-token')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-connected')).toHaveText(`Connected as ada (${host})`)
  await page.keyboard.press('Escape')
}

/** Repo di prova, server finto e Merlino con il repo aperto. */
async function start(host = 'git.example.com', prRef = (n: number) => `refs/pull/${n}/head`) {
  const repo = demoRepo(host, prRef)
  const server = await fakeHosting(demoPulls(repo))
  const { app, page } = await launch([repo.clone], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByTestId('commit-row').first()).toBeVisible()
  return { repo, server, app, page }
}

test('lista: account dalla vista, numero nella sidebar, CI, ricerca e filtro; ⌘1 e ⌘2', async () => {
  const { server, app, page } = await start()
  await page.getByTestId('page-pull-requests').click()
  await expect(page.getByTestId('pr-no-account')).toContainText('No account for git.example.com')
  await page.getByTestId('pr-connect').click()
  await expect(page.getByTestId('account-host')).toHaveValue('git.example.com')
  await page.getByTestId('account-token').fill('good-token')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-connected')).toHaveText('Connected as ada (git.example.com)')
  await page.keyboard.press('Escape')

  await expect(page.getByTestId('pr-row')).toHaveCount(2)
  await expect(page.getByTestId('page-pull-requests')).toContainText('2')
  await expect(page.getByTestId('pr-row').nth(0).getByTestId('pr-ci')).toHaveAttribute('data-state', 'passed')
  await expect(page.getByTestId('pr-row').nth(1).getByTestId('pr-ci')).toHaveAttribute('data-state', 'failed')
  await expect(page.getByTestId('pr-row').nth(1)).toContainText('grace:fix-typo → main')
  await page.getByTestId('pr-search').fill('login')
  await expect(page.getByTestId('pr-row')).toHaveCount(1)
  await page.getByTestId('pr-search').fill('')
  await page.getByTestId('pr-filter').selectOption('merged')
  await expect(page.getByTestId('pr-row')).toHaveText([/Old experiment/])

  await page.keyboard.press(`${mod}+1`)
  await expect(page.getByTestId('history-search')).toBeVisible()
  await page.keyboard.press(`${mod}+2`)
  await expect(page.getByTestId('pr-search')).toBeVisible()
  await app.close()
  await server.close()
})

test('dettaglio: Markdown, check, commento con ⌘↩, commit e modifiche scaricati con git senza ref nuovi', async () => {
  const { repo, server, app, page } = await start()
  await addAccount(page, 'git.example.com')
  await page.keyboard.press(`${mod}+2`)
  await page.getByTestId('pr-row').first().click()
  await expect(page.getByTestId('pr-title')).toContainText('Add the login page')
  await expect(page.getByTestId('pr-state')).toHaveText('Open')
  await expect(page.locator('.markdown strong')).toHaveText('login')
  await expect(page.getByTestId('timeline-comment')).toContainText('Looks good')
  await page.getByTestId('pr-ci-summary').click()
  await expect(page.getByTestId('pr-checks')).toContainText('test')

  await page.getByTestId('pr-comment').fill('Ship it')
  await page.getByTestId('pr-comment').press(`${mod}+Enter`)
  await expect(page.getByTestId('timeline-comment')).toHaveCount(2)
  expect(server.requests.some((r) => r.line === 'POST /api/v3/repos/acme/demo-app/issues/1/comments')).toBe(true)

  await page.getByTestId('pr-tab-commits').click()
  await expect(page.getByTestId('pr-commit')).toHaveText([/Add the login page/])
  await page.getByTestId('pr-commit').click()
  await expect(page.getByTestId('commit-message')).toContainText('Add the login page')
  await page.getByTestId('pr-back').click()
  await page.getByTestId('pr-tab-changes').click()
  await expect(page.getByTestId('pr-file')).toHaveText([/login\.txt/])
  await expect(page.getByTestId('diff-line-add')).toHaveText([/login/])
  expect(git(repo.clone, 'for-each-ref', '--format=%(refname)')).not.toContain('pull')
  await app.close()
  await server.close()
})

test('checkout di una PR da fork (pr/2) e di una dello stesso repository; chiudi e riapri', async () => {
  const { repo, server, app, page } = await start()
  await addAccount(page, 'git.example.com')
  await page.getByTestId('page-pull-requests').click()
  await page.getByTestId('pr-row').nth(1).click()
  await page.getByTestId('pr-checkout').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('pr/2')
  expect(git(repo.clone, 'rev-parse', 'HEAD').trim()).toBe(repo.forkSha)

  await page.getByTestId('pr-row').first().click()
  await page.getByTestId('pr-checkout').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('feature/login')
  expect(git(repo.clone, 'rev-parse', '--abbrev-ref', 'feature/login@{u}').trim()).toBe('origin/feature/login')

  await page.getByTestId('pr-close').click()
  await expect(page.getByTestId('pr-state')).toHaveText('Closed')
  await page.getByTestId('pr-reopen').click()
  await expect(page.getByTestId('pr-state')).toHaveText('Open')
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: FAIL, la vista non esiste.

- [ ] **Step 2: Dipendenze**

Run: `npm install --save-dev --save-exact marked@18.1.0 dompurify@3.4.16`
Expected: `package.json` le ha in `devDependencies` con le versioni esatte.

- [ ] **Step 3: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `page.history` | History | Storia |
| `page.pullRequests` | Pull Requests | Pull request |
| `action.view.history` | Show History | Mostra la storia |
| `action.view.pullRequests` | Show Pull Requests | Mostra le pull request |
| `action.pr.create` | New Pull Request… | Nuova pull request… |
| `pr.search` | Search: title, description, author, branch | Cerca: titolo, descrizione, autore, branch |
| `pr.filter.open` | Open | Aperte |
| `pr.filter.merged` | Merged | Unite |
| `pr.filter.closed` | Closed | Chiuse |
| `pr.filter.all` | All | Tutte |
| `pr.none` | No pull requests | Nessuna pull request |
| `pr.noAccount` | No account for {host} | Nessun account per {host} |
| `pr.noRemote` | No remote on GitHub or GitLab | Nessun remote su GitHub o GitLab |
| `pr.connect` | Connect Account… | Collega account… |
| `pr.updateToken` | Update Token… | Aggiorna token… |
| `pr.stale` | Not up to date | Non aggiornata |
| `pr.draft` | Draft | Bozza |
| `pr.comments.one` | {count} comment | {count} commento |
| `pr.comments.other` | {count} comments | {count} commenti |
| `pr.select` | Select a pull request | Seleziona una pull request |
| `pr.state.open` | Open | Aperta |
| `pr.state.draft` | Draft | Bozza |
| `pr.state.merged` | Merged | Unita |
| `pr.state.closed` | Closed | Chiusa |
| `pr.tab.conversation` | Conversation | Conversazione |
| `pr.tab.commits` | Commits | Commit |
| `pr.tab.changes` | Changes | Modifiche |
| `pr.merge` | Merge… | Merge… |
| `pr.close` | Close | Chiudi |
| `pr.reopen` | Reopen | Riapri |
| `pr.more` | More actions | Altre azioni |
| `pr.openInBrowser` | Open in Browser | Apri nel browser |
| `pr.copyLink` | Copy Link | Copia link |
| `pr.noDescription` | No description. | Nessuna descrizione. |
| `pr.commentPlaceholder` | Leave a comment (Markdown) | Scrivi un commento (Markdown) |
| `pr.comment` | Comment | Commenta |
| `pr.backToCommits` | ← Commits | ← Commit |
| `pr.loadingChanges` | Downloading the pull request… | Scarico la pull request… |
| `pr.changesFailed` | Could not download the pull request: {reason} | Non è stato possibile scaricare la pull request: {reason} |
| `ci.passed.one` / `.other` | {count} passed | {count} superato / {count} superati |
| `ci.failed.one` / `.other` | {count} failed | {count} fallito / {count} falliti |
| `ci.running.one` / `.other` | {count} in progress | {count} in corso |
| `ci.skipped.one` / `.other` | {count} skipped | {count} saltato / {count} saltati |
| `ci.cancelled.one` / `.other` | {count} cancelled | {count} annullato / {count} annullati |
| `ci.details` | Details | Dettagli |

- [ ] **Step 4: `Markdown.vue`**

```vue
<script setup lang="ts">
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { computed } from 'vue'

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
// Le immagini diventano link: la CSP non carica immagini remote (img-src 'self' data:)
const marked = new Marked({ gfm: true, breaks: true, renderer: { image: ({ href, text }) => `<a href="${escape(href)}">${escape(text || href)}</a>` } })
// I link si aprono nel browser: window.open passa da setWindowOpenHandler del main, che apre solo http(s)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const props = defineProps<{ source: string }>()
const html = computed(() => DOMPurify.sanitize(marked.parse(props.source, { async: false })))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- HTML passato da DOMPurify -->
  <div class="markdown" v-html="html" />
</template>
```

Stile: paragrafi e liste con margini piccoli, `pre`/`code` come nei diff, `blockquote` con il bordo a sinistra, `img` non serve.

- [ ] **Step 5: `PullRequestList.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import type { CiStatus, PullRequestFilter } from '../../shared/types'
import { formatShortDate } from '../history/format'
import { t, tn } from '../i18n'
import { headLabel } from '../pull-requests/model'
import { useAppStore } from '../stores/app'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
const app = useAppStore()
const FILTERS: PullRequestFilter[] = ['open', 'merged', 'closed', 'all']
const SYMBOL: Record<CiStatus['summary'], string> = { passed: '✓', failed: '✕', running: '●', none: '' }

/** Server del remote scelto, se non c'è un account per lui. */
const missing = computed(() => (prs.current && !prs.current.account ? prs.current.host : null))

function connect(host: string) {
  app.openAccountDialog({ service: host.includes('gitlab') ? 'gitlab' : 'github', host })
}

function updateToken() {
  const a = prs.current?.account
  if (a) app.openAccountDialog({ service: a.service, host: a.host })
}

// Finché la vista è aperta, le CI in corso si ricontrollano ogni 30 s
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => void prs.poll(), 30_000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section class="prs">
    <div class="bar">
      <input v-model="prs.query" data-testid="pr-search" :placeholder="t('pr.search')" />
      <select :value="prs.filter" data-testid="pr-filter" @change="prs.setFilter(($event.target as HTMLSelectElement).value as PullRequestFilter)">
        <option v-for="f in FILTERS" :key="f" :value="f">{{ t(`pr.filter.${f}`) }}</option>
      </select>
      <select v-if="prs.withAccount.length > 1" :value="prs.remote" data-testid="pr-remote" @change="prs.setRemote(($event.target as HTMLSelectElement).value)">
        <option v-for="r in prs.withAccount" :key="r.name" :value="r.name">{{ r.name }}</option>
      </select>
      <button data-testid="pr-new" :disabled="!prs.current?.account" @click="prs.creating = { branch: repo.info?.branch ?? '' }">{{ t('action.pr.create') }}</button>
      <button data-testid="pr-reload" :aria-label="t('action.repo.refresh')" :disabled="!prs.current?.account" @click="prs.refresh()">↻</button>
    </div>
    <p v-if="prs.error" class="band" data-testid="pr-error">
      <span>{{ prs.error.message }}</span>
      <button v-if="prs.error.code === 'auth'" data-testid="pr-update-token" @click="updateToken">{{ t('pr.updateToken') }}</button>
      <button :aria-label="t('common.closeError')" @click="prs.error = null">×</button>
    </p>
    <div v-if="missing" class="center" data-testid="pr-no-account">
      <p>{{ t('pr.noAccount', { host: missing }) }}</p>
      <button class="primary" data-testid="pr-connect" @click="connect(missing)">{{ t('pr.connect') }}</button>
    </div>
    <p v-else-if="!prs.current" class="center muted">{{ t('pr.noRemote') }}</p>
    <p v-else-if="prs.list && !prs.visible.length" class="center muted">{{ t('pr.none') }}</p>
    <ul v-else class="rows">
      <li
        v-for="p in prs.visible"
        :key="p.number"
        :class="{ selected: p.number === prs.selected }"
        data-testid="pr-row"
        @click="prs.select(p.number)"
      >
        <div class="first">
          <span class="number">#{{ p.number }}</span>
          <span class="title">{{ p.title }}</span>
          <span v-if="p.draft" class="badge">{{ t('pr.draft') }}</span>
          <span v-if="prs.ci.get(p.head.sha)" class="ci" :class="prs.ci.get(p.head.sha)?.summary" data-testid="pr-ci" :data-state="prs.ci.get(p.head.sha)?.summary">
            {{ SYMBOL[prs.ci.get(p.head.sha)?.summary ?? 'none'] }}
          </span>
        </div>
        <div class="second muted">
          {{ p.author }} · {{ formatShortDate(p.updatedAt) }} · <code>{{ headLabel(p) }} → {{ p.base.branch }}</code>
          <template v-if="p.comments"> · {{ tn('pr.comments', p.comments) }}</template>
        </div>
      </li>
    </ul>
    <p v-if="prs.stale" class="muted stale" data-testid="pr-stale">{{ t('pr.stale') }}</p>
  </section>
</template>
```

Stile: come `HistoryView` (barra in alto con bordo, colonna a tutta altezza, `border-right`); righe su due linee con la selezione di `RepoSidebar`; `.ci.passed` verde `#2da44e`, `.ci.failed` `var(--danger)`, `.ci.running` `#bf8700`; `.band` come `.error-bar` di `App.vue`; `.badge` piccola con `var(--bg-hover)`.

- [ ] **Step 6: `PullRequestDetail.vue`**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CheckState, CiStatus } from '../../shared/types'
import { popup } from '../actions/branches'
import { formatDate, formatShortDate } from '../history/format'
import { t, tn } from '../i18n'
import { headLabel } from '../pull-requests/model'
import { type PullRequestTab, usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import CommitDetail from './CommitDetail.vue'
import DiffView from './DiffView.vue'
import Markdown from './Markdown.vue'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
const TABS: PullRequestTab[] = ['conversation', 'commits', 'changes']
const STATES: CheckState[] = ['failed', 'running', 'passed', 'skipped', 'cancelled']
const SYMBOL: Record<CheckState | CiStatus['summary'], string> = { passed: '✓', failed: '✕', running: '●', skipped: '–', cancelled: '–', none: '' }

const d = computed(() => prs.detail)
const ci = computed(() => (d.value ? prs.ci.get(d.value.head.sha) : undefined))
/** "4 passed · 1 failed" */
const ciText = computed(() =>
  STATES.map((s) => [s, ci.value?.checks.filter((c) => c.state === s).length ?? 0] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => tn(`ci.${s}`, n))
    .join(' · '),
)
const state = computed(() => (d.value?.state === 'open' && d.value.draft ? 'draft' : (d.value?.state ?? 'open')))
const commitCount = computed(() => prs.changes?.commits.length ?? d.value?.timeline.filter((x) => x.kind === 'commit').length ?? 0)
const showChecks = ref(false)
const comment = ref('')

watch(
  () => prs.selected,
  () => {
    showChecks.value = false
    comment.value = ''
  },
)

function tabLabel(tab: PullRequestTab): string {
  if (tab === 'conversation') return t('pr.tab.conversation')
  if (tab === 'commits') return `${t('pr.tab.commits')} (${commitCount.value})`
  return prs.changes ? `${t('pr.tab.changes')} (${prs.changes.files.length})` : t('pr.tab.changes')
}

async function send() {
  if (!comment.value.trim() || prs.busy) return
  if (await prs.comment(comment.value)) comment.value = ''
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
  // ⌘↩ qui invia il commento, non il commit delle modifiche locali
  e.preventDefault()
  e.stopPropagation()
  void send()
}

function more() {
  const url = d.value?.url
  if (!url) return
  void popup([
    { label: t('pr.openInBrowser'), run: () => window.open(url) },
    { label: t('pr.copyLink'), run: () => navigator.clipboard.writeText(url) },
  ])
}
</script>

<template>
  <section class="detail">
    <p v-if="!d" class="muted center">{{ t('pr.select') }}</p>
    <template v-else>
      <header class="head">
        <h2 data-testid="pr-title">{{ d.title }} <span class="muted">#{{ d.number }}</span></h2>
        <div class="meta">
          <span class="state" :class="state" data-testid="pr-state">{{ t(`pr.state.${state}`) }}</span>
          <span>{{ d.author }}</span>
          <code>{{ headLabel(d) }} → {{ d.base.branch }}</code>
          <button v-if="ci && ci.summary !== 'none'" class="link" :class="ci.summary" data-testid="pr-ci-summary" @click="showChecks = !showChecks">
            {{ SYMBOL[ci.summary] }} {{ ciText }}
          </button>
        </div>
        <ul v-if="showChecks && ci" class="checks" data-testid="pr-checks">
          <li v-for="c in ci.checks" :key="c.name">
            <span class="ci" :class="c.state">{{ SYMBOL[c.state] }}</span>
            <span class="name">{{ c.name }}</span>
            <a v-if="c.url" :href="c.url" target="_blank">{{ t('ci.details') }}</a>
          </li>
        </ul>
        <div class="actions">
          <button data-testid="pr-checkout" :disabled="!!repo.busy" @click="prs.checkout()">Checkout</button>
          <template v-if="d.state === 'open'">
            <button class="primary" data-testid="pr-merge" :disabled="prs.busy" @click="prs.merging = true">{{ t('pr.merge') }}</button>
            <button data-testid="pr-close" :disabled="prs.busy" @click="prs.setState('closed')">{{ t('pr.close') }}</button>
          </template>
          <button v-else-if="d.state === 'closed'" data-testid="pr-reopen" :disabled="prs.busy" @click="prs.setState('open')">{{ t('pr.reopen') }}</button>
          <button :aria-label="t('pr.more')" data-testid="pr-more" @click="more">…</button>
        </div>
      </header>
      <nav class="tabs">
        <button v-for="tab in TABS" :key="tab" :class="{ active: prs.tab === tab }" :data-testid="`pr-tab-${tab}`" @click="prs.setTab(tab)">
          {{ tabLabel(tab) }}
        </button>
      </nav>

      <div v-if="prs.tab === 'conversation'" class="conversation">
        <Markdown v-if="d.body.trim()" :source="d.body" />
        <p v-else class="muted">{{ t('pr.noDescription') }}</p>
        <template v-for="item in d.timeline" :key="item.kind === 'commit' ? `c:${item.sha}` : `n:${item.id}`">
          <article v-if="item.kind === 'comment'" class="comment" data-testid="timeline-comment">
            <header><strong>{{ item.author }}</strong> <span class="muted">{{ formatDate(item.time) }}</span></header>
            <Markdown :source="item.body" />
          </article>
          <button v-else class="commit link" data-testid="timeline-commit" @click="prs.openCommit(item.sha)">
            <code>{{ item.sha.slice(0, 7) }}</code> {{ item.subject }}
          </button>
        </template>
        <div class="composer">
          <textarea v-model="comment" rows="3" data-testid="pr-comment" :placeholder="t('pr.commentPlaceholder')" @keydown="onKey" />
          <button data-testid="pr-comment-send" :disabled="!comment.trim() || prs.busy" @click="send">{{ t('pr.comment') }}</button>
        </div>
      </div>

      <div v-else-if="prs.tab === 'commits'" class="pane">
        <template v-if="prs.commit">
          <button class="link back" data-testid="pr-back" @click="prs.commit = null">{{ t('pr.backToCommits') }}</button>
          <CommitDetail :root="root" />
        </template>
        <p v-else-if="prs.changesError" class="error note">{{ t('pr.changesFailed', { reason: prs.changesError }) }}</p>
        <p v-else-if="!prs.changes" class="muted note">{{ t('pr.loadingChanges') }}</p>
        <ul v-else class="list">
          <li v-for="c in prs.changes.commits" :key="c.sha" data-testid="pr-commit" @click="prs.openCommit(c.sha)">
            <code>{{ c.sha.slice(0, 7) }}</code>
            <span class="subject">{{ c.subject }}</span>
            <span class="muted">{{ c.author }} · {{ formatShortDate(c.authorTime) }}</span>
          </li>
        </ul>
      </div>

      <div v-else class="pane">
        <p v-if="prs.changesError" class="error note">{{ t('pr.changesFailed', { reason: prs.changesError }) }}</p>
        <p v-else-if="!prs.changes" class="muted note">{{ t('pr.loadingChanges') }}</p>
        <template v-else>
          <ul class="files">
            <li
              v-for="f in prs.changes.files"
              :key="f.path"
              :class="{ selected: f.path === prs.file?.path }"
              data-testid="pr-file"
              @click="prs.selectFile(f)"
            >
              <span class="status" :class="f.status">{{ f.status }}</span>
              <span class="path">{{ f.oldPath ? `${f.oldPath} → ${f.path}` : f.path }}</span>
              <span class="stat"><span class="plus">+{{ f.added ?? '–' }}</span> <span class="minus">−{{ f.deleted ?? '–' }}</span></span>
            </li>
          </ul>
          <div class="diff-bar">
            <span class="path muted">{{ prs.file?.path }}</span>
            <button @click="repo.toggleSplit()">{{ repo.diffOptions.split ? t('diff.unified') : t('diff.split') }}</button>
            <label>
              <input type="checkbox" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
              {{ t('diff.ignoreWhitespace') }}
            </label>
          </div>
          <DiffView v-if="prs.diff" :diff="prs.diff" :split="repo.diffOptions.split" @force="prs.loadDiff(true)" />
        </template>
      </div>
    </template>
  </section>
</template>
```

Stile: la struttura di `CommitDetail.vue` (colonna flessibile, intestazione al massimo al 35%, file al massimo al 25%, barra del diff); `.pane` è una colonna flessibile e il `CommitDetail` dentro prende lo spazio rimasto (`.pane > section { flex: 1 }`); `.state` è un'etichetta colorata (aperta verde, bozza grigia, unita viola `#8250df`, chiusa `var(--danger)`); le schede come i pulsanti della nav delle Impostazioni.

- [ ] **Step 7: Sidebar e `RepoView`**

In `RepoSidebar.vue`:
- importa `usePullRequestStore` e crea `const prs = usePullRequestStore(props.root)`;
- un ref o uno stash cliccato si guarda nella storia:

```ts
/** Un commit selezionato dalla sidebar si guarda nella storia. */
function showCommit(sha: string) {
  repo.page = 'history'
  void repo.select(sha)
}

function click(row: Row) {
  if (row.folder) toggle(row.folder)
  else if (row.sha) showCommit(row.sha)
}
```

  e nello stash `@click="showCommit(s.sha)"`;
- in cima all'`<aside>`:

```vue
    <nav class="pages">
      <button :class="{ active: repo.page === 'history' }" data-testid="page-history" @click="repo.page = 'history'">{{ t('page.history') }}</button>
      <button :class="{ active: repo.page === 'pullRequests' }" data-testid="page-pull-requests" @click="repo.page = 'pullRequests'">
        <span class="name">{{ t('page.pullRequests') }}</span>
        <span v-if="prs.openCount !== null" class="track">{{ prs.openCount }}</span>
      </button>
    </nav>
```

  con lo stile delle righe della sidebar (`.pages button` a tutta larghezza, senza bordo, `.active` con `var(--selected-bg)`).

In `RepoView.vue`:
- importa `PullRequestDetail`, `PullRequestList`, `usePullRequestStore`; `const prs = usePullRequestStore(props.root)`;
- `onMounted`: dopo il refresh della storia, il numero delle PR per la sidebar:

```ts
onMounted(() => {
  if (!repo.history.version) void repo.refresh()
  if (!prs.remotes.length) void prs.refresh()
})
```

- i pannelli:

```vue
    <div class="panes">
      <RepoSidebar :root="root" />
      <template v-if="repo.page === 'pullRequests'">
        <PullRequestList :root="root" />
        <PullRequestDetail :root="root" />
      </template>
      <template v-else>
        <HistoryView :root="root" />
        <WorkingView v-if="repo.view === 'working'" :root="root" />
        <CommitDetail v-else :root="root" />
      </template>
    </div>
```

- [ ] **Step 8: Azioni, scorciatoie e menu**

In `src/shared/shortcuts.ts`:

```ts
  'view.history': { key: '1', mod: true },
  'view.pullRequests': { key: '2', mod: true },
```

Crea `src/renderer/actions/pull-requests.ts`:

```ts
import { shortcuts } from '../../shared/shortcuts'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { registry } from './builtin'

/** Storia e pull request del repo della tab attiva. */
export function registerPullRequestActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const show = (page: 'history' | 'pullRequests') => () => {
    const r = repo()
    if (r) r.page = page
  }

  registry.register(
    { id: 'view.history', get title() { return t('action.view.history') }, keys: shortcuts['view.history'], when: () => app.active !== null, run: show('history') },
    { id: 'view.pullRequests', get title() { return t('action.view.pullRequests') }, keys: shortcuts['view.pullRequests'], when: () => app.active !== null, run: show('pullRequests') },
  )
}
```

In `App.vue` importa e chiama `registerPullRequestActions()` dopo `registerBranchActions()`.

In `src/main/menu.ts`, all'inizio del sottomenu Vista: `action('view.history'), action('view.pullRequests'), { type: 'separator' },`.

In `src/renderer/actions/working.ts` il commit con ⌘↩ vale solo nella storia:

```ts
      when: () => repo()?.page === 'history' && repo()?.view === 'working' && repo()?.canCommit === true,
```

In `src/renderer/actions/history.ts` ⌘F cerca anche fra le pull request:

```ts
      run: () => document.querySelector<HTMLInputElement>('[data-testid="history-search"], [data-testid="pr-search"]')?.focus(),
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: PASS.

- [ ] **Step 9: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add package.json package-lock.json src test
git commit -m "feat: vista Pull requests (lista con CI, dettaglio con conversazione, commit e modifiche, checkout, chiudi/riapri)"
```

---

### Task 11: Merge

**Files:**
- Create: `src/renderer/components/MergeDialog.vue`
- Modify: `src/renderer/components/RepoView.vue`, `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/e2e/pull-requests.spec.ts`

**Interfaces:**
- Consumes: `prs.merging`, `prs.merge(options)`, `prs.detail`, `prs.ci`, `defaultMergeMessage`, `window.api.prRepo`.
- Produces: `data-testid`: `merge-dialog`, `merge-block`, `merge-warning`, `merge-method`, `merge-squash`, `merge-message`, `merge-delete-branch`, `merge-confirm`.

- [ ] **Step 1: E2E**

In `test/e2e/pull-requests.spec.ts`:

```ts
test('merge: metodi del repo, messaggio proposto, SHA mostrato; poi la PR è unita', async () => {
  const { repo, server, app, page } = await start()
  await addAccount(page, 'git.example.com')
  await page.keyboard.press(`${mod}+2`)
  await page.getByTestId('pr-row').first().click()
  await page.getByTestId('pr-merge').click()
  await expect(page.getByTestId('merge-method').locator('option')).toHaveText(['Merge commit', 'Squash and merge'])
  await expect(page.getByTestId('merge-message')).toHaveValue('Merge pull request #1 from acme/feature/login\n\nAdd the login page')
  await page.getByTestId('merge-method').selectOption('squash')
  await expect(page.getByTestId('merge-message')).toHaveValue('Add the login page (#1)\n\nAdds **login** with a form.')
  await page.getByTestId('merge-confirm').click()
  await expect(page.getByTestId('pr-state')).toHaveText('Merged')
  expect(server.requests.find((r) => r.line === 'PUT /api/v3/repos/acme/demo-app/pulls/1/merge')?.body).toMatchObject({
    merge_method: 'squash',
    sha: repo.loginSha,
    commit_title: 'Add the login page (#1)',
  })
  await expect(page.getByTestId('pr-row')).toHaveCount(1)
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts -g merge`
Expected: FAIL, il dialog non esiste.

- [ ] **Step 2: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `merge.title` | Merge pull request #{number} | Merge della pull request #{number} |
| `merge.methodLabel` | Method | Metodo |
| `merge.method.merge` | Merge commit | Merge commit |
| `merge.method.squash` | Squash and merge | Squash e merge |
| `merge.method.rebase` | Rebase and merge | Rebase e merge |
| `merge.method.ff` | Fast-forward | Fast-forward |
| `merge.squash` | Squash commits | Squash dei commit |
| `merge.message` | Message | Messaggio |
| `merge.deleteBranch` | Delete {branch} from the remote after the merge | Elimina {branch} dal remote dopo il merge |
| `merge.confirm` | Merge | Merge |
| `merge.optionalFailed` | Some checks failed: the merge is allowed, but look at them first. | Alcuni controlli sono falliti: il merge è permesso, ma guardali prima. |
| `merge.block.conflicts` | The pull request has conflicts to resolve. | La pull request ha conflitti da risolvere. |
| `merge.block.checks` | Required checks have not passed yet. | I controlli obbligatori non sono ancora superati. |
| `merge.block.approvals` | Required approvals are missing. | Mancano le approvazioni richieste. |
| `merge.block.draft` | The pull request is a draft. | La pull request è una bozza. |
| `merge.block.discussions` | Some discussions are not resolved. | Alcune discussioni non sono risolte. |
| `merge.block.rebase` | The branch must first be updated with the target branch. | Il branch va prima aggiornato con quello di destinazione. |
| `merge.block.blocked` | The branch rules on the server block the merge (required checks or approvals). | Le regole del branch sul server bloccano il merge (controlli o approvazioni obbligatori). |
| `merge.block.closed` | The pull request is not open. | La pull request non è aperta. |

- [ ] **Step 3: `MergeDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { HostingRepo, MergeMethod } from '../../shared/types'
import { t } from '../i18n'
import { defaultMergeMessage } from '../pull-requests/model'
import { usePullRequestStore } from '../stores/pull-requests'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const pr = computed(() => prs.detail)
const settings = shallowRef<HostingRepo | null>(null)
const method = ref<MergeMethod>('merge')
const squash = ref(false)
const message = ref('')
const deleteBranch = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
const service = computed(() => prs.current?.account?.service ?? 'github')
const ci = computed(() => (pr.value ? prs.ci.get(pr.value.head.sha) : undefined))
// Il messaggio serve solo se il merge crea un commit
const showMessage = computed(() => method.value === 'merge' || method.value === 'squash' || squash.value)

/** Messaggio proposto dal metodo scelto (e dallo squash di GitLab). */
function fill() {
  if (pr.value) message.value = defaultMergeMessage(service.value, method.value, squash.value, pr.value)
}
watch([method, squash], fill)

function close() {
  prs.merging = false
}

onMounted(async () => {
  dialog.value?.showModal()
  const r = await window.api.prRepo(props.root, prs.remote ?? '')
  if (!r.ok) {
    prs.error = r.error
    close()
    return
  }
  settings.value = r.value
  method.value = r.value.methods[0] ?? 'merge'
  squash.value = r.value.squash === 'always' || r.value.squash === 'default'
  deleteBranch.value = r.value.deleteBranch
  fill()
})

async function submit() {
  const p = pr.value
  if (!p || !settings.value || p.mergeBlock) return
  close()
  await prs.merge({
    method: method.value,
    // Lo SHA mostrato: se nel frattempo la PR è cambiata, il servizio rifiuta
    sha: p.head.sha,
    message: showMessage.value ? message.value : '',
    squash: squash.value,
    deleteBranch: deleteBranch.value && !p.fork,
  })
}
</script>

<template>
  <dialog ref="dialog" data-testid="merge-dialog" @cancel.prevent="close">
    <form v-if="pr" @submit.prevent="submit">
      <h2>{{ t('merge.title', { number: pr.number }) }}</h2>
      <p v-if="pr.mergeBlock" class="error" data-testid="merge-block">{{ t(`merge.block.${pr.mergeBlock}`) }}</p>
      <p v-else-if="ci?.summary === 'failed'" class="warning" data-testid="merge-warning">{{ t('merge.optionalFailed') }}</p>
      <template v-if="settings">
        <label v-if="settings.methods.length > 1" class="field">
          <span>{{ t('merge.methodLabel') }}</span>
          <select v-model="method" data-testid="merge-method">
            <option v-for="m in settings.methods" :key="m" :value="m">{{ t(`merge.method.${m}`) }}</option>
          </select>
        </label>
        <label v-if="settings.squash && settings.squash !== 'never'" class="check">
          <input v-model="squash" type="checkbox" :disabled="settings.squash === 'always'" data-testid="merge-squash" />
          {{ t('merge.squash') }}
        </label>
        <label v-if="showMessage" class="field">
          <span>{{ t('merge.message') }}</span>
          <textarea v-model="message" rows="6" data-testid="merge-message" />
        </label>
        <label v-if="!pr.fork" class="check">
          <input v-model="deleteBranch" type="checkbox" data-testid="merge-delete-branch" />
          {{ t('merge.deleteBranch', { branch: pr.head.branch }) }}
        </label>
      </template>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="merge-confirm" :disabled="!settings || !!pr.mergeBlock || prs.busy">{{ t('merge.confirm') }}</button>
      </footer>
    </form>
  </dialog>
</template>
```

Stile: come `RebaseDialog.vue`; `.field` in colonna con l'etichetta sopra; `.warning` con il colore `#bf8700`.

In `RepoView.vue`, dopo `RebaseDialog`:

```vue
    <MergeDialog v-if="prs.merging && prs.detail" :root="root" />
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts -g merge`
Expected: PASS.

- [ ] **Step 4: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: merge di una pull request (metodi del repo, messaggio, SHA mostrato, branch da eliminare)"
```

---

### Task 12: Nuova pull request, account del remote, drop sulla voce Pull requests

**Files:**
- Create: `src/renderer/components/CreatePullRequestDialog.vue`
- Modify: `src/renderer/actions/pull-requests.ts`, `src/renderer/actions/branches.ts`, `src/renderer/drag/drop-actions.ts`, `src/renderer/components/RepoSidebar.vue`, `src/renderer/components/RepoView.vue`, `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/unit/drop-actions.test.ts`, `test/e2e/pull-requests.spec.ts`

**Interfaces:**
- Consumes: `prs.creating`, `prs.create(input, push)`, `splitUpstream`, `window.api.prRepo`, `prBranchSummary`, `setRemoteAccount`.
- Produces:
  - `openCreatePullRequest(repo, branch)` e l'azione `pr.create`;
  - `DropTarget` `{ kind: 'pullRequests' }` e `DropOperation` `{ type: 'createPullRequest'; branch: string }`;
  - voci "Create Pull Request from <branch>…" nel menu del branch e "Account…" nel menu del remote;
  - `data-testid`: `create-dialog`, `create-remote`, `create-base`, `create-head`, `create-push`, `create-title`, `create-body`, `create-draft`, `create-error`, `create-confirm`.

- [ ] **Step 1: Test unit del drop**

In `test/unit/drop-actions.test.ts`, dentro il `describe`:

```ts
  it('branch locale sulla voce Pull requests: nuova pull request', () => {
    expect(act(branch('feature/a'), { kind: 'pullRequests' })).toEqual({
      label: 'New pull request from feature/a…',
      operation: { type: 'createPullRequest', branch: 'feature/a' },
    })
    expect(act(remoteBranch('main'), { kind: 'pullRequests' })).toBeNull()
    expect(act(commit, { kind: 'pullRequests' })).toBeNull()
  })
```

Run: `npx vitest run test/unit/drop-actions.test.ts`
Expected: FAIL.

- [ ] **Step 2: E2E**

In `test/e2e/pull-requests.spec.ts` aggiungi gli import `writeFileSync` da `node:fs`, `join` da `node:path`, `chooseNextMenuItem` da `./menu` e:

```ts
test('nuova pull request dal menu del branch: titolo dal commit, push del branch, poi la PR si apre', async () => {
  const { repo, server, app, page } = await start()
  git(repo.clone, 'switch', '-q', '-c', 'feature/search')
  writeFileSync(join(repo.clone, 'search.txt'), 'search\n')
  git(repo.clone, 'add', '.')
  git(repo.clone, 'commit', '-q', '-m', 'Add search\n\nWith filters.')
  git(repo.clone, 'switch', '-q', 'main')
  await addAccount(page, 'git.example.com')
  await expect(page.getByTestId('branch-item').filter({ hasText: /^search$/ })).toBeVisible()

  await chooseNextMenuItem(app, 'Create Pull Request from feature/search…')
  await page.getByTestId('branch-item').filter({ hasText: /^search$/ }).click({ button: 'right' })
  await expect(page.getByTestId('create-base')).toHaveValue('main')
  await expect(page.getByTestId('create-title')).toHaveValue('Add search')
  await expect(page.getByTestId('create-body')).toHaveValue('With filters.')
  await expect(page.getByTestId('create-push')).toContainText('feature/search')
  await page.getByTestId('create-draft').check()
  await page.getByTestId('create-confirm').click()

  await expect(page.getByTestId('pr-title')).toContainText('Add search')
  expect(git(repo.bare, 'branch', '--list', 'feature/search').trim()).toBe('feature/search')
  expect(server.requests.find((r) => r.line === 'POST /api/v3/repos/acme/demo-app/pulls')?.body).toEqual({
    title: 'Add search',
    body: 'With filters.',
    head: 'feature/search',
    base: 'main',
    draft: true,
  })
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts -g "nuova pull request"`
Expected: FAIL.

- [ ] **Step 3: Testi**

| Chiave | Inglese | Italiano |
|---|---|---|
| `create.title` | New pull request | Nuova pull request |
| `create.remote` | Target remote | Remote di destinazione |
| `create.base` | Target branch | Branch di destinazione |
| `create.head` | Branch with the changes | Branch con le modifiche |
| `create.push` | Merlino first pushes {branch} to {remote}. | Prima Merlino fa il push di {branch} su {remote}. |
| `create.titleField` | Title | Titolo |
| `create.body` | Description | Descrizione |
| `create.draft` | Draft | Bozza |
| `create.confirm` | Create Pull Request | Crea pull request |
| `ctx.createPullRequest` | Create Pull Request from {branch}… | Crea pull request da {branch}… |
| `ctx.account` | Account… | Account… |
| `account.automatic` | Automatic | Automatico |
| `account.manage` | Manage Accounts… | Gestisci gli account… |
| `drop.pullRequest` | New pull request from {branch}… | Nuova pull request da {branch}… |

- [ ] **Step 4: Drop sulla voce Pull requests**

In `src/renderer/drag/drop-actions.ts`:
- in `DropTarget`: `| { kind: 'pullRequests' }`;
- in `DropOperation`: `| { type: 'createPullRequest'; branch: string }`;
- nello `switch` di `dropAction`, prima di `case 'working':`:

```ts
    case 'pullRequests':
      return source.kind === 'branch' ? { label: l('drop.pullRequest', { branch: source.name }), operation: { type: 'createPullRequest', branch: source.name } } : null
```

In `RepoSidebar.vue` la voce Pull requests diventa una destinazione:

```vue
      <button
        v-bind="dnd(undefined, { kind: 'pullRequests' })"
        :class="{ active: repo.page === 'pullRequests' }"
        data-testid="page-pull-requests"
        @click="repo.page = 'pullRequests'"
      >
```

Run: `npx vitest run test/unit/drop-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: `openCreatePullRequest`, azione e menu**

In `src/renderer/actions/pull-requests.ts`:
- importa `usePullRequestStore`;
- prima di `registerPullRequestActions`:

```ts
type Repo = ReturnType<typeof useRepoStore>

/** Dialog di una nuova pull request dal branch indicato. */
export function openCreatePullRequest(repo: Repo, branch: string): void {
  usePullRequestStore(repo.root).creating = { branch }
}
```

- in `registry.register(…)`:

```ts
    {
      id: 'pr.create',
      get title() { return t('action.pr.create') },
      when: () => app.active !== null && usePullRequestStore(app.active).withAccount.length > 0,
      run: () => {
        const r = repo()
        if (r) openCreatePullRequest(r, r.info?.branch ?? '')
      },
    },
```

In `src/renderer/actions/branches.ts`:
- importa `openCreatePullRequest` da `./pull-requests`;
- in `performDrop`: `case 'createPullRequest': return openCreatePullRequest(repo, op.branch)`;
- in `branchMenu`, dopo l'ultima voce: `null, { label: t('ctx.createPullRequest', { branch: b.name }), run: () => openCreatePullRequest(repo, b.name) },`;
- l'account di un remote, dal suo menu:

```ts
/** Account per le pull request di un remote: Automatico (il primo dello stesso server) o uno scelto. */
async function chooseAccount(repo: Repo, remote: RemoteInfo) {
  const app = useAppStore()
  const s = app.settings
  if (!s) return
  // Stessa chiave di accountKey nel main
  const chosen = s.remoteAccounts[`${repo.root}\n${remote.name}`]
  const set = async (id: string | null) => {
    const r = await window.api.setRemoteAccount(repo.root, remote.name, id)
    if (r.ok) app.settings = r.value
    else repo.error = r.error.message
  }
  const mark = (on: boolean) => (on ? '✓ ' : '')
  await popup([
    { label: mark(!chosen) + t('account.automatic'), run: () => set(null) },
    ...s.accounts.map((a) => ({ label: `${mark(a.id === chosen)}${a.username}@${a.host}`, run: () => set(a.id) })),
    null,
    { label: t('account.manage'), run: () => (app.settingsSection = 'accounts') },
  ])
}
```

  e in `remoteMenu`, prima di "Remove": `{ label: t('ctx.account'), run: () => chooseAccount(repo, remote) }, null,`.

- [ ] **Step 6: `CreatePullRequestDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { splitUpstream } from '../pull-requests/model'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const targets = computed(() => prs.withAccount.map((r) => r.name))
const target = ref(prs.remote && targets.value.includes(prs.remote) ? prs.remote : (targets.value[0] ?? ''))
const head = ref(prs.creating?.branch || repo.info?.branch || '')
const base = ref('')
const title = ref('')
const body = ref('')
const draft = ref(false)
/** L'utente ha scritto titolo o descrizione: non si propongono più. */
const edited = ref(false)
const failed = ref<string | null>(null)

const remoteNames = computed(() => repo.refs?.remotes.map((r) => r.name) ?? [])
const branch = computed(() => repo.refs?.branches.find((b) => b.name === head.value))
const upstream = computed(() => splitUpstream(branch.value?.upstream ?? null, remoteNames.value))
// Il branch va sul remote del suo upstream; senza upstream su origin (di solito il proprio fork), altrimenti sulla destinazione
const headRemote = computed(() => upstream.value?.remote ?? (remoteNames.value.includes('origin') ? 'origin' : target.value))
const headBranch = computed(() => upstream.value?.branch ?? head.value)
const needsPush = computed(() => !!branch.value && (!upstream.value || branch.value.gone || branch.value.ahead > 0))
const bases = computed(() => repo.refs?.remotes.find((r) => r.name === target.value)?.branches.map((b) => b.name) ?? [])

/** Branch principale del repository di destinazione. */
async function loadBase() {
  const r = await window.api.prRepo(props.root, target.value)
  if (r.ok) base.value = r.value.defaultBranch
}

/** Titolo e descrizione: dal commit se il branch ne ha uno solo in più, altrimenti il nome del branch. */
async function propose() {
  if (edited.value || !base.value || !head.value) return
  const r = await window.api.prBranchSummary(props.root, `${target.value}/${base.value}`, head.value)
  if (edited.value) return
  const [subject = '', ...rest] = r.ok && r.value.count === 1 ? r.value.message.split('\n') : [head.value]
  title.value = subject
  body.value = rest.join('\n').trim()
}

watch(target, loadBase)
watch([base, head], propose)
onMounted(() => {
  dialog.value?.showModal()
  void loadBase()
})

function close() {
  prs.creating = null
}

async function submit() {
  if (!title.value.trim() || !base.value || !head.value) return
  failed.value = null
  const ok = await prs.create(
    { remote: target.value, base: base.value, headRemote: headRemote.value, head: headBranch.value, title: title.value, body: body.value, draft: draft.value },
    needsPush.value ? { remote: headRemote.value, branch: head.value, remoteBranch: headBranch.value } : null,
  )
  if (ok) close()
  else failed.value = prs.error?.message ?? repo.error
}
</script>

<template>
  <dialog ref="dialog" data-testid="create-dialog" @cancel.prevent="close">
    <form @submit.prevent="submit">
      <h2>{{ t('create.title') }}</h2>
      <label class="field">
        <span>{{ t('create.remote') }}</span>
        <select v-model="target" data-testid="create-remote">
          <option v-for="name in targets" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('create.base') }}</span>
        <input v-model="base" list="create-bases" data-testid="create-base" />
        <datalist id="create-bases">
          <option v-for="b in bases" :key="b" :value="b" />
        </datalist>
      </label>
      <label class="field">
        <span>{{ t('create.head') }}</span>
        <select v-model="head" data-testid="create-head">
          <option v-for="b in repo.refs?.branches ?? []" :key="b.name" :value="b.name">{{ b.name }}</option>
        </select>
      </label>
      <p v-if="needsPush" class="muted" data-testid="create-push">{{ t('create.push', { branch: head, remote: headRemote }) }}</p>
      <label class="field">
        <span>{{ t('create.titleField') }}</span>
        <input v-model="title" data-testid="create-title" @input="edited = true" />
      </label>
      <label class="field">
        <span>{{ t('create.body') }}</span>
        <textarea v-model="body" rows="6" data-testid="create-body" @input="edited = true" />
      </label>
      <label class="check">
        <input v-model="draft" type="checkbox" data-testid="create-draft" />
        {{ t('create.draft') }}
      </label>
      <p v-if="failed" class="error" data-testid="create-error">{{ failed }}</p>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="create-confirm" :disabled="!title.trim() || !base || !head || !!repo.busy">{{ t('create.confirm') }}</button>
      </footer>
    </form>
  </dialog>
</template>
```

Stile: come `MergeDialog.vue`.

In `RepoView.vue`, dopo `MergeDialog`:

```vue
    <CreatePullRequestDialog v-if="prs.creating" :root="root" />
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: PASS.

- [ ] **Step 7: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: nuova pull request (dialog, menu del branch, palette, drop), account del remote dal suo menu"
```

---

### Task 13: GitLab nell'E2E, README, verifica finale

**Files:**
- Modify: `test/e2e/pull-requests.spec.ts`, `README.md`
- Modify: questo piano (note di esecuzione)

- [ ] **Step 1: E2E con GitLab**

In `test/e2e/pull-requests.spec.ts`:

```ts
test('GitLab: lista, dettaglio con le note e modifiche dalla merge request', async () => {
  const { server, app, page } = await start('gitlab.example.com', (n) => `refs/merge-requests/${n}/head`)
  await addAccount(page, 'gitlab.example.com', 'gitlab')
  await page.getByTestId('page-pull-requests').click()
  await expect(page.getByTestId('pr-row')).toHaveCount(2)
  await expect(page.getByTestId('pr-row').nth(1).getByTestId('pr-ci')).toHaveAttribute('data-state', 'failed')
  await page.getByTestId('pr-row').first().click()
  await expect(page.getByTestId('timeline-comment')).toContainText('Looks good')
  await page.getByTestId('pr-tab-changes').click()
  await expect(page.getByTestId('pr-file')).toHaveText([/login\.txt/])
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts -g GitLab`
Expected: PASS.

- [ ] **Step 2: README**

- **Features**: una sezione "Pull requests" dopo "Drag and drop":
  - GitHub (also Enterprise) and GitLab (also self-hosted), connected with a personal access token in Settings → Accounts;
  - list with search, Open / Merged / Closed / All, CI status;
  - details: conversation (Markdown), commits and changes (read with your git), checks;
  - comment, check out (forks too, as `pr/<n>`), merge (the methods the repository allows), close and reopen;
  - create from a branch (menu, palette, or by dropping it on "Pull Requests"), pushing it first if needed;
  - <kbd>⌘</kbd><kbd>1</kbd> / <kbd>⌘</kbd><kbd>2</kbd> switch between History and Pull Requests.
- **Settings**: la riga "Accounts".
- **Keyboard shortcuts**: History / Pull requests, <kbd>⌘</kbd><kbd>1</kbd> / <kbd>⌘</kbd><kbd>2</kbd> e <kbd>Ctrl</kbd>+<kbd>1</kbd> / <kbd>Ctrl</kbd>+<kbd>2</kbd>.
- **How it works**: la voce "No telemetry, no accounts" diventa: "No telemetry. Besides what git itself does (clone, fetch, pull, push), Merlino only contacts the GitHub and GitLab servers of the accounts you connect, with the token you gave it. Tokens are encrypted with the system keychain (on Linux without a keychain Electron can only use weak encryption) and never reach the interface or the logs."

- [ ] **Step 3: Verifica completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde, con la finestra nascosta.

Controlli:
- **Testi**: ogni chiave nuova c'è in `en.ts` e `it.ts` (il test `i18n.test.ts` confronta i segnaposto); nessun testo inglese o italiano scritto a mano nei componenti nuovi.
- **Token**: `grep -rn "tok\|token" out/renderer` non trova token; nel log dei comandi (pannello Output) le chiamate HTTP mostrano metodo e URL, senza token.
- **Screenshot** con la finestra nascosta, sul repo di prova e il server finto (`demoRepo`, `fakeHosting`): lista, dettaglio, dialog del merge e della nuova PR, Impostazioni → Account, in inglese e in italiano.

- [ ] **Step 4: Note di esecuzione e commit**

In fondo a questo piano: commit di ogni task, scelte prese durante il lavoro, esito della verifica.

```bash
git add README.md test docs
git commit -m "test: merge request di GitLab nell'E2E; docs: pull request nel README e note di esecuzione"
```

Prova manuale facoltativa, a cura dell'utente: collegare un proprio account nell'app installata (`npm run dist`) e aprire le pull request di un repository vero.

---

## Note di esecuzione

- **Commit**: Task 1 `c940113`, Task 2 `8b96701`, Task 3 `29b68c6`, Task 4 `9c4e851`, Task 5 `02c99dc`, Task 6 `c7bfd9b`, Task 7 `b9af1ee`, Task 8 `6d86107`, Task 9 `cbca92e`, Task 10 `d6f69e9`, Task 11 `5407d91`, Task 12 `bd3f08e`, Task 13 in questo commit.
- **Scelte prese durante il lavoro**:
  - Il componente Markdown si chiama `MarkdownView.vue`: il lint di Vue vuole nomi di componenti composti.
  - Nella pagina Pull requests la sidebar non evidenzia più il commit selezionato nella storia; cliccare un ref o uno stash riporta alla storia.
  - Gli stili dei campi dei dialog (`.field`, `.check`) stanno in `styles.css`, condivisi da account, merge e nuova pull request; `button.link` pure.
  - Le chiavi dei testi del Task 7 sono entrate già nel commit del Task 6.
- **Verifica**:
  - lint e typecheck puliti;
  - 184 test unit e di integrazione (1 saltato: le prestazioni, opzionale);
  - 38 E2E con la finestra nascosta, di cui 8 nuovi sulle pull request (account, lista, dettaglio, checkout, merge, creazione, GitLab, `window.api`);
  - screenshot nascosti in inglese e in italiano (lista, dettaglio, merge, nuova pull request, Impostazioni → Account) sul repo di prova con nomi fittizi e il server finto;
  - il token non arriva al renderer (`getSettings` e le risposte di `addAccount` non lo contengono) e non compare nel log dei comandi.
- **Da provare a mano**: un account vero nell'app installata (`npm run dist`), con un token personale.
