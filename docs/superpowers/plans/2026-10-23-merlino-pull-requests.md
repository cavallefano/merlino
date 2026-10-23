# Merlino — Pull request e merge request (parte 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestire da Merlino le pull request di GitHub e le merge request di GitLab, come in Tower:
- account con token;
- lista e ricerca;
- dettaglio con conversazione, commit e modifiche;
- commento, checkout, merge, chiusura e riapertura;
- creazione;
- stato della CI.

**Architecture:**
- **Main**: in `src/main/hosting/` parla con le API REST tramite `net.fetch`, con un provider per servizio (`github.ts`, `gitlab.ts`) e la stessa interfaccia `HostingProvider`.
- **Token**: restano nel main, cifrati con `safeStorage`.
- **Commit e diff di una PR**: si leggono con git, dopo aver scaricato gli oggetti della PR senza creare ref, e riusano parser e componenti di oggi.
- **Renderer**:
  - uno store per repo (`usePullRequestStore`);
  - una vista che prende il posto della storia;
  - due dialog, Merge e Nuova pull request.

**Tech Stack:** Electron 45 (`net.fetch`, `safeStorage`), Vue 3, Pinia, TypeScript, Vitest, Playwright; `marked` e `DOMPurify` per il Markdown; git ≥ 2.35.

Spec: `docs/superpowers/specs/2026-10-23-merlino-pull-requests-design.md`. Branch: `feature/pull-requests`, che parte da `main`.

## Global Constraints

- **Servizi**:
  - GitHub: `github.com` → `https://api.github.com`; Enterprise → `https://<host>/api/v3`.
  - GitLab: `https://<host>/api/v4`.
  - Solo token personale.
- **Token**:
  - sta solo nel main, cifrato con `safeStorage` in `<userData>/tokens.json`;
  - mai in `settings.json`, nel log dei comandi o nel renderer;
  - negli E2E (`MERLINO_E2E=1`) la cifratura è finta, così il portachiavi dell'utente resta intatto.
- **Rete**:
  - `net.fetch`, timeout 20 s, `redirect: 'error'`;
  - il token va solo all'indirizzo delle API del suo account;
  - negli E2E `MERLINO_E2E_API` sostituisce l'indirizzo con `http://127.0.0.1:<porta>/<servizio>`.
- **Limiti**:
  - PR aperte fino a 500; unite, chiuse e tutte le 100 aggiornate più di recente;
  - commenti fino a 1000; commit fino a 250;
  - commento, descrizione e messaggio fino a 65 000 caratteri; titolo fino a 300.
- **CI**:
  - quattro richieste alla volta;
  - controllo ogni 30 s, solo con la vista aperta e una CI in corso;
  - nel main, cache per SHA solo degli esiti conclusi (superato o fallito).
- **Checkout di una PR da fork**: branch `pr/<n>`, aggiornato solo in fast-forward.
- **Dipendenze nuove**: solo `marked@18.1.0` e `dompurify@3.4.16`, in `devDependencies` (come gli altri pacchetti del renderer), con versione esatta.
- **Testi**: ogni testo nuovo va in `en.ts` e in `it.ts`. I nomi tecnici restano uguali nelle due lingue: GitHub, GitLab, Checkout, Merge, Squash, Rebase, Fast-forward, Token, Server.
- **Test**:
  - finestra nascosta;
  - nessuna rete vera e nessun token vero;
  - nomi fittizi (ada, grace, `github.example.test`, `gitlab.example.test`);
  - nessun test scrive in `~/.gitconfig`.
- **Differenza dalla spec**:
  - GitHub non dà il numero di commenti nella lista delle PR, quindi `PullRequest.comments` è `number | null`: nella lista compare solo su GitLab, nel dettaglio sempre;
  - la ricerca usa la descrizione, che arriva già con la lista (`PullRequest.body`).

## File

| File | Compito |
|---|---|
| `src/shared/hosting.ts` | Costanti (`HOSTING_SERVICES`, `PR_FILTERS`, `MERGE_METHODS`), `remoteAccountKey`, `accountLabel` |
| `src/main/hosting/remote-url.ts` | URL del remote → `{ host, project }` |
| `src/main/hosting/http.ts` | `apiBase`, `HostingClient` (richieste, paginazione, errori, log) |
| `src/main/hosting/provider.ts` | `HostingProvider`, `PullRequestCreate`, `ciSummary`, `seconds`, `safeWebUrl`, `byTime`, `mergeError` |
| `src/main/hosting/github.ts`, `gitlab.ts` | I due provider |
| `src/main/hosting/tokens.ts` | `TokenStore` con `Cipher` |
| `src/main/hosting/accounts.ts` | `Accounts`: aggiunta, rimozione, account di un remote, provider |
| `src/main/hosting/pull-requests.ts` | `PullRequests`: remote → provider, cache della CI |
| `src/main/hosting/ipc.ts` | `registerHostingIpc` |
| `src/main/git/pull-request.ts` | `pullRef`, fetch degli oggetti, commit e file, diff di un file, riepilogo di un branch |
| `src/renderer/stores/pull-requests.ts` | `usePullRequestStore(root)` |
| `src/renderer/markdown.ts` | `renderMarkdown` |
| `src/renderer/actions/pull-requests.ts` | Azioni della palette e del menu Vista |
| `src/renderer/components/PullRequestList.vue`, `PullRequestDetail.vue`, `PullRequestConversation.vue`, `PullRequestCommits.vue`, `PullRequestChanges.vue`, `MergeDialog.vue`, `CreatePullRequestDialog.vue`, `settings/AccountSettings.vue` | Interfaccia |
| `test/helpers/fake-api.ts` | `fetch` finto per i provider |
| `test/e2e/fake-hosting.ts` | Server finto per gli E2E, repo con remote fittizio, account già collegato |

---

### Task 1: Tipi comuni, URL dei remote, impostazioni

**Files:**
- Create: `src/shared/hosting.ts`, `src/main/hosting/remote-url.ts`
- Modify: `src/shared/types.ts`, `src/main/settings.ts`
- Test: `test/unit/remote-url.test.ts`, `test/unit/settings.test.ts`

**Interfaces:**
- Produces:
  - tipi `HostingService`, `HostingAccount`, `HostingTarget`, `PullRequestState`, `PullRequestFilter`, `PullRequest`, `MergeMethod`, `MergeBlock`, `MergeSettings`, `PullRequestDetail`, `TimelineItem`, `CheckState`, `Check`, `CiStatus`, `MergeRequest`, `NewPullRequest`, `PullRequestChanges`;
  - `AppSettings.accounts`, `AppSettings.remoteAccounts`;
  - `CommandLogEntry.api?: boolean`, `GitErrorInfo.code?: 'auth'`;
  - `parseRemoteUrl(url): RemoteLocation | null`;
  - `remoteAccountKey(root, remote)`, `accountLabel(account)`, `HOSTING_SERVICES`, `PR_FILTERS`, `MERGE_METHODS`.

- [ ] **Step 1: Test di `parseRemoteUrl`**

`test/unit/remote-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseRemoteUrl } from '../../src/main/hosting/remote-url'

describe('parseRemoteUrl', () => {
  it.each([
    ['https://github.com/ada/demo.git', 'github.com', 'ada/demo'],
    ['https://github.com/ada/demo', 'github.com', 'ada/demo'],
    ['https://ada@GitLab.example.com:8443/group/sub/demo.git/', 'gitlab.example.com', 'group/sub/demo'],
    ['git@github.com:ada/demo.git', 'github.com', 'ada/demo'],
    ['github.com-lavoro:ada/demo.git', 'github.com-lavoro', 'ada/demo'],
    ['ssh://git@git.example.com:2222/group/demo.git', 'git.example.com', 'group/demo'],
    ['git+ssh://git@github.com/ada/demo.git', 'github.com', 'ada/demo'],
  ])('%s', (url, host, project) => {
    expect(parseRemoteUrl(url)).toEqual({ host, project })
  })

  it.each(['/srv/git/demo.git', 'C:\\repo\\demo', 'C:/repo/demo', 'file:///srv/git/demo.git', 'https://github.com/ada', 'non è un url'])(
    '%s: nessun server',
    (url) => {
      expect(parseRemoteUrl(url)).toBeNull()
    },
  )
})
```

Run: `npx vitest run test/unit/remote-url.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/main/hosting/remote-url.ts`**

```ts
export interface RemoteLocation {
  /** Nome dell'host in minuscolo, senza porta. */
  host: string
  /** owner/repo, o group/sub/repo su GitLab, senza .git. */
  project: string
}

const NETWORK_PROTOCOLS = ['https:', 'http:', 'ssh:', 'git:', 'git+ssh:', 'ssh+git:']

/** Server e progetto dall'URL di un remote; null per le cartelle locali e per gli URL senza un progetto. */
export function parseRemoteUrl(url: string): RemoteLocation | null {
  const s = url.trim()
  let host: string
  let path: string
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    let u: URL
    try {
      u = new URL(s)
    } catch {
      return null
    }
    if (!NETWORK_PROTOCOLS.includes(u.protocol.toLowerCase())) return null
    host = u.hostname
    path = decodeURIComponent(u.pathname)
  } else {
    // Sintassi scp: [utente@]host:percorso, con il ":" prima di ogni "/" (C:/… e C:\… non lo sono)
    const scp = /^(?:[^@/]+@)?([^:/\\]+):(?!\/)(.+)$/.exec(s)
    if (!scp) return null
    host = scp[1]
    path = scp[2]
  }
  const project = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
  if (!host || project.split('/').filter(Boolean).length < 2) return null
  return { host: host.toLowerCase(), project }
}
```

Run: `npx vitest run test/unit/remote-url.test.ts`
Expected: PASS.

- [ ] **Step 3: Tipi in `src/shared/types.ts`**

In `CommandLogEntry` aggiungi, dopo `stderr: string`:

```ts
  /** Chiamata alle API di GitHub o GitLab: args = [metodo, percorso], exitCode = stato HTTP. */
  api?: boolean
```

In `GitErrorInfo` aggiungi, dopo `message: string`:

```ts
  /** auth: token mancante o non più valido (il renderer offre "Aggiorna token…"). */
  code?: 'auth'
```

In `AppSettings` aggiungi, dopo `defaultTemplates`:

```ts
  /** Account di GitHub e GitLab, senza token (quelli stanno cifrati in tokens.json). */
  accounts: HostingAccount[]
  /** remoteAccountKey(root, remote) → id dell'account scelto dal menu del remote. */
  remoteAccounts: Record<string, string>
```

In fondo al file:

```ts
// --- Pull request e merge request ---

export type HostingService = 'github' | 'gitlab'

export interface HostingAccount {
  id: string
  service: HostingService
  /** github.com, gitlab.com o il server aziendale, con l'eventuale porta. */
  host: string
  username: string
}

/** Dove stanno le PR di un remote, e con quale account (null se nessuno è collegato a quel server). */
export interface HostingTarget {
  host: string
  /** owner/repo, o group/sub/repo su GitLab. */
  project: string
  account: HostingAccount | null
}

export type PullRequestState = 'open' | 'merged' | 'closed'
export type PullRequestFilter = PullRequestState | 'all'

export interface PullRequest {
  number: number
  title: string
  /** Descrizione in Markdown. */
  body: string
  author: string
  state: PullRequestState
  draft: boolean
  head: {
    branch: string
    sha: string
    /** Progetto del fork da cui arriva la PR (vuoto se il servizio non lo dice); null se è lo stesso repo. */
    fork: string | null
  }
  /** sha: la punta del branch di destinazione per il servizio; vuoto se non è noto. */
  base: { branch: string; sha: string }
  /** Secondi dall'epoch. */
  createdAt: number
  updatedAt: number
  /** null: GitHub non lo dà nella lista. */
  comments: number | null
  /** Pagina della PR: https sullo stesso host dell'account, altrimenti vuoto. */
  webUrl: string
}

export type MergeMethod = 'merge' | 'squash' | 'rebase' | 'semiLinear' | 'fastForward'
export type MergeBlock = 'conflicts' | 'checks' | 'approvals' | 'draft' | 'discussions' | 'rebase' | 'notOpen' | 'checking' | 'blocked'

export interface MergeSettings {
  /** GitHub: i metodi permessi dal repo; GitLab: uno solo, quello del progetto. */
  methods: MergeMethod[]
  /** Solo GitLab: la casella "Squash dei commit"; null se il progetto non lo permette. */
  squash: { checked: boolean; locked: boolean } | null
  /** Eliminare il branch dopo il merge, come da impostazione del repo. */
  deleteBranch: boolean
  mergeMessage: string
  squashMessage: string
}

export type TimelineItem =
  | { kind: 'comment'; id: string; author: string; body: string; time: number }
  | { kind: 'commit'; sha: string; subject: string; author: string; time: number }

export interface PullRequestDetail {
  pr: PullRequest
  /** null se il merge si può fare. */
  block: MergeBlock | null
  /** Controlli facoltativi falliti: il merge resta possibile, con un avviso. */
  warning: boolean
  merge: MergeSettings
  /** Commenti e commit in ordine di tempo. */
  timeline: TimelineItem[]
}

export type CheckState = 'success' | 'failure' | 'pending' | 'skipped' | 'cancelled'

export interface Check {
  name: string
  state: CheckState
  url: string | null
}

export interface CiStatus {
  state: 'success' | 'failure' | 'pending' | 'none'
  checks: Check[]
}

export interface MergeRequest {
  method: MergeMethod
  /** Solo GitLab. */
  squash: boolean
  message: string
  deleteBranch: boolean
  /** SHA mostrato all'utente: se la PR è cambiata, il servizio rifiuta. */
  sha: string
}

export interface NewPullRequest {
  /** Remote del repo di destinazione. */
  remote: string
  base: string
  /** Remote che contiene head: diverso da remote per una PR da fork. */
  headRemote: string
  head: string
  title: string
  body: string
  draft: boolean
}

/** Commit e file di una PR, letti con git da merge-base a head. */
export interface PullRequestChanges {
  mergeBase: string
  commits: Commit[]
  files: FileChange[]
}
```

- [ ] **Step 4: `src/shared/hosting.ts`**

```ts
import type { HostingAccount, HostingService, MergeMethod, PullRequestFilter } from './types'

export const HOSTING_SERVICES = ['github', 'gitlab'] as const satisfies readonly HostingService[]
export const PR_FILTERS = ['open', 'merged', 'closed', 'all'] as const satisfies readonly PullRequestFilter[]
export const MERGE_METHODS = ['merge', 'squash', 'rebase', 'semiLinear', 'fastForward'] as const satisfies readonly MergeMethod[]

/** Chiave di AppSettings.remoteAccounts. */
export const remoteAccountKey = (root: string, remote: string): string => `${root}\n${remote}`

/** "ada@github.com"; solo l'host se l'utente non è ancora noto (durante la verifica del token). */
export const accountLabel = (a: Pick<HostingAccount, 'username' | 'host'>): string => (a.username ? `${a.username}@${a.host}` : a.host)
```

- [ ] **Step 5: Default delle impostazioni e test**

In `src/main/settings.ts`, in `DEFAULTS` aggiungi dopo `defaultTemplates: {},`:

```ts
  accounts: [],
  remoteAccounts: {},
```

In `test/unit/settings.test.ts`, nella costante `base` aggiungi `accounts: [], remoteAccounts: {}` dopo `defaultTemplates: {}`, e nel test "file senza preferenze…" aggiungi in fondo:

```ts
    expect(new SettingsStore(f).get().accounts).toEqual([])
    expect(new SettingsStore(f).get().remoteAccounts).toEqual({})
```

Run: `npx vitest run test/unit/settings.test.ts test/unit/remote-url.test.ts && npm run typecheck`
Expected: PASS, typecheck pulito.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/hosting.ts src/main/hosting/remote-url.ts src/main/settings.ts test/unit/remote-url.test.ts test/unit/settings.test.ts
git commit -m "feat: tipi delle pull request, URL dei remote e account nelle impostazioni"
```

---

### Task 2: Client HTTP delle API (`http.ts`)

**Files:**
- Create: `src/main/hosting/http.ts`
- Modify: `src/main/git/runner.ts`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/unit/hosting-http.test.ts`

**Interfaces:**
- Consumes: `HostingAccount`, `CommandLogEntry`, `GitErrorInfo` (Task 1), `accountLabel` (Task 1).
- Produces:
  - `type Fetch = (url: string, init: RequestInit) => Promise<Response>`;
  - `type Log = (entry: CommandLogEntry) => void`;
  - `apiBase(account, env?)`;
  - `class HostingClient { constructor(account, token, fetch, log); request<T>(path, { method?, body? }?): Promise<T>; list<T>(path, max): Promise<T[]> }`.

  Gli errori sono `GitError` con `info.args = [metodo, percorso]` e `info.exitCode = stato HTTP` (`null` se la rete non risponde).
- Produces in `runner.ts`: `newLogId(): number`.

- [ ] **Step 1: Test**

`test/unit/hosting-http.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { apiBase, type Fetch, HostingClient } from '../../src/main/hosting/http'
import type { GitError } from '../../src/main/git/runner'
import type { CommandLogEntry, HostingAccount } from '../../src/shared/types'

const github: HostingAccount = { id: 'a', service: 'github', host: 'github.com', username: 'ada' }
const gitlab: HostingAccount = { id: 'b', service: 'gitlab', host: 'git.example.com', username: 'ada' }

/** fetch finto: restituisce le risposte date, in ordine, e ricorda le richieste. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init })
    const r = responses.shift()
    if (!r) throw new Error('nessuna risposta preparata')
    if (r instanceof Error) throw r
    return r
  }
  return { fetch, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

describe('apiBase', () => {
  it('github.com, GitHub Enterprise, GitLab e il server finto degli E2E', () => {
    expect(apiBase(github, {})).toBe('https://api.github.com')
    expect(apiBase({ service: 'github', host: 'ghe.example.com' }, {})).toBe('https://ghe.example.com/api/v3')
    expect(apiBase(gitlab, {})).toBe('https://git.example.com/api/v4')
    expect(apiBase(gitlab, { MERLINO_E2E: '1', MERLINO_E2E_API: 'http://127.0.0.1:9' })).toBe('http://127.0.0.1:9/gitlab')
    expect(apiBase(gitlab, { MERLINO_E2E_API: 'http://127.0.0.1:9' })).toBe('https://git.example.com/api/v4')
  })
})

describe('HostingClient', () => {
  it('header del servizio, JSON, nessun redirect, una riga nel log senza token', async () => {
    const { fetch, calls } = fakeFetch(json({ login: 'ada' }), json({ id: 1 }))
    const log: CommandLogEntry[] = []
    expect(await new HostingClient(github, 'segreto', fetch, (e) => log.push(e)).request('/user')).toEqual({ login: 'ada' })
    expect(calls[0].url).toBe('https://api.github.com/user')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer segreto')
    expect(calls[0].init.redirect).toBe('error')
    await new HostingClient(gitlab, 'segreto', fetch, () => {}).request('/projects/1/notes', { method: 'POST', body: { body: 'ciao' } })
    expect((calls[1].init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('segreto')
    expect(calls[1].init.method).toBe('POST')
    expect(calls[1].init.body).toBe('{"body":"ciao"}')
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ args: ['GET', '/user'], exitCode: 200, ok: true, api: true, repo: null })
    expect(JSON.stringify(log)).not.toContain('segreto')
  })

  it('risposta senza corpo (204): null', async () => {
    const { fetch } = fakeFetch(new Response(null, { status: 204 }))
    expect(await new HostingClient(github, 't', fetch, () => {}).request('/x', { method: 'DELETE' })).toBeNull()
  })

  it('paginazione: Link di GitHub e x-next-page di GitLab, mai fuori dalla base', async () => {
    const gh = fakeFetch(
      json([1, 2], 200, { link: '<https://api.github.com/repos/a/b/pulls?page=2>; rel="next", <https://api.github.com/repos/a/b/pulls?page=3>; rel="last"' }),
      json([3], 200, { link: '<https://altro.example.com/x?page=3>; rel="next"' }),
    )
    expect(await new HostingClient(github, 't', gh.fetch, () => {}).list('/repos/a/b/pulls?per_page=2', 10)).toEqual([1, 2, 3])
    expect(gh.calls).toHaveLength(2)
    expect(gh.calls[1].url).toBe('https://api.github.com/repos/a/b/pulls?page=2')
    const gl = fakeFetch(json([1], 200, { 'x-next-page': '2' }), json([2], 200, { 'x-next-page': '' }))
    expect(await new HostingClient(gitlab, 't', gl.fetch, () => {}).list('/projects/1/merge_requests?per_page=1', 10)).toEqual([1, 2])
    expect(gl.calls[1].url).toBe('https://git.example.com/api/v4/projects/1/merge_requests?per_page=1&page=2')
  })

  it('max taglia la lista e ferma la paginazione', async () => {
    const { fetch, calls } = fakeFetch(json([1, 2, 3], 200, { 'x-next-page': '2' }))
    expect(await new HostingClient(gitlab, 't', fetch, () => {}).list('/x', 2)).toEqual([1, 2])
    expect(calls).toHaveLength(1)
  })

  it('errori tradotti', async () => {
    const fail = (r: Response | Error, account = github) =>
      new HostingClient(account, 't', fakeFetch(r).fetch, () => {}).request('/x').catch((e: GitError) => e.info)
    expect(await fail(json({ message: 'Bad credentials' }, 401))).toMatchObject({
      code: 'auth',
      exitCode: 401,
      message: 'The token for ada@github.com is no longer valid',
    })
    expect((await fail(json({}, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' }))).message).toMatch(
      /^Request limit reached on github\.com: try again at /,
    )
    expect((await fail(json({}, 429), gitlab)).message).toMatch(/^Request limit reached on git\.example\.com/)
    expect((await fail(json({}, 403), gitlab)).message).toBe('The token does not have the required permissions (it needs api)')
    expect((await fail(json({}, 404))).message).toBe('Repository not found on github.com, or the token cannot see it')
    expect((await fail(json({ message: ['Another open merge request already exists'] }, 409), gitlab)).message).toBe(
      'Another open merge request already exists',
    )
    expect((await fail(json({ message: { title: ['is too long'] } }, 400), gitlab)).message).toBe('title is too long')
    expect((await fail(new Response('boom', { status: 500 }))).message).toBe('github.com answered with error 500')
    expect(await fail(new TypeError('fetch failed'))).toMatchObject({ exitCode: null, message: 'github.com is not responding' })
  })
})
```

Run: `npx vitest run test/unit/hosting-http.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `newLogId` in `src/main/git/runner.ts`**

Sostituisci `let nextLogId = 1` con:

```ts
let nextLogId = 1

/** Id delle righe del pannello Output, comune ai comandi git e alle chiamate alle API. */
export const newLogId = (): number => nextLogId++
```

e in `exec`, nella chiamata a `this.log`, sostituisci `id: nextLogId++` con `id: newLogId()`.

- [ ] **Step 3: Testi**

In `src/shared/i18n/en.ts`, prima di `} as const`:

```ts
  'error.hostingAuth': 'The token for {account} is no longer valid',
  'error.hostingRateLimit': 'Request limit reached on {host}: try again at {time}',
  'error.hostingForbidden': 'The token does not have the required permissions (it needs {scope})',
  'error.hostingNotFound': 'Repository not found on {host}, or the token cannot see it',
  'error.hostingUnreachable': '{host} is not responding',
  'error.hostingFailed': '{host} answered with error {status}',
```

In `src/shared/i18n/it.ts`, prima della `}` finale:

```ts
  'error.hostingAuth': 'Il token di {account} non è più valido',
  'error.hostingRateLimit': 'Limite di richieste raggiunto su {host}: riprova alle {time}',
  'error.hostingForbidden': 'Il token non ha i permessi necessari (serve {scope})',
  'error.hostingNotFound': 'Repository non trovato su {host}, o il token non può vederlo',
  'error.hostingUnreachable': '{host} non risponde',
  'error.hostingFailed': "{host} ha risposto con l'errore {status}",
```

- [ ] **Step 4: `src/main/hosting/http.ts`**

```ts
import { accountLabel } from '../../shared/hosting'
import { dateLocale } from '../../shared/i18n'
import type { CommandLogEntry, GitErrorInfo, HostingAccount } from '../../shared/types'
import { GitError, newLogId } from '../git/runner'
import { language, t } from '../i18n'

export type Fetch = (url: string, init: RequestInit) => Promise<Response>
export type Log = (entry: CommandLogEntry) => void
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const TIMEOUT_MS = 20_000

/** Indirizzo delle API di un account. Negli E2E MERLINO_E2E_API lo sostituisce con un server finto locale. */
export function apiBase(account: Pick<HostingAccount, 'service' | 'host'>, env: NodeJS.ProcessEnv = process.env): string {
  if (env.MERLINO_E2E === '1' && env.MERLINO_E2E_API) return `${env.MERLINO_E2E_API}/${account.service}`
  if (account.service === 'gitlab') return `https://${account.host}/api/v4`
  return account.host === 'github.com' ? 'https://api.github.com' : `https://${account.host}/api/v3`
}

/** Il messaggio d'errore del servizio: message (testo, lista o oggetto di campi) o error. */
function apiMessage(text: string): string {
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown }
    const m = body.message ?? body.error
    if (typeof m === 'string') return m
    if (Array.isArray(m)) return m.join(', ')
    if (m && typeof m === 'object') {
      return Object.entries(m)
        .map(([field, v]) => `${field} ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join('; ')
    }
  } catch {
    // corpo non JSON: si usa il messaggio generico
  }
  return ''
}

/** Chiamate JSON alle API di un account. Il token va solo all'indirizzo dell'account: niente redirect, niente pagine fuori dalla base. */
export class HostingClient {
  private readonly base: string

  constructor(
    private readonly account: HostingAccount,
    private readonly token: string,
    private readonly fetch: Fetch,
    private readonly log: Log,
  ) {
    this.base = apiBase(account)
  }

  /** null per le risposte senza corpo (204). */
  async request<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
    return (await this.send<T>(`${this.base}${path}`, options.method ?? 'GET', options.body)).data
  }

  /** Tutte le pagine di una lista, fino a max elementi. */
  async list<T>(path: string, max: number): Promise<T[]> {
    const items: T[] = []
    let next: string | null = `${this.base}${path}`
    while (next !== null && items.length < max) {
      const page: { data: T[]; next: string | null } = await this.send<T[]>(next, 'GET')
      items.push(...page.data)
      next = page.next
    }
    return items.slice(0, max)
  }

  private headers(json: boolean): Record<string, string> {
    const auth: Record<string, string> =
      this.account.service === 'github'
        ? { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
        : { 'PRIVATE-TOKEN': this.token, Accept: 'application/json' }
    return { ...auth, 'User-Agent': 'Merlino', ...(json ? { 'Content-Type': 'application/json' } : {}) }
  }

  private async send<T>(url: string, method: Method, body?: unknown): Promise<{ data: T; next: string | null }> {
    const path = url.slice(this.base.length)
    const startedAt = Date.now()
    let response: Response
    let text: string
    try {
      response = await this.fetch(url, {
        method,
        headers: this.headers(body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      text = await response.text()
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      this.record(method, path, startedAt, null, detail)
      throw this.error(method, path, null, detail, t('error.hostingUnreachable', { host: this.account.host }))
    }
    this.record(method, path, startedAt, response.status, response.ok ? '' : text)
    if (!response.ok) throw this.failure(method, path, response, text)
    return { data: (text ? JSON.parse(text) : null) as T, next: this.nextPage(url, response) }
  }

  /** Pagina successiva: header Link di GitHub (rel="next") o x-next-page di GitLab; mai fuori dalla base. */
  private nextPage(url: string, response: Response): string | null {
    const link = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1]
    const page = response.headers.get('x-next-page')
    let next: string | null = link ?? null
    if (!next && page) {
      const u = new URL(url)
      u.searchParams.set('page', page)
      next = u.toString()
    }
    return next?.startsWith(`${this.base}/`) ? next : null
  }

  private record(method: Method, path: string, startedAt: number, status: number | null, stderr: string): void {
    this.log({
      id: newLogId(),
      repo: null,
      args: [method, path],
      startedAt,
      durationMs: Date.now() - startedAt,
      exitCode: status,
      ok: status !== null && status < 400,
      stderr: stderr.slice(0, 2000),
      api: true,
    })
  }

  private failure(method: Method, path: string, response: Response, text: string): GitError {
    const { host, service } = this.account
    const status = response.status
    const remaining = response.headers.get('x-ratelimit-remaining') ?? response.headers.get('ratelimit-remaining')
    const reset = Number(response.headers.get('x-ratelimit-reset') ?? response.headers.get('ratelimit-reset'))
    if (status === 401) return this.error(method, path, status, text, t('error.hostingAuth', { account: accountLabel(this.account) }), 'auth')
    if (status === 429 || (status === 403 && remaining === '0')) {
      const time = reset ? new Date(reset * 1000).toLocaleTimeString(dateLocale(language()), { hour: '2-digit', minute: '2-digit' }) : '?'
      return this.error(method, path, status, text, t('error.hostingRateLimit', { host, time }))
    }
    if (status === 403) return this.error(method, path, status, text, t('error.hostingForbidden', { scope: service === 'github' ? 'repo' : 'api' }))
    if (status === 404) return this.error(method, path, status, text, t('error.hostingNotFound', { host }))
    return this.error(method, path, status, text, apiMessage(text) || t('error.hostingFailed', { host, status }))
  }

  private error(method: Method, path: string, status: number | null, stderr: string, message: string, code?: GitErrorInfo['code']): GitError {
    return new GitError({ args: [method, path], exitCode: status, stderr: stderr.slice(0, 2000), message, ...(code ? { code } : {}) })
  }
}
```

Run: `npx vitest run test/unit/hosting-http.test.ts test/unit/i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/hosting/http.ts src/main/git/runner.ts src/shared/i18n/en.ts src/shared/i18n/it.ts test/unit/hosting-http.test.ts
git commit -m "feat: client delle API di GitHub e GitLab con errori tradotti e log"
```

---

### Task 3: Interfaccia dei provider e provider GitHub

**Files:**
- Create: `src/main/hosting/provider.ts`, `src/main/hosting/github.ts`, `test/helpers/fake-api.ts`
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/unit/github.test.ts`

**Interfaces:**
- Consumes: `HostingClient` (Task 2), tipi del Task 1.
- Produces:
  - `interface HostingProvider` con questi metodi:
    - `verify(): Promise<string>`;
    - `defaultBranch(project): Promise<string>`;
    - `list(project, filter): Promise<PullRequest[]>`;
    - `detail(project, number): Promise<PullRequestDetail>`;
    - `checks(project, number, sha): Promise<CiStatus>`;
    - `comment(project, number, body): Promise<void>`;
    - `merge(project, number, request: MergeRequest): Promise<void>`;
    - `setState(project, number, 'open' | 'closed'): Promise<void>`;
    - `create(project, input: PullRequestCreate): Promise<number>`.
  - `interface PullRequestCreate { base; head; headProject: string | null; title; body; draft }`.
  - Funzioni di supporto: `ciSummary(checks)`, `seconds(iso)`, `safeWebUrl(url, host)`, `byTime(items)`, `mergeError(e)`.
  - `class GitHub implements HostingProvider { constructor(api: HostingClient, host: string) }`.
  - `fakeApi(base, routes)` e `reply(status, body?, headers?)` in `test/helpers/fake-api.ts`.

- [ ] **Step 1: `test/helpers/fake-api.ts`**

```ts
import type { Fetch } from '../../src/main/hosting/http'

export interface ApiCall {
  method: string
  /** Percorso relativo alla base delle API, con la query. */
  path: string
  body: unknown
}

/** Risposta con uno stato diverso da 200 (204: senza corpo). */
export const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) => ({ reply: true as const, status, body, headers })
type Reply = ReturnType<typeof reply>

/** fetch finto per i provider: risponde secondo "METODO /percorso?query"; 404 per tutto il resto. */
export function fakeApi(base: string, routes: Record<string, unknown>): { fetch: Fetch; calls: ApiCall[] } {
  const calls: ApiCall[] = []
  const fetch: Fetch = async (url, init) => {
    const path = url.slice(base.length)
    const method = init.method ?? 'GET'
    calls.push({ method, path, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    const route = routes[`${method} ${path}`]
    if (route === undefined) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
    const r: Reply = typeof route === 'object' && route !== null && 'reply' in route ? (route as Reply) : reply(200, route)
    return new Response(r.status === 204 || r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers })
  }
  return { fetch, calls }
}
```

- [ ] **Step 2: Test del provider GitHub**

`test/unit/github.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GitHub } from '../../src/main/hosting/github'
import { HostingClient } from '../../src/main/hosting/http'
import type { HostingAccount } from '../../src/shared/types'
import { fakeApi, reply } from '../helpers/fake-api'

const account: HostingAccount = { id: 'a', service: 'github', host: 'github.com', username: 'ada' }
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const LIST = 'state=open&sort=updated&direction=desc&per_page=100'

const pull = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `PR ${n}`,
  body: 'descrizione',
  state: 'open',
  draft: false,
  merged_at: null,
  user: { login: 'grace' },
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  html_url: `https://github.com/ada/demo/pull/${n}`,
  head: { ref: 'feature/login', sha: A, repo: { full_name: 'ada/demo' } },
  base: { ref: 'main', sha: B, repo: { full_name: 'ada/demo' } },
  ...extra,
})

function github(routes: Record<string, unknown>) {
  const api = fakeApi('https://api.github.com', routes)
  return { gh: new GitHub(new HostingClient(account, 't', api.fetch, () => {}), 'github.com'), calls: api.calls }
}

describe('GitHub', () => {
  it('utente e branch principale', async () => {
    const { gh } = github({ 'GET /user': { login: 'ada' }, 'GET /repos/ada/demo': { default_branch: 'trunk' } })
    expect(await gh.verify()).toBe('ada')
    expect(await gh.defaultBranch('ada/demo')).toBe('trunk')
  })

  it('lista: campi, bozza, fork e URL sicuri', async () => {
    const { gh } = github({
      [`GET /repos/ada/demo/pulls?${LIST}`]: [
        pull(1),
        pull(2, { draft: true, head: { ref: 'fix', sha: B, repo: { full_name: 'grace/demo' } }, html_url: 'http://evil.example.com/x' }),
        pull(3, { head: { ref: 'old', sha: B, repo: null } }),
      ],
    })
    const list = await gh.list('ada/demo', 'open')
    expect(list[0]).toEqual({
      number: 1,
      title: 'PR 1',
      body: 'descrizione',
      author: 'grace',
      state: 'open',
      draft: false,
      head: { branch: 'feature/login', sha: A, fork: null },
      base: { branch: 'main', sha: B },
      createdAt: Date.parse('2026-10-01T10:00:00Z') / 1000,
      updatedAt: Date.parse('2026-10-02T10:00:00Z') / 1000,
      comments: null,
      webUrl: 'https://github.com/ada/demo/pull/1',
    })
    expect(list[1]).toMatchObject({ draft: true, head: { fork: 'grace/demo' }, webUrl: '' })
    expect(list[2].head.fork).toBe('')
  })

  it('unite e chiuse: state=closed, separate da merged_at', async () => {
    const closed = [pull(4, { state: 'closed', merged_at: '2026-10-03T10:00:00Z' }), pull(5, { state: 'closed' })]
    const { gh } = github({ 'GET /repos/ada/demo/pulls?state=closed&sort=updated&direction=desc&per_page=100': closed })
    expect((await gh.list('ada/demo', 'merged')).map((p) => [p.number, p.state])).toEqual([[4, 'merged']])
    expect((await gh.list('ada/demo', 'closed')).map((p) => [p.number, p.state])).toEqual([[5, 'closed']])
  })

  it('dettaglio: metodi del repo, motivo del blocco, messaggi e timeline in ordine', async () => {
    const { gh } = github({
      'GET /repos/ada/demo/pulls/1': pull(1, { mergeable: false, mergeable_state: 'dirty', comments: 1 }),
      'GET /repos/ada/demo': { default_branch: 'main', allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false, delete_branch_on_merge: true },
      'GET /repos/ada/demo/issues/1/comments?per_page=100': [{ id: 9, user: { login: 'ada' }, body: 'Bene', created_at: '2026-10-02T12:00:00Z' }],
      'GET /repos/ada/demo/pulls/1/commits?per_page=100': [
        { sha: A, commit: { message: 'feat: login\n\ncorpo', author: { name: 'Grace Hopper', date: '2026-10-01T11:00:00Z' } }, author: { login: 'grace' } },
      ],
    })
    const d = await gh.detail('ada/demo', 1)
    expect(d.pr.comments).toBe(1)
    expect(d.block).toBe('conflicts')
    expect(d.warning).toBe(false)
    expect(d.merge).toEqual({
      methods: ['merge', 'squash'],
      squash: null,
      deleteBranch: true,
      mergeMessage: 'Merge pull request #1 from ada/feature/login\n\nPR 1',
      squashMessage: 'PR 1 (#1)',
    })
    expect(d.timeline).toEqual([
      { kind: 'commit', sha: A, subject: 'feat: login', author: 'grace', time: Date.parse('2026-10-01T11:00:00Z') / 1000 },
      { kind: 'comment', id: '9', author: 'ada', body: 'Bene', time: Date.parse('2026-10-02T12:00:00Z') / 1000 },
    ])
  })

  it('motivi del blocco', async () => {
    const block = async (extra: Record<string, unknown>) => {
      const { gh } = github({
        'GET /repos/ada/demo/pulls/1': pull(1, extra),
        'GET /repos/ada/demo': { default_branch: 'main' },
        'GET /repos/ada/demo/issues/1/comments?per_page=100': [],
        'GET /repos/ada/demo/pulls/1/commits?per_page=100': [],
      })
      const d = await gh.detail('ada/demo', 1)
      return [d.block, d.warning, d.merge.methods.length]
    }
    expect(await block({ mergeable_state: 'clean', mergeable: true })).toEqual([null, false, 3])
    expect(await block({ mergeable_state: 'unstable', mergeable: true })).toEqual([null, true, 3])
    expect(await block({ mergeable_state: 'blocked' })).toEqual(['blocked', false, 3])
    expect(await block({ mergeable_state: 'behind' })).toEqual(['rebase', false, 3])
    expect(await block({ mergeable_state: 'unknown', mergeable: null })).toEqual(['checking', false, 3])
    expect(await block({ draft: true, mergeable_state: 'draft' })).toEqual(['draft', false, 3])
    expect(await block({ state: 'closed' })).toEqual(['notOpen', false, 3])
  })

  it('CI: stati combinati e check run nello stesso riepilogo', async () => {
    const { gh } = github({
      [`GET /repos/ada/demo/commits/${A}/status`]: { state: 'success', statuses: [{ context: 'jenkins', state: 'success', target_url: 'https://ci.example.com/1' }] },
      [`GET /repos/ada/demo/commits/${A}/check-runs?per_page=100`]: {
        check_runs: [
          { name: 'test', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/ada/demo/runs/1' },
          { name: 'lint', status: 'in_progress', conclusion: null, html_url: null },
          { name: 'docs', status: 'completed', conclusion: 'skipped', html_url: null },
        ],
      },
    })
    expect(await gh.checks('ada/demo', 1, A)).toEqual({
      state: 'failure',
      checks: [
        { name: 'jenkins', state: 'success', url: 'https://ci.example.com/1' },
        { name: 'test', state: 'failure', url: 'https://github.com/ada/demo/runs/1' },
        { name: 'lint', state: 'pending', url: null },
        { name: 'docs', state: 'skipped', url: null },
      ],
    })
  })

  it('commento, chiusura, riapertura', async () => {
    const { gh, calls } = github({
      'POST /repos/ada/demo/issues/1/comments': { id: 1 },
      'PATCH /repos/ada/demo/pulls/1': pull(1),
    })
    await gh.comment('ada/demo', 1, 'Grazie!')
    await gh.setState('ada/demo', 1, 'closed')
    await gh.setState('ada/demo', 1, 'open')
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/repos/ada/demo/issues/1/comments', { body: 'Grazie!' }],
      ['PATCH', '/repos/ada/demo/pulls/1', { state: 'closed' }],
      ['PATCH', '/repos/ada/demo/pulls/1', { state: 'open' }],
    ])
  })

  it('merge: metodo, SHA e messaggio; il branch si elimina solo se è dello stesso repo', async () => {
    const routes = {
      'GET /repos/ada/demo/pulls/1': pull(1),
      'GET /repos/ada/demo/pulls/2': pull(2, { head: { ref: 'fix', sha: B, repo: { full_name: 'grace/demo' } } }),
      'PUT /repos/ada/demo/pulls/1/merge': { merged: true },
      'PUT /repos/ada/demo/pulls/2/merge': { merged: true },
      'DELETE /repos/ada/demo/git/refs/heads/feature/login': reply(204),
    }
    const { gh, calls } = github(routes)
    await gh.merge('ada/demo', 1, { method: 'squash', squash: false, message: 'PR 1 (#1)\n\n* feat: login', deleteBranch: true, sha: A })
    expect(calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.path, c.body])).toEqual([
      ['PUT', '/repos/ada/demo/pulls/1/merge', { merge_method: 'squash', sha: A, commit_title: 'PR 1 (#1)', commit_message: '* feat: login' }],
      ['DELETE', '/repos/ada/demo/git/refs/heads/feature/login', undefined],
    ])
    const other = github(routes)
    await other.gh.merge('ada/demo', 2, { method: 'rebase', squash: false, message: '', deleteBranch: true, sha: B })
    expect(other.calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.path, c.body])).toEqual([
      ['PUT', '/repos/ada/demo/pulls/2/merge', { merge_method: 'rebase', sha: B }],
    ])
  })

  it('merge rifiutato: PR cambiata (409) o non ammesso (405)', async () => {
    const request = { method: 'merge', squash: false, message: 'm', deleteBranch: false, sha: A } as const
    const { gh } = github({ 'PUT /repos/ada/demo/pulls/1/merge': reply(409, { message: 'Head branch was modified' }) })
    await expect(gh.merge('ada/demo', 1, request)).rejects.toThrow('The pull request has changed in the meantime: reload it and try again')
    const refused = github({ 'PUT /repos/ada/demo/pulls/1/merge': reply(405, { message: 'Pull Request is not mergeable' }) })
    await expect(refused.gh.merge('ada/demo', 1, request)).rejects.toThrow('The merge was refused: Pull Request is not mergeable')
  })

  it('creazione: bozza e head owner:branch per un fork', async () => {
    const { gh, calls } = github({ 'POST /repos/ada/demo/pulls': pull(7) })
    expect(await gh.create('ada/demo', { base: 'main', head: 'feature/x', headProject: null, title: 'T', body: 'B', draft: true })).toBe(7)
    await gh.create('ada/demo', { base: 'main', head: 'fix', headProject: 'grace/demo', title: 'T', body: '', draft: false })
    expect(calls.map((c) => c.body)).toEqual([
      { title: 'T', body: 'B', head: 'feature/x', base: 'main', draft: true },
      { title: 'T', body: '', head: 'grace:fix', base: 'main', draft: false },
    ])
  })
})
```

Run: `npx vitest run test/unit/github.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 3: Testi**

`en.ts`:

```ts
  'error.prChanged': 'The pull request has changed in the meantime: reload it and try again',
  'error.prNotMergeable': 'The merge was refused: {reason}',
```

`it.ts`:

```ts
  'error.prChanged': 'La pull request è cambiata nel frattempo: ricaricala e riprova',
  'error.prNotMergeable': 'Il merge è stato rifiutato: {reason}',
```

- [ ] **Step 4: `src/main/hosting/provider.ts`**

```ts
import type { Check, CiStatus, MergeRequest, PullRequest, PullRequestDetail, PullRequestFilter, TimelineItem } from '../../shared/types'
import { GitError } from '../git/runner'
import { t } from '../i18n'

/** Nuova PR. headProject: il progetto del fork che contiene head; null se è lo stesso repo. */
export interface PullRequestCreate {
  base: string
  head: string
  headProject: string | null
  title: string
  body: string
  draft: boolean
}

/** Le operazioni comuni a GitHub e GitLab. project: owner/repo, o group/sub/repo su GitLab. */
export interface HostingProvider {
  /** Nome dell'utente del token (GET /user). */
  verify(): Promise<string>
  defaultBranch(project: string): Promise<string>
  list(project: string, filter: PullRequestFilter): Promise<PullRequest[]>
  detail(project: string, number: number): Promise<PullRequestDetail>
  checks(project: string, number: number, sha: string): Promise<CiStatus>
  comment(project: string, number: number, body: string): Promise<void>
  merge(project: string, number: number, request: MergeRequest): Promise<void>
  setState(project: string, number: number, state: 'open' | 'closed'): Promise<void>
  /** Restituisce il numero della nuova PR. */
  create(project: string, input: PullRequestCreate): Promise<number>
}

/** Fallito se un check è fallito, in corso se uno gira, superato se ci sono check; altrimenti nessuno. */
export function ciSummary(checks: Check[]): CiStatus {
  const state = checks.some((c) => c.state === 'failure')
    ? 'failure'
    : checks.some((c) => c.state === 'pending')
      ? 'pending'
      : checks.length
        ? 'success'
        : 'none'
  return { state, checks }
}

/** Secondi dall'epoch da una data ISO; 0 se manca. */
export const seconds = (iso: string | null | undefined): number => (iso ? Math.floor(Date.parse(iso) / 1000) : 0)

/** L'URL di una pagina del servizio solo se è https sullo stesso host dell'account; altrimenti vuoto. */
export function safeWebUrl(url: string | null | undefined, host: string): string {
  try {
    const u = new URL(url ?? '')
    return u.protocol === 'https:' && u.host === host.toLowerCase() ? u.toString() : ''
  } catch {
    return ''
  }
}

export const byTime = (items: TimelineItem[]): TimelineItem[] => items.sort((a, b) => a.time - b.time)

/** Merge rifiutato: 409 vuol dire che la PR è cambiata rispetto allo SHA mostrato; 405 e 422 che il servizio non lo permette. */
export function mergeError(e: unknown): unknown {
  if (!(e instanceof GitError)) return e
  if (e.info.exitCode === 409) return new GitError({ ...e.info, message: t('error.prChanged') })
  if (e.info.exitCode === 405 || e.info.exitCode === 422) return new GitError({ ...e.info, message: t('error.prNotMergeable', { reason: e.info.message }) })
  return e
}
```

- [ ] **Step 5: `src/main/hosting/github.ts`**

```ts
import type { CheckState, CiStatus, MergeBlock, MergeRequest, PullRequest, PullRequestDetail, PullRequestFilter } from '../../shared/types'
import type { HostingClient } from './http'
import { byTime, ciSummary, type HostingProvider, mergeError, type PullRequestCreate, safeWebUrl, seconds } from './provider'

interface GhUser {
  login: string
}

interface GhPull {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  draft?: boolean
  merged_at: string | null
  user: GhUser | null
  created_at: string
  updated_at: string
  html_url: string
  head: { ref: string; sha: string; repo: { full_name: string } | null }
  base: { ref: string; sha: string }
  /** Solo nel dettaglio. */
  comments?: number
  mergeable?: boolean | null
  mergeable_state?: string
}

interface GhRepo {
  default_branch: string
  /** Assenti se il token non può scrivere nel repo: si considerano permessi. */
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
  delete_branch_on_merge?: boolean
}

interface GhComment {
  id: number
  user: GhUser | null
  body: string | null
  created_at: string
}

interface GhCommit {
  sha: string
  commit: { message: string; author: { name: string; date: string } | null }
  author: GhUser | null
}

interface GhStatus {
  statuses: { context: string; state: string; target_url: string | null }[]
}

interface GhCheckRuns {
  check_runs: { name: string; status: string; conclusion: string | null; html_url: string | null }[]
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
const repoPath = (project: string) => `/repos/${encodePath(project)}`
const sameRepo = (p: GhPull, project: string) => p.head.repo?.full_name.toLowerCase() === project.toLowerCase()

function statusState(state: string): CheckState {
  return state === 'success' ? 'success' : state === 'pending' ? 'pending' : 'failure'
}

function runState(status: string, conclusion: string | null): CheckState {
  if (status !== 'completed') return 'pending'
  if (conclusion === 'success' || conclusion === 'neutral') return 'success'
  if (conclusion === 'skipped') return 'skipped'
  if (conclusion === 'cancelled' || conclusion === 'stale') return 'cancelled'
  return 'failure'
}

function block(p: GhPull): MergeBlock | null {
  if (p.state !== 'open' || p.merged_at) return 'notOpen'
  if (p.draft) return 'draft'
  switch (p.mergeable_state) {
    case 'dirty':
      return 'conflicts'
    case 'behind':
      return 'rebase'
    case 'blocked':
      return 'blocked'
    case 'draft':
      return 'draft'
    case 'unknown':
      return 'checking'
    default:
      return p.mergeable === null ? 'checking' : null
  }
}

export class GitHub implements HostingProvider {
  constructor(
    private readonly api: HostingClient,
    private readonly host: string,
  ) {}

  async verify(): Promise<string> {
    return (await this.api.request<GhUser>('/user')).login
  }

  async defaultBranch(project: string): Promise<string> {
    return (await this.api.request<GhRepo>(repoPath(project))).default_branch
  }

  async list(project: string, filter: PullRequestFilter): Promise<PullRequest[]> {
    // GitHub non ha lo stato "merged": le PR unite stanno fra le chiuse, con merged_at
    const state = filter === 'open' || filter === 'all' ? filter : 'closed'
    const pulls = await this.api.list<GhPull>(`${repoPath(project)}/pulls?state=${state}&sort=updated&direction=desc&per_page=100`, filter === 'open' ? 500 : 100)
    return pulls.map((p) => this.pull(p, project)).filter((p) => filter === 'all' || p.state === filter)
  }

  private pull(p: GhPull, project: string): PullRequest {
    return {
      number: p.number,
      title: p.title,
      body: p.body ?? '',
      author: p.user?.login ?? '',
      state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
      draft: p.draft === true,
      // Il repo del fork può non esserci più (repo: null): resta un fork, senza nome
      head: { branch: p.head.ref, sha: p.head.sha, fork: sameRepo(p, project) ? null : (p.head.repo?.full_name ?? '') },
      base: { branch: p.base.ref, sha: p.base.sha },
      createdAt: seconds(p.created_at),
      updatedAt: seconds(p.updated_at),
      comments: p.comments ?? null,
      webUrl: safeWebUrl(p.html_url, this.host),
    }
  }

  async detail(project: string, number: number): Promise<PullRequestDetail> {
    const base = repoPath(project)
    const [p, repo, comments, commits] = await Promise.all([
      this.api.request<GhPull>(`${base}/pulls/${number}`),
      this.api.request<GhRepo>(base),
      this.api.list<GhComment>(`${base}/issues/${number}/comments?per_page=100`, 1000),
      this.api.list<GhCommit>(`${base}/pulls/${number}/commits?per_page=100`, 250),
    ])
    const pr = this.pull(p, project)
    const allowed: [MergeRequest['method'], boolean | undefined][] = [
      ['merge', repo.allow_merge_commit],
      ['squash', repo.allow_squash_merge],
      ['rebase', repo.allow_rebase_merge],
    ]
    const owner = (pr.head.fork || project).split('/')[0]
    return {
      pr,
      block: block(p),
      warning: p.mergeable_state === 'unstable',
      merge: {
        methods: allowed.filter(([, ok]) => ok !== false).map(([method]) => method),
        squash: null,
        deleteBranch: repo.delete_branch_on_merge === true,
        mergeMessage: `Merge pull request #${number} from ${owner}/${pr.head.branch}\n\n${p.title}`,
        squashMessage: `${p.title} (#${number})`,
      },
      timeline: byTime([
        ...comments.map((c) => ({ kind: 'comment' as const, id: String(c.id), author: c.user?.login ?? '', body: c.body ?? '', time: seconds(c.created_at) })),
        ...commits.map((c) => ({
          kind: 'commit' as const,
          sha: c.sha,
          subject: c.commit.message.split('\n')[0],
          author: c.author?.login ?? c.commit.author?.name ?? '',
          time: seconds(c.commit.author?.date),
        })),
      ]),
    }
  }

  async checks(project: string, _number: number, sha: string): Promise<CiStatus> {
    const base = `${repoPath(project)}/commits/${sha}`
    const [status, runs] = await Promise.all([
      this.api.request<GhStatus>(`${base}/status`),
      this.api.request<GhCheckRuns>(`${base}/check-runs?per_page=100`),
    ])
    return ciSummary([
      ...status.statuses.map((s) => ({ name: s.context, state: statusState(s.state), url: s.target_url })),
      ...runs.check_runs.map((r) => ({ name: r.name, state: runState(r.status, r.conclusion), url: r.html_url })),
    ])
  }

  async comment(project: string, number: number, body: string): Promise<void> {
    await this.api.request(`${repoPath(project)}/issues/${number}/comments`, { method: 'POST', body: { body } })
  }

  async merge(project: string, number: number, r: MergeRequest): Promise<void> {
    const base = repoPath(project)
    const pull = r.deleteBranch ? await this.api.request<GhPull>(`${base}/pulls/${number}`) : null
    const method = r.method === 'squash' || r.method === 'rebase' ? r.method : 'merge'
    const [title = '', ...rest] = r.message.split('\n')
    const text = method === 'rebase' ? {} : { commit_title: title.trim(), commit_message: rest.join('\n').trim() }
    try {
      await this.api.request(`${base}/pulls/${number}/merge`, { method: 'PUT', body: { merge_method: method, sha: r.sha, ...text } })
    } catch (e) {
      throw mergeError(e)
    }
    // Il branch di un fork non è nostro: si elimina solo quello dello stesso repo
    if (pull && sameRepo(pull, project)) await this.api.request(`${base}/git/refs/heads/${encodePath(pull.head.ref)}`, { method: 'DELETE' })
  }

  async setState(project: string, number: number, state: 'open' | 'closed'): Promise<void> {
    await this.api.request(`${repoPath(project)}/pulls/${number}`, { method: 'PATCH', body: { state } })
  }

  async create(project: string, input: PullRequestCreate): Promise<number> {
    const head = input.headProject ? `${input.headProject.split('/')[0]}:${input.head}` : input.head
    const body = { title: input.title, body: input.body, head, base: input.base, draft: input.draft }
    return (await this.api.request<GhPull>(`${repoPath(project)}/pulls`, { method: 'POST', body })).number
  }
}
```

Run: `npx vitest run test/unit/github.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/hosting/provider.ts src/main/hosting/github.ts test/helpers/fake-api.ts test/unit/github.test.ts src/shared/i18n/en.ts src/shared/i18n/it.ts
git commit -m "feat: provider GitHub per le pull request"
```

---

### Task 4: Provider GitLab

**Files:**
- Create: `src/main/hosting/gitlab.ts`
- Test: `test/unit/gitlab.test.ts`

**Interfaces:**
- Consumes: `HostingProvider`, `PullRequestCreate`, `ciSummary`, `seconds`, `safeWebUrl`, `byTime`, `mergeError` (Task 3), `HostingClient` (Task 2), `fakeApi`, `reply` (Task 3).
- Produces: `class GitLab implements HostingProvider { constructor(api: HostingClient, host: string) }`.

- [ ] **Step 1: Test**

`test/unit/gitlab.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GitLab } from '../../src/main/hosting/gitlab'
import { HostingClient } from '../../src/main/hosting/http'
import type { HostingAccount } from '../../src/shared/types'
import { fakeApi, reply } from '../helpers/fake-api'

const account: HostingAccount = { id: 'b', service: 'gitlab', host: 'git.example.com', username: 'ada' }
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const P = '/projects/group%2Fdemo'

const mr = (iid: number, extra: Record<string, unknown> = {}) => ({
  iid,
  title: `MR ${iid}`,
  description: 'descrizione',
  state: 'opened',
  draft: false,
  author: { username: 'grace' },
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  web_url: `https://git.example.com/group/demo/-/merge_requests/${iid}`,
  source_branch: 'feature/login',
  target_branch: 'main',
  sha: A,
  source_project_id: 7,
  target_project_id: 7,
  user_notes_count: 3,
  ...extra,
})

const project = { id: 7, default_branch: 'main', merge_method: 'merge', squash_option: 'default_off', remove_source_branch_after_merge: true, path_with_namespace: 'group/demo' }

function gitlab(routes: Record<string, unknown>) {
  const api = fakeApi('https://git.example.com/api/v4', routes)
  return { gl: new GitLab(new HostingClient(account, 't', api.fetch, () => {}), 'git.example.com'), calls: api.calls }
}

const detailRoutes = (extraMr: Record<string, unknown> = {}, extraProject: Record<string, unknown> = {}) => ({
  [`GET ${P}/merge_requests/1`]: mr(1, { diff_refs: { base_sha: B, head_sha: A, start_sha: B }, ...extraMr }),
  [`GET ${P}`]: { ...project, ...extraProject },
  [`GET ${P}/merge_requests/1/notes?sort=asc&order_by=created_at&per_page=100`]: [
    { id: 5, body: 'added 1 commit', author: { username: 'grace' }, created_at: '2026-10-01T12:00:00Z', system: true },
    { id: 6, body: 'Bene', author: { username: 'ada' }, created_at: '2026-10-02T12:00:00Z', system: false },
  ],
  [`GET ${P}/merge_requests/1/commits?per_page=100`]: [{ id: A, title: 'feat: login', author_name: 'Grace Hopper', created_at: '2026-10-01T11:00:00Z' }],
})

describe('GitLab', () => {
  it('utente e branch principale', async () => {
    const { gl } = gitlab({ 'GET /user': { username: 'ada' }, [`GET ${P}`]: project })
    expect(await gl.verify()).toBe('ada')
    expect(await gl.defaultBranch('group/demo')).toBe('main')
  })

  it('lista: stati di GitLab, bozza, fork senza nome e commenti', async () => {
    const { gl, calls } = gitlab({
      [`GET ${P}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=100`]: [mr(1), mr(2, { draft: true, source_project_id: 9 })],
      [`GET ${P}/merge_requests?state=merged&order_by=updated_at&sort=desc&per_page=100`]: [mr(3, { state: 'merged' })],
    })
    const list = await gl.list('group/demo', 'open')
    expect(list[0]).toEqual({
      number: 1,
      title: 'MR 1',
      body: 'descrizione',
      author: 'grace',
      state: 'open',
      draft: false,
      head: { branch: 'feature/login', sha: A, fork: null },
      base: { branch: 'main', sha: '' },
      createdAt: Date.parse('2026-10-01T10:00:00Z') / 1000,
      updatedAt: Date.parse('2026-10-02T10:00:00Z') / 1000,
      comments: 3,
      webUrl: 'https://git.example.com/group/demo/-/merge_requests/1',
    })
    expect(list[1]).toMatchObject({ draft: true, head: { fork: '' } })
    expect((await gl.list('group/demo', 'merged'))[0].state).toBe('merged')
    expect(calls).toHaveLength(2)
  })

  it('dettaglio: metodo del progetto, squash, messaggi, note di sistema escluse', async () => {
    const { gl } = gitlab(detailRoutes({ detailed_merge_status: 'mergeable' }, { merge_method: 'rebase_merge', squash_option: 'default_on' }))
    const d = await gl.detail('group/demo', 1)
    expect(d.pr.base).toEqual({ branch: 'main', sha: B })
    expect(d.block).toBeNull()
    expect(d.merge).toEqual({
      methods: ['semiLinear'],
      squash: { checked: true, locked: false },
      deleteBranch: true,
      mergeMessage: "Merge branch 'feature/login' into 'main'\n\nMR 1\n\nSee merge request group/demo!1",
      squashMessage: 'MR 1',
    })
    expect(d.timeline.map((i) => i.kind)).toEqual(['commit', 'comment'])
  })

  it('fork: nome del progetto sorgente nel dettaglio', async () => {
    const { gl } = gitlab({ ...detailRoutes({ source_project_id: 9 }), 'GET /projects/9': { id: 9, path_with_namespace: 'grace/demo' } })
    expect((await gl.detail('group/demo', 1)).pr.head.fork).toBe('grace/demo')
  })

  it('motivi del blocco e avviso', async () => {
    const block = async (extra: Record<string, unknown>) => {
      const d = await gitlab(detailRoutes(extra)).gl.detail('group/demo', 1)
      return [d.block, d.warning]
    }
    expect(await block({ detailed_merge_status: 'conflict' })).toEqual(['conflicts', false])
    expect(await block({ detailed_merge_status: 'ci_must_pass' })).toEqual(['checks', false])
    expect(await block({ detailed_merge_status: 'not_approved' })).toEqual(['approvals', false])
    expect(await block({ detailed_merge_status: 'draft_status' })).toEqual(['draft', false])
    expect(await block({ detailed_merge_status: 'discussions_not_resolved' })).toEqual(['discussions', false])
    expect(await block({ detailed_merge_status: 'need_rebase' })).toEqual(['rebase', false])
    expect(await block({ detailed_merge_status: 'checking' })).toEqual(['checking', false])
    expect(await block({ detailed_merge_status: 'jira_association_missing' })).toEqual(['blocked', false])
    expect(await block({ state: 'merged' })).toEqual(['notOpen', false])
    expect(await block({ detailed_merge_status: 'mergeable', head_pipeline: { id: 1, project_id: 7, status: 'failed', web_url: '' } })).toEqual([null, true])
  })

  it('squash: never → nessuna casella; always → bloccata', async () => {
    expect((await gitlab(detailRoutes({}, { squash_option: 'never' })).gl.detail('group/demo', 1)).merge.squash).toBeNull()
    expect((await gitlab(detailRoutes({}, { squash_option: 'always', merge_method: 'ff' })).gl.detail('group/demo', 1)).merge).toMatchObject({
      methods: ['fastForward'],
      squash: { checked: true, locked: true },
    })
  })

  it('CI: job della pipeline in testa; senza job la pipeline stessa; senza pipeline nessuna', async () => {
    const pipeline = { id: 11, project_id: 9, status: 'running', web_url: 'https://git.example.com/p/11' }
    const { gl } = gitlab({
      [`GET ${P}/merge_requests/1`]: mr(1, { head_pipeline: pipeline }),
      'GET /projects/9/pipelines/11/jobs?per_page=100': [
        { name: 'test', status: 'success', web_url: 'https://git.example.com/j/1' },
        { name: 'deploy', status: 'manual', web_url: 'https://git.example.com/j/2' },
        { name: 'lint', status: 'running', web_url: 'https://git.example.com/j/3' },
      ],
      [`GET ${P}/merge_requests/2`]: mr(2, { head_pipeline: { ...pipeline, id: 12, status: 'failed' } }),
      'GET /projects/9/pipelines/12/jobs?per_page=100': [],
      [`GET ${P}/merge_requests/3`]: mr(3, { head_pipeline: null }),
    })
    expect(await gl.checks('group/demo', 1, A)).toEqual({
      state: 'pending',
      checks: [
        { name: 'test', state: 'success', url: 'https://git.example.com/j/1' },
        { name: 'deploy', state: 'skipped', url: 'https://git.example.com/j/2' },
        { name: 'lint', state: 'pending', url: 'https://git.example.com/j/3' },
      ],
    })
    expect(await gl.checks('group/demo', 2, A)).toEqual({ state: 'failure', checks: [{ name: 'pipeline', state: 'failure', url: 'https://git.example.com/p/11' }] })
    expect(await gl.checks('group/demo', 3, A)).toEqual({ state: 'none', checks: [] })
  })

  it('nota, chiusura, riapertura', async () => {
    const { gl, calls } = gitlab({ [`POST ${P}/merge_requests/1/notes`]: { id: 1 }, [`PUT ${P}/merge_requests/1`]: mr(1) })
    await gl.comment('group/demo', 1, 'Grazie!')
    await gl.setState('group/demo', 1, 'closed')
    await gl.setState('group/demo', 1, 'open')
    expect(calls.map((c) => c.body)).toEqual([{ body: 'Grazie!' }, { state_event: 'close' }, { state_event: 'reopen' }])
  })

  it('merge: SHA, squash, messaggio giusto e branch da eliminare; 409 → PR cambiata', async () => {
    const { gl, calls } = gitlab({ [`PUT ${P}/merge_requests/1/merge`]: { state: 'merged' }, [`PUT ${P}/merge_requests/2/merge`]: reply(409, { message: 'SHA does not match HEAD of source branch' }) })
    await gl.merge('group/demo', 1, { method: 'merge', squash: false, message: 'Merge', deleteBranch: true, sha: A })
    await gl.merge('group/demo', 1, { method: 'merge', squash: true, message: 'Squash', deleteBranch: false, sha: A })
    await gl.merge('group/demo', 1, { method: 'fastForward', squash: false, message: 'ignorato', deleteBranch: false, sha: A })
    expect(calls.map((c) => c.body)).toEqual([
      { sha: A, squash: false, should_remove_source_branch: true, merge_commit_message: 'Merge' },
      { sha: A, squash: true, should_remove_source_branch: false, squash_commit_message: 'Squash' },
      { sha: A, squash: false, should_remove_source_branch: false },
    ])
    await expect(gl.merge('group/demo', 2, { method: 'merge', squash: false, message: 'm', deleteBranch: false, sha: A })).rejects.toThrow(
      'The pull request has changed in the meantime',
    )
  })

  it('creazione: prefisso Draft, e per un fork sul progetto sorgente con target_project_id', async () => {
    const { gl, calls } = gitlab({
      [`POST ${P}/merge_requests`]: mr(4),
      [`GET ${P}`]: project,
      'POST /projects/grace%2Fdemo/merge_requests': mr(5),
    })
    expect(await gl.create('group/demo', { base: 'main', head: 'feature/x', headProject: null, title: 'T', body: 'B', draft: true })).toBe(4)
    expect(await gl.create('group/demo', { base: 'main', head: 'fix', headProject: 'grace/demo', title: 'Draft: T', body: '', draft: true })).toBe(5)
    expect(calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body])).toEqual([
      [`${P}/merge_requests`, { source_branch: 'feature/x', target_branch: 'main', title: 'Draft: T', description: 'B' }],
      ['/projects/grace%2Fdemo/merge_requests', { source_branch: 'fix', target_branch: 'main', title: 'Draft: T', description: '', target_project_id: 7 }],
    ])
  })
})
```

Run: `npx vitest run test/unit/gitlab.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/main/hosting/gitlab.ts`**

```ts
import type { CheckState, CiStatus, MergeBlock, MergeMethod, MergeRequest, PullRequest, PullRequestDetail, PullRequestFilter } from '../../shared/types'
import type { HostingClient } from './http'
import { byTime, ciSummary, type HostingProvider, mergeError, type PullRequestCreate, safeWebUrl, seconds } from './provider'

interface GlUser {
  username: string
}

interface GlProject {
  id: number
  default_branch: string | null
  merge_method?: 'merge' | 'rebase_merge' | 'ff'
  squash_option?: 'never' | 'always' | 'default_on' | 'default_off'
  remove_source_branch_after_merge?: boolean | null
  path_with_namespace: string
}

interface GlPipeline {
  id: number
  project_id: number
  status: string
  web_url: string
}

interface GlMergeRequest {
  iid: number
  title: string
  description: string | null
  state: 'opened' | 'closed' | 'merged' | 'locked'
  draft?: boolean
  work_in_progress?: boolean
  author: GlUser | null
  created_at: string
  updated_at: string
  web_url: string
  source_branch: string
  target_branch: string
  sha: string
  source_project_id: number
  target_project_id: number
  user_notes_count: number
  /** Solo nel dettaglio. */
  detailed_merge_status?: string
  has_conflicts?: boolean
  head_pipeline?: GlPipeline | null
  diff_refs?: { base_sha: string; head_sha: string; start_sha: string } | null
  force_remove_source_branch?: boolean | null
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
  created_at: string
}

interface GlJob {
  name: string
  status: string
  web_url: string
}

const projectPath = (project: string) => `/projects/${encodeURIComponent(project)}`

function jobState(status: string): CheckState {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'failure'
  if (status === 'canceled') return 'cancelled'
  if (status === 'skipped' || status === 'manual') return 'skipped'
  return 'pending'
}

function block(m: GlMergeRequest): MergeBlock | null {
  if (m.state !== 'opened') return 'notOpen'
  switch (m.detailed_merge_status) {
    case undefined:
      return m.has_conflicts ? 'conflicts' : null
    case 'mergeable':
      return null
    case 'conflict':
      return 'conflicts'
    case 'ci_must_pass':
    case 'ci_still_running':
      return 'checks'
    case 'not_approved':
    case 'requested_changes':
      return 'approvals'
    case 'draft_status':
      return 'draft'
    case 'discussions_not_resolved':
      return 'discussions'
    case 'need_rebase':
      return 'rebase'
    case 'checking':
    case 'unchecked':
    case 'preparing':
      return 'checking'
    default:
      return 'blocked'
  }
}

const METHODS: Record<NonNullable<GlProject['merge_method']>, MergeMethod> = { merge: 'merge', rebase_merge: 'semiLinear', ff: 'fastForward' }

export class GitLab implements HostingProvider {
  constructor(
    private readonly api: HostingClient,
    private readonly host: string,
  ) {}

  async verify(): Promise<string> {
    return (await this.api.request<GlUser>('/user')).username
  }

  async defaultBranch(project: string): Promise<string> {
    return (await this.api.request<GlProject>(projectPath(project))).default_branch ?? 'main'
  }

  async list(project: string, filter: PullRequestFilter): Promise<PullRequest[]> {
    const state = filter === 'open' ? 'opened' : filter
    const mrs = await this.api.list<GlMergeRequest>(
      `${projectPath(project)}/merge_requests?state=${state}&order_by=updated_at&sort=desc&per_page=100`,
      filter === 'open' ? 500 : 100,
    )
    // Il nome del fork costa una richiesta per merge request: arriva solo nel dettaglio
    return mrs.map((m) => this.mergeRequest(m, ''))
  }

  private mergeRequest(m: GlMergeRequest, forkPath: string): PullRequest {
    return {
      number: m.iid,
      title: m.title,
      body: m.description ?? '',
      author: m.author?.username ?? '',
      state: m.state === 'merged' ? 'merged' : m.state === 'opened' ? 'open' : 'closed',
      draft: m.draft ?? m.work_in_progress ?? false,
      head: { branch: m.source_branch, sha: m.sha, fork: m.source_project_id === m.target_project_id ? null : forkPath },
      base: { branch: m.target_branch, sha: m.diff_refs?.start_sha ?? '' },
      createdAt: seconds(m.created_at),
      updatedAt: seconds(m.updated_at),
      comments: m.user_notes_count,
      webUrl: safeWebUrl(m.web_url, this.host),
    }
  }

  async detail(project: string, number: number): Promise<PullRequestDetail> {
    const base = `${projectPath(project)}/merge_requests/${number}`
    const [m, settings, notes, commits] = await Promise.all([
      this.api.request<GlMergeRequest>(base),
      this.api.request<GlProject>(projectPath(project)),
      this.api.list<GlNote>(`${base}/notes?sort=asc&order_by=created_at&per_page=100`, 1000),
      this.api.list<GlCommit>(`${base}/commits?per_page=100`, 250),
    ])
    const fork =
      m.source_project_id === m.target_project_id
        ? ''
        : await this.api.request<GlProject>(`/projects/${m.source_project_id}`).then(
            (p) => p.path_with_namespace,
            () => '',
          )
    const squash = settings.squash_option ?? 'default_off'
    const blocked = block(m)
    return {
      pr: this.mergeRequest(m, fork),
      block: blocked,
      warning: blocked === null && m.head_pipeline?.status === 'failed',
      merge: {
        methods: [METHODS[settings.merge_method ?? 'merge']],
        squash: squash === 'never' ? null : { checked: squash === 'always' || squash === 'default_on', locked: squash === 'always' },
        deleteBranch: m.force_remove_source_branch ?? settings.remove_source_branch_after_merge ?? false,
        mergeMessage: `Merge branch '${m.source_branch}' into '${m.target_branch}'\n\n${m.title}\n\nSee merge request ${project}!${number}`,
        squashMessage: m.title,
      },
      timeline: byTime([
        // Le note di sistema ("added 1 commit", …) ripetono la timeline: non si mostrano
        ...notes
          .filter((n) => !n.system)
          .map((n) => ({ kind: 'comment' as const, id: String(n.id), author: n.author?.username ?? '', body: n.body, time: seconds(n.created_at) })),
        ...commits.map((c) => ({ kind: 'commit' as const, sha: c.id, subject: c.title, author: c.author_name, time: seconds(c.created_at) })),
      ]),
    }
  }

  async checks(project: string, number: number): Promise<CiStatus> {
    const m = await this.api.request<GlMergeRequest>(`${projectPath(project)}/merge_requests/${number}`)
    const p = m.head_pipeline
    if (!p) return ciSummary([])
    const jobs = await this.api.list<GlJob>(`/projects/${p.project_id}/pipelines/${p.id}/jobs?per_page=100`, 300)
    const checks = jobs.length
      ? jobs.map((j) => ({ name: j.name, state: jobState(j.status), url: j.web_url }))
      : [{ name: 'pipeline', state: jobState(p.status), url: p.web_url }]
    return ciSummary(checks)
  }

  async comment(project: string, number: number, body: string): Promise<void> {
    await this.api.request(`${projectPath(project)}/merge_requests/${number}/notes`, { method: 'POST', body: { body } })
  }

  async merge(project: string, number: number, r: MergeRequest): Promise<void> {
    const message = r.squash ? { squash_commit_message: r.message } : r.method === 'fastForward' ? {} : { merge_commit_message: r.message }
    try {
      await this.api.request(`${projectPath(project)}/merge_requests/${number}/merge`, {
        method: 'PUT',
        body: { sha: r.sha, squash: r.squash, should_remove_source_branch: r.deleteBranch, ...message },
      })
    } catch (e) {
      throw mergeError(e)
    }
  }

  async setState(project: string, number: number, state: 'open' | 'closed'): Promise<void> {
    await this.api.request(`${projectPath(project)}/merge_requests/${number}`, { method: 'PUT', body: { state_event: state === 'closed' ? 'close' : 'reopen' } })
  }

  async create(project: string, input: PullRequestCreate): Promise<number> {
    const title = input.draft && !/^draft:/i.test(input.title) ? `Draft: ${input.title}` : input.title
    const body = { source_branch: input.head, target_branch: input.base, title, description: input.body }
    if (!input.headProject) return (await this.api.request<GlMergeRequest>(`${projectPath(project)}/merge_requests`, { method: 'POST', body })).iid
    // Da un fork: la merge request si apre sul progetto sorgente, verso il progetto di destinazione
    const target = await this.api.request<GlProject>(projectPath(project))
    return (await this.api.request<GlMergeRequest>(`${projectPath(input.headProject)}/merge_requests`, { method: 'POST', body: { ...body, target_project_id: target.id } })).iid
  }
}
```

Nel merge il renderer manda già `deleteBranch: false` per le PR da fork (Task 11), quindi qui non serve un controllo.

Run: `npx vitest run test/unit/gitlab.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/hosting/gitlab.ts test/unit/gitlab.test.ts
git commit -m "feat: provider GitLab per le merge request"
```

---

### Task 5: Token cifrati e account

**Files:**
- Create: `src/main/hosting/tokens.ts`, `src/main/hosting/accounts.ts`
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/unit/tokens.test.ts`, `test/unit/accounts.test.ts`

**Interfaces:**
- Consumes: `GitHub`, `GitLab` (Task 3–4), `HostingClient`, `Fetch`, `Log` (Task 2), `parseRemoteUrl`, `remoteAccountKey`, `accountLabel` (Task 1), `SettingsStore`.
- Produces:
  - `interface Cipher { available(): boolean; encrypt(text: string): Buffer; decrypt(data: Buffer): string }`;
  - `class TokenStore { constructor(file, cipher); get(id): string | null; set(id, token): void; delete(id): void }`;
  - `class Accounts { constructor(settings, tokens, fetch, log) }`, con i metodi:
    - `add(service, host, token): Promise<AppSettings>`;
    - `remove(id): AppSettings`;
    - `setForRemote(root, remote, id | null): AppSettings`;
    - `target(root, remote, url): HostingTarget | null`;
    - `provider(account): HostingProvider`.

- [ ] **Step 1: Test di `TokenStore`**

In `test/helpers/fake-api.ts` aggiungi:

```ts
import type { Cipher } from '../../src/main/hosting/tokens'

/** Cifratura finta ma reversibile: il testo in chiaro non deve comparire nel file. */
export const fakeCipher: Cipher = {
  available: () => true,
  encrypt: (text) => Buffer.from([...text].reverse().join('')),
  decrypt: (data) => [...data.toString()].reverse().join(''),
}
```

`test/unit/tokens.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Cipher, TokenStore } from '../../src/main/hosting/tokens'
import { fakeCipher } from '../helpers/fake-api'

const file = () => join(mkdtempSync(join(tmpdir(), 'merlino-tokens-')), 'sub', 'tokens.json')

describe('TokenStore', () => {
  it('salva cifrato, rilegge da una nuova istanza, cancella', () => {
    const f = file()
    new TokenStore(f, fakeCipher).set('a', 'segreto-123')
    expect(readFileSync(f, 'utf8')).not.toContain('segreto-123')
    const again = new TokenStore(f, fakeCipher)
    expect(again.get('a')).toBe('segreto-123')
    again.delete('a')
    expect(new TokenStore(f, fakeCipher).get('a')).toBeNull()
  })

  it('senza portachiavi non salva', () => {
    expect(() => new TokenStore(file(), { ...fakeCipher, available: () => false }).set('a', 'x')).toThrow('The system keychain is not available')
  })

  it('file rotto o voce illeggibile: nessun token', () => {
    const f = file()
    new TokenStore(f, fakeCipher).set('a', 'x')
    writeFileSync(f, '{rotto')
    expect(new TokenStore(f, fakeCipher).get('a')).toBeNull()
    const broken: Cipher = { ...fakeCipher, decrypt: () => { throw new Error('chiave cambiata') } }
    const g = file()
    new TokenStore(g, fakeCipher).set('a', 'x')
    expect(new TokenStore(g, broken).get('a')).toBeNull()
  })
})
```

Run: `npx vitest run test/unit/tokens.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: Testi**

`en.ts`:

```ts
  'error.noKeychain': 'The system keychain is not available: the account cannot be saved',
  'error.accountNotFound': 'Account not found',
  'error.noAccount': 'No account for {host}: connect one in Settings → Accounts',
  'error.notHosted': '{remote} is not on GitHub or GitLab',
  'error.forkOtherServer': "The branch's remote is on another server",
```

`it.ts`:

```ts
  'error.noKeychain': "Il portachiavi del sistema non è disponibile: l'account non si può salvare",
  'error.accountNotFound': 'Account non trovato',
  'error.noAccount': 'Nessun account per {host}: collegane uno in Impostazioni → Account',
  'error.notHosted': '{remote} non è su GitHub o GitLab',
  'error.forkOtherServer': 'Il remote del branch è su un altro server',
```

- [ ] **Step 3: `src/main/hosting/tokens.ts`**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { t } from '../i18n'

/** safeStorage di Electron, o una versione finta nei test. */
export interface Cipher {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

/** Token degli account, cifrati con il portachiavi del sistema in un file a parte: mai in settings.json. */
export class TokenStore {
  private data: Record<string, string>

  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
    } catch {
      this.data = {}
    }
  }

  get(id: string): string | null {
    const value = this.data[id]
    if (!value) return null
    try {
      return this.cipher.decrypt(Buffer.from(value, 'base64'))
    } catch {
      return null
    }
  }

  set(id: string, token: string): void {
    if (!this.cipher.available()) throw new Error(t('error.noKeychain'))
    this.data[id] = this.cipher.encrypt(token).toString('base64')
    this.save()
  }

  delete(id: string): void {
    delete this.data[id]
    this.save()
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
```

Run: `npx vitest run test/unit/tokens.test.ts`
Expected: PASS.

- [ ] **Step 4: Test di `Accounts`**

`test/unit/accounts.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GitError } from '../../src/main/git/runner'
import { Accounts } from '../../src/main/hosting/accounts'
import { TokenStore } from '../../src/main/hosting/tokens'
import { SettingsStore } from '../../src/main/settings'
import { fakeApi, fakeCipher, reply } from '../helpers/fake-api'

function setup(routes: Record<string, unknown> = { 'GET /user': { login: 'ada' } }) {
  const dir = mkdtempSync(join(tmpdir(), 'merlino-accounts-'))
  const settings = new SettingsStore(join(dir, 'settings.json'))
  const tokens = new TokenStore(join(dir, 'tokens.json'), fakeCipher)
  const api = fakeApi('https://api.github.com', routes)
  return { dir, settings, tokens, calls: api.calls, accounts: new Accounts(settings, tokens, api.fetch, () => {}) }
}

describe('Accounts', () => {
  it('aggiunta: verifica il token, salva l’account senza token; lo stesso utente non si duplica', async () => {
    const { dir, accounts, tokens, calls } = setup()
    const s = await accounts.add('github', 'github.com', 'tok-1')
    expect(s.accounts).toEqual([{ id: expect.any(String), service: 'github', host: 'github.com', username: 'ada' }])
    expect(calls[0].path).toBe('/user')
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).not.toContain('tok-1')
    expect(tokens.get(s.accounts[0].id)).toBe('tok-1')
    const again = await accounts.add('github', 'github.com', 'tok-2')
    expect(again.accounts).toHaveLength(1)
    expect(tokens.get(s.accounts[0].id)).toBe('tok-2')
  })

  it('token rifiutato: niente salvato', async () => {
    const { accounts, settings } = setup({ 'GET /user': reply(401, { message: 'Bad credentials' }) })
    await expect(accounts.add('github', 'github.com', 'x')).rejects.toThrow('The token for github.com is no longer valid')
    expect(settings.get().accounts).toEqual([])
  })

  it('remote → server, progetto e account: quello scelto, altrimenti lo stesso host (senza porta)', async () => {
    const { accounts, settings } = setup()
    const ada = { id: 'ada', service: 'github' as const, host: 'github.com', username: 'ada' }
    const work = { id: 'work', service: 'gitlab' as const, host: 'git.example.com:8443', username: 'ada' }
    settings.update({ accounts: [ada, work] })
    expect(accounts.target('/r', 'origin', 'git@github.com:ada/demo.git')).toEqual({ host: 'github.com', project: 'ada/demo', account: ada })
    expect(accounts.target('/r', 'origin', 'https://git.example.com:8443/group/demo.git')?.account).toEqual(work)
    expect(accounts.target('/r', 'origin', 'git@github.com-lavoro:ada/demo.git')?.account).toBeNull()
    accounts.setForRemote('/r', 'origin', 'work')
    expect(accounts.target('/r', 'origin', 'git@github.com-lavoro:ada/demo.git')?.account).toEqual(work)
    expect(accounts.target('/r', 'origin', '/srv/demo.git')).toBeNull()
    accounts.setForRemote('/r', 'origin', null)
    expect(accounts.target('/r', 'origin', 'git@github.com-lavoro:ada/demo.git')?.account).toBeNull()
    expect(() => accounts.setForRemote('/r', 'origin', 'manca')).toThrow('Account not found')
  })

  it('rimozione: account, token e scelte dei remote', async () => {
    const { accounts, tokens } = setup()
    const id = (await accounts.add('github', 'github.com', 'tok')).accounts[0].id
    accounts.setForRemote('/r', 'origin', id)
    const s = accounts.remove(id)
    expect(s.accounts).toEqual([])
    expect(s.remoteAccounts).toEqual({})
    expect(tokens.get(id)).toBeNull()
  })

  it('provider senza token: errore auth', () => {
    const { accounts } = setup()
    try {
      accounts.provider({ id: 'x', service: 'github', host: 'github.com', username: 'ada' })
      expect.unreachable()
    } catch (e) {
      expect((e as GitError).info).toMatchObject({ code: 'auth', message: 'The token for ada@github.com is no longer valid' })
    }
  })
})
```

Run: `npx vitest run test/unit/accounts.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 5: `src/main/hosting/accounts.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { accountLabel, remoteAccountKey } from '../../shared/hosting'
import type { AppSettings, HostingAccount, HostingService, HostingTarget } from '../../shared/types'
import { GitError } from '../git/runner'
import { t } from '../i18n'
import type { SettingsStore } from '../settings'
import { GitHub } from './github'
import { GitLab } from './gitlab'
import { type Fetch, HostingClient, type Log } from './http'
import type { HostingProvider } from './provider'
import { parseRemoteUrl } from './remote-url'
import type { TokenStore } from './tokens'

/** L'host di un account senza porta, come lo dà l'URL di un remote SSH. */
const hostname = (host: string) => host.replace(/:\d+$/, '').toLowerCase()

/** Account collegati: i dati in settings.json, i token cifrati a parte. */
export class Accounts {
  constructor(
    private readonly settings: SettingsStore,
    private readonly tokens: TokenStore,
    private readonly fetch: Fetch,
    private readonly log: Log,
  ) {}

  /** Verifica il token con GET /user e salva l'account. Lo stesso utente sullo stesso server non si duplica: si aggiorna il token. */
  async add(service: HostingService, host: string, token: string): Promise<AppSettings> {
    const username = await this.connect({ id: '', service, host, username: '' }, token).verify()
    const { accounts } = this.settings.get()
    const existing = accounts.find((a) => a.service === service && a.host === host && a.username === username)
    const account = existing ?? { id: randomUUID(), service, host, username }
    this.tokens.set(account.id, token)
    return this.settings.update({ accounts: existing ? accounts : [...accounts, account] })
  }

  remove(id: string): AppSettings {
    const { accounts, remoteAccounts } = this.settings.get()
    this.tokens.delete(id)
    return this.settings.update({
      accounts: accounts.filter((a) => a.id !== id),
      remoteAccounts: Object.fromEntries(Object.entries(remoteAccounts).filter(([, value]) => value !== id)),
    })
  }

  /** L'account da usare per un remote; null torna alla scelta automatica. */
  setForRemote(root: string, remote: string, id: string | null): AppSettings {
    const { accounts, remoteAccounts } = this.settings.get()
    const key = remoteAccountKey(root, remote)
    if (id === null) delete remoteAccounts[key]
    else if (accounts.some((a) => a.id === id)) remoteAccounts[key] = id
    else throw new Error(t('error.accountNotFound'))
    return this.settings.update({ remoteAccounts })
  }

  /** Server, progetto e account di un remote: quello scelto dal menu, altrimenti il primo con lo stesso host. */
  target(root: string, remote: string, url: string): HostingTarget | null {
    const location = parseRemoteUrl(url)
    if (!location) return null
    const { accounts, remoteAccounts } = this.settings.get()
    const chosen = remoteAccounts[remoteAccountKey(root, remote)]
    const account = accounts.find((a) => a.id === chosen) ?? accounts.find((a) => hostname(a.host) === location.host) ?? null
    return { host: location.host, project: location.project, account }
  }

  provider(account: HostingAccount): HostingProvider {
    const token = this.tokens.get(account.id)
    if (!token) {
      throw new GitError({ args: [], exitCode: null, stderr: '', message: t('error.hostingAuth', { account: accountLabel(account) }), code: 'auth' })
    }
    return this.connect(account, token)
  }

  private connect(account: HostingAccount, token: string): HostingProvider {
    const api = new HostingClient(account, token, this.fetch, this.log)
    return account.service === 'github' ? new GitHub(api, account.host) : new GitLab(api, account.host)
  }
}
```

Run: `npx vitest run test/unit/accounts.test.ts test/unit/tokens.test.ts test/unit/i18n.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/hosting/tokens.ts src/main/hosting/accounts.ts test/unit/tokens.test.ts test/unit/accounts.test.ts test/helpers/fake-api.ts src/shared/i18n/en.ts src/shared/i18n/it.ts
git commit -m "feat: account di GitHub e GitLab con token cifrati nel portachiavi"
```

---

### Task 6: La PR con git (oggetti, commit, diff, checkout)

**Files:**
- Create: `src/main/git/pull-request.ts`
- Modify: `src/shared/types.ts` (`RepoCommand`), `src/main/git/branches.ts`, `src/main/validate.ts`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/integration/pull-request.test.ts`, `test/unit/validate.test.ts`

**Interfaces:**
- Consumes: `parseLog`, `LOG_FORMAT`, `parseNameStatus`, `parseNumstat`, `diffFlags`, `limitedDiff`, `checkoutRemote`, `fastForward` di oggi.
- Produces:
  - `pullRef(service, n)`;
  - `fetchPullRequest(r, remote, service, n, base): Promise<void>`;
  - `readPullRequestChanges(r, baseSha, headSha): Promise<PullRequestChanges>`;
  - `readPullRequestFileDiff(r, mergeBase, headSha, file, options): Promise<FileDiff>`;
  - `readBranchSummary(r, base, head): Promise<{ count: number; message: string }>`;
  - `checkoutPullRequest(r, command)` in `branches.ts`;
  - la variante `RepoCommand` `{ kind: 'checkoutPullRequest'; remote; service; number; head; sha; fork }`;
  - in `validate.ts`: `prNumber(value)`.

- [ ] **Step 1: Test di integrazione**

`test/integration/pull-request.test.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkoutPullRequest } from '../../src/main/git/branches'
import { fetchPullRequest, readBranchSummary, readPullRequestChanges, readPullRequestFileDiff } from '../../src/main/git/pull-request'
import { GitRunner } from '../../src/main/git/runner'
import { cloneOf, git, makeRemotePair } from '../helpers/repo'

const commit = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}
const runner = (dir: string) => new GitRunner(() => 'git', dir)

/** Un "server" con main e una PR di due commit pubblicata solo nel ref della PR, come fanno GitHub e GitLab. */
function serverWithPullRequest(ref = 'refs/pull/1/head') {
  const { bare, clone } = makeRemotePair()
  const author = cloneOf(bare)
  git(author, 'switch', '-q', '-c', 'feature/login')
  commit(author, 'login.txt', 'login\n', 'feat: login')
  commit(author, 'file1.txt', 'cambiato\n', 'fix: file1')
  git(author, 'push', '-q', 'origin', `HEAD:${ref}`)
  return { bare, clone, author, head: git(author, 'rev-parse', 'HEAD').trim(), base: git(clone, 'rev-parse', 'origin/main').trim() }
}

describe('pull request con git', () => {
  it('scarica gli oggetti senza creare ref, poi commit, file e diff da merge-base a head', async () => {
    const { clone, head, base } = serverWithPullRequest()
    const r = runner(clone)
    await fetchPullRequest(r, 'origin', 'github', 1, 'main')
    expect(git(clone, 'for-each-ref', '--format=%(refname)')).not.toContain('pull')
    const changes = await readPullRequestChanges(r, base, head)
    expect(changes.mergeBase).toBe(base)
    expect(changes.commits.map((c) => c.subject)).toEqual(['fix: file1', 'feat: login'])
    expect(changes.files).toEqual([
      { path: 'file1.txt', status: 'M', added: 1, deleted: 1 },
      { path: 'login.txt', status: 'A', added: 1, deleted: 0 },
    ])
    const diff = await readPullRequestFileDiff(r, changes.mergeBase, head, { path: 'login.txt' }, { ignoreWhitespace: false, force: false })
    expect(diff.hunks[0].lines).toEqual([{ type: 'add', text: 'login', oldNo: null, newNo: 1 }])
  })

  it('GitLab: refs/merge-requests/<n>/head', async () => {
    const { clone, head, base } = serverWithPullRequest('refs/merge-requests/2/head')
    await fetchPullRequest(runner(clone), 'origin', 'gitlab', 2, 'main')
    expect((await readPullRequestChanges(runner(clone), base, head)).commits).toHaveLength(2)
  })

  it('checkout di una PR da fork: pr/<n>, poi aggiornato in fast-forward', async () => {
    const { clone, author, head } = serverWithPullRequest()
    const command = { kind: 'checkoutPullRequest', remote: 'origin', service: 'github', number: 1, head: 'feature/login', sha: head, fork: true } as const
    await checkoutPullRequest(runner(clone), command)
    expect(git(clone, 'symbolic-ref', '--short', 'HEAD').trim()).toBe('pr/1')
    expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(head)
    git(clone, 'switch', '-q', 'main')
    commit(author, 'altro.txt', 'x\n', 'feat: altro')
    git(author, 'push', '-q', 'origin', 'HEAD:refs/pull/1/head')
    const next = git(author, 'rev-parse', 'HEAD').trim()
    await checkoutPullRequest(runner(clone), { ...command, sha: next })
    expect(git(clone, 'rev-parse', 'pr/1').trim()).toBe(next)
    expect(git(clone, 'symbolic-ref', '--short', 'HEAD').trim()).toBe('pr/1')
  })

  it('checkout di una PR da fork che non è più in fast-forward: errore, branch intatto', async () => {
    const { clone, author, head } = serverWithPullRequest()
    const command = { kind: 'checkoutPullRequest', remote: 'origin', service: 'github', number: 1, head: 'feature/login', sha: head, fork: true } as const
    await checkoutPullRequest(runner(clone), command)
    git(author, 'reset', '-q', '--hard', 'HEAD~1')
    commit(author, 'riscritto.txt', 'y\n', 'feat: riscritto')
    git(author, 'push', '-q', '-f', 'origin', 'HEAD:refs/pull/1/head')
    const rewritten = git(author, 'rev-parse', 'HEAD').trim()
    await expect(checkoutPullRequest(runner(clone), { ...command, sha: rewritten })).rejects.toThrow('pr/1')
    expect(git(clone, 'rev-parse', 'pr/1').trim()).toBe(head)
  })

  it('checkout di una PR dello stesso repo: il branch che segue origin/<head>', async () => {
    const { bare, clone } = makeRemotePair()
    const author = cloneOf(bare)
    git(author, 'switch', '-q', '-c', 'feature/x')
    commit(author, 'x.txt', 'x\n', 'feat: x')
    git(author, 'push', '-q', 'origin', 'feature/x')
    const head = git(author, 'rev-parse', 'HEAD').trim()
    await checkoutPullRequest(runner(clone), { kind: 'checkoutPullRequest', remote: 'origin', service: 'github', number: 3, head: 'feature/x', sha: head, fork: false })
    expect(git(clone, 'symbolic-ref', '--short', 'HEAD').trim()).toBe('feature/x')
    expect(git(clone, 'rev-parse', '--abbrev-ref', '@{u}').trim()).toBe('origin/feature/x')
  })

  it('riepilogo di un branch per una nuova PR: quanti commit, e il messaggio se è uno solo', async () => {
    const { clone } = makeRemotePair()
    git(clone, 'switch', '-q', '-c', 'feature/y')
    commit(clone, 'y.txt', 'y\n', 'feat: y\n\nPerché serve')
    expect(await readBranchSummary(runner(clone), 'origin/main', 'feature/y')).toEqual({ count: 1, message: 'feat: y\n\nPerché serve' })
    commit(clone, 'z.txt', 'z\n', 'feat: z')
    expect(await readBranchSummary(runner(clone), 'origin/main', 'feature/y')).toEqual({ count: 2, message: '' })
  })
})
```

In `test/unit/validate.test.ts`, nel `describe` esistente aggiungi:

```ts
  it('checkout di una pull request', () => {
    const ok = { kind: 'checkoutPullRequest', remote: 'origin', service: 'gitlab', number: 4, head: 'feature/x', sha: 'a'.repeat(40), fork: true, extra: 1 }
    expect(repoCommand(ok)).toEqual({ kind: 'checkoutPullRequest', remote: 'origin', service: 'gitlab', number: 4, head: 'feature/x', sha: 'a'.repeat(40), fork: true })
    expect(() => repoCommand({ ...ok, number: 0 })).toThrow()
    expect(() => repoCommand({ ...ok, service: 'bitbucket' })).toThrow()
    expect(() => repoCommand({ ...ok, head: '--upload-pack=x' })).toThrow()
  })
```

(se `repoCommand` non è già importato in quel file, aggiungilo all'import da `../../src/main/validate`).

Run: `npx vitest run test/integration/pull-request.test.ts test/unit/validate.test.ts`
Expected: FAIL (moduli e variante mancanti).

- [ ] **Step 2: Variante di `RepoCommand` e validazione**

In `src/shared/types.ts`, in fondo all'unione `RepoCommand` aggiungi:

```ts
  | { kind: 'checkoutPullRequest'; remote: string; service: HostingService; number: number; head: string; sha: string; fork: boolean }
```

In `src/main/validate.ts`:
- importa `HOSTING_SERVICES` da `'../shared/hosting'`;
- aggiungi, dopo `intIn`:

```ts
export const prNumber = (value: unknown): number => intIn(value, t('field.number'), 1, 1_000_000_000)
```

- nel `switch` di `repoCommand`, prima di `default`:

```ts
    case 'checkoutPullRequest':
      return {
        kind: 'checkoutPullRequest',
        remote: refName(v.remote),
        service: oneOf(v.service, HOSTING_SERVICES, 'service'),
        number: prNumber(v.number),
        head: refName(v.head),
        sha: sha(v.sha),
        fork: v.fork === true,
      }
```

Testi, `en.ts`:

```ts
  'field.number': 'number',
```

`it.ts`:

```ts
  'field.number': 'numero',
```

- [ ] **Step 3: `src/main/git/pull-request.ts`**

```ts
import type { DiffOptions, FileDiff, HostingService, PullRequestChanges } from '../../shared/types'
import { parseNameStatus, parseNumstat } from './commit'
import { type DiffRequest, diffFlags, limitedDiff } from './diff'
import { LOG_FORMAT, parseLog } from './log'
import type { GitRunner } from './runner'

/** Il ref che il server tiene per ogni PR, anche per quelle da fork. */
export const pullRef = (service: HostingService, n: number): string => (service === 'github' ? `refs/pull/${n}/head` : `refs/merge-requests/${n}/head`)

/** Scarica gli oggetti della PR e del branch di destinazione senza creare ref per la PR: la storia (log --all) non si riempie di PR. */
export async function fetchPullRequest(r: GitRunner, remote: string, service: HostingService, n: number, base: string): Promise<void> {
  await r.run(['fetch', '--no-write-fetch-head', '--no-tags', remote, pullRef(service, n), `refs/heads/${base}`], { write: true })
}

/** Commit e file della PR, da merge-base(base, head) a head. */
export async function readPullRequestChanges(r: GitRunner, baseSha: string, headSha: string): Promise<PullRequestChanges> {
  const mergeBase = (await r.run(['merge-base', baseSha, headSha])).stdout.trim()
  const range = ['-z', '-M', mergeBase, headSha]
  const [log, nameStatus, numstat] = await Promise.all([
    r.run(['log', '-z', '--decorate=full', `--format=${LOG_FORMAT}`, `${mergeBase}..${headSha}`]),
    r.run(['diff', '--name-status', ...range]),
    r.run(['diff', '--numstat', ...range]),
  ])
  const counts = parseNumstat(numstat.stdout)
  return {
    mergeBase,
    commits: parseLog(log.stdout),
    files: parseNameStatus(nameStatus.stdout).map((f) => ({ ...f, ...(counts.get(f.path) ?? { added: null, deleted: null }) })),
  }
}

export async function readPullRequestFileDiff(r: GitRunner, mergeBase: string, headSha: string, file: DiffRequest, options: DiffOptions): Promise<FileDiff> {
  const args = ['diff', '--no-color', '--no-ext-diff', '-M', ...diffFlags(options), mergeBase, headSha]
  // Con la rinomina servono entrambi i percorsi, altrimenti git vede un file nuovo
  args.push('--', ...(file.oldPath ? [file.oldPath, file.path] : [file.path]))
  return limitedDiff((await r.run(args)).stdout, file, options.force)
}

/** Commit di head che non sono in base: quanti e, se è uno solo, il suo messaggio (titolo e descrizione proposti per una nuova PR). */
export async function readBranchSummary(r: GitRunner, base: string, head: string): Promise<{ count: number; message: string }> {
  const count = Number((await r.run(['rev-list', '--count', `${base}..${head}`])).stdout.trim())
  const message = count === 1 ? (await r.run(['log', '-1', '--format=%B', head])).stdout.trimEnd() : ''
  return { count, message }
}
```

- [ ] **Step 4: `checkoutPullRequest` in `src/main/git/branches.ts`**

Aggiungi l'import `import { pullRef } from './pull-request'` e, dopo `checkoutRemote`:

```ts
/**
 * Checkout di una PR. Stesso repo: il branch che segue <remote>/<head>, come il checkout di un branch remoto.
 * Fork: il branch locale pr/<n> sul ref della PR, aggiornato solo in fast-forward.
 */
export async function checkoutPullRequest(r: GitRunner, c: Extract<RepoCommand, { kind: 'checkoutPullRequest' }>): Promise<void> {
  if (!c.fork) {
    await run(r, ['fetch', '--no-tags', c.remote, `+refs/heads/${c.head}:refs/remotes/${c.remote}/${c.head}`])
    return checkoutRemote(r, `${c.remote}/${c.head}`)
  }
  const branch = `pr/${c.number}`
  await run(r, ['fetch', '--no-write-fetch-head', '--no-tags', c.remote, pullRef(c.service, c.number)])
  const exists = (await r.run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { okCodes: [0, 1] })).exitCode === 0
  if (!exists) return run(r, ['switch', '-c', branch, c.sha])
  const ff = (await r.run(['merge-base', '--is-ancestor', `refs/heads/${branch}`, c.sha], { okCodes: [0, 1] })).exitCode === 0
  if (!ff) throw new Error(t('error.fastForward', { branch, from: `#${c.number}` }))
  const current = (await r.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], { okCodes: [0, 1] })).stdout.trim()
  if (current === branch) return run(r, ['merge', '--ff-only', c.sha])
  await run(r, ['update-ref', `refs/heads/${branch}`, c.sha])
  return run(r, ['switch', branch])
}
```

e in `runCommand`, prima della `}` dello `switch`:

```ts
    case 'checkoutPullRequest':
      return checkoutPullRequest(r, c)
```

Run: `npx vitest run test/integration/pull-request.test.ts test/unit/validate.test.ts test/unit/i18n.test.ts && npm run typecheck`
Expected: PASS, typecheck pulito.

- [ ] **Step 5: Commit**

```bash
git add src/main/git/pull-request.ts src/main/git/branches.ts src/main/validate.ts src/shared/types.ts src/shared/i18n/en.ts src/shared/i18n/it.ts test/integration/pull-request.test.ts test/unit/validate.test.ts
git commit -m "feat: commit, diff e checkout di una pull request con git"
```

---

### Task 7: Servizio delle pull request e IPC

**Files:**
- Create: `src/main/hosting/pull-requests.ts`, `src/main/hosting/ipc.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts`, `src/main/validate.ts`, `src/renderer/components/OutputPanel.vue`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/integration/hosting.test.ts`, `test/unit/validate.test.ts`

**Interfaces:**
- Consumes: Task 1–6.
- Produces:
  - `class PullRequests { constructor(accounts) }`, con i metodi:
    - `target(runner, root, remote): Promise<HostingTarget | null>`;
    - `connect(runner, root, remote): Promise<RemoteHosting>`;
    - `checks(hosting, number, sha): Promise<CiStatus>`;
  - `interface RemoteHosting { provider; project; account; target }`;
  - in `validate.ts`: `hostName`, `token`, `commentBody`, `mergeRequest`, `newPullRequest`;
  - i metodi di `Api` usati dal renderer (sotto, Step 4) e i canali relativi;
  - `registerHostingIpc(deps)`.

- [ ] **Step 1: Test di integrazione del servizio**

`test/integration/hosting.test.ts`:

```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitRunner } from '../../src/main/git/runner'
import { Accounts } from '../../src/main/hosting/accounts'
import { PullRequests } from '../../src/main/hosting/pull-requests'
import { TokenStore } from '../../src/main/hosting/tokens'
import { SettingsStore } from '../../src/main/settings'
import { fakeApi, fakeCipher } from '../helpers/fake-api'
import { git, makeRepo } from '../helpers/repo'

const SHA = 'c'.repeat(40)

describe('PullRequests', () => {
  it('URL configurato del remote → progetto e account; senza account un errore chiaro; CI conclusa in cache', async () => {
    const repo = makeRepo(1)
    git(repo, 'remote', 'add', 'origin', 'git@github.com:ada/demo.git')
    // La riscrittura insteadOf non conta: il server lo dice l'URL configurato
    git(repo, 'config', 'url./srv/altro.git.insteadOf', 'git@github.com:ada/demo.git')
    const dir = mkdtempSync(join(tmpdir(), 'merlino-hosting-'))
    const api = fakeApi('https://api.github.com', {
      'GET /user': { login: 'ada' },
      [`GET /repos/ada/demo/commits/${SHA}/status`]: { statuses: [{ context: 'ci', state: 'success', target_url: null }] },
      [`GET /repos/ada/demo/commits/${SHA}/check-runs?per_page=100`]: { check_runs: [] },
    })
    const accounts = new Accounts(new SettingsStore(join(dir, 'settings.json')), new TokenStore(join(dir, 'tokens.json'), fakeCipher), api.fetch, () => {})
    const prs = new PullRequests(accounts)
    const r = new GitRunner(() => 'git', repo)
    expect(await prs.target(r, repo, 'origin')).toEqual({ host: 'github.com', project: 'ada/demo', account: null })
    await expect(prs.connect(r, repo, 'origin')).rejects.toThrow('No account for github.com')
    await accounts.add('github', 'github.com', 'tok')
    const hosting = await prs.connect(r, repo, 'origin')
    expect(hosting.project).toBe('ada/demo')
    expect(await prs.checks(hosting, 1, SHA)).toMatchObject({ state: 'success' })
    await prs.checks(hosting, 1, SHA)
    expect(api.calls.filter((c) => c.path.endsWith('/status'))).toHaveLength(1)
  })

  it('remote che è una cartella: nessun server', async () => {
    const repo = makeRepo(1)
    git(repo, 'remote', 'add', 'origin', '/srv/git/demo.git')
    const dir = mkdtempSync(join(tmpdir(), 'merlino-hosting-'))
    const prs = new PullRequests(new Accounts(new SettingsStore(join(dir, 's.json')), new TokenStore(join(dir, 't.json'), fakeCipher), fakeApi('', {}).fetch, () => {}))
    const r = new GitRunner(() => 'git', repo)
    expect(await prs.target(r, repo, 'origin')).toBeNull()
    await expect(prs.connect(r, repo, 'origin')).rejects.toThrow('origin is not on GitHub or GitLab')
  })
})
```

In `test/unit/validate.test.ts` aggiungi agli import `hostName, token, commentBody, mergeRequest, newPullRequest` e:

```ts
  it('account e pull request', () => {
    expect(hostName(' GitLab.Example.com:8443 ')).toBe('gitlab.example.com:8443')
    expect(() => hostName('https://github.com')).toThrow()
    expect(() => hostName('github.com/ada')).toThrow()
    expect(token(' ghp_abc ')).toBe('ghp_abc')
    expect(() => token('due parole')).toThrow()
    expect(() => commentBody('   ')).toThrow()
    expect(() => commentBody('x'.repeat(65_001))).toThrow()
    expect(mergeRequest({ method: 'squash', squash: 1, message: 'm', deleteBranch: true, sha: 'a'.repeat(40), extra: 1 })).toEqual({
      method: 'squash',
      squash: false,
      message: 'm',
      deleteBranch: true,
      sha: 'a'.repeat(40),
    })
    expect(() => mergeRequest({ method: 'octopus', sha: 'a'.repeat(40) })).toThrow()
    const pr = { remote: 'origin', base: 'main', headRemote: 'origin', head: 'feature/x', title: ' T ', body: 'B', draft: true }
    expect(newPullRequest(pr)).toEqual({ ...pr, title: 'T' })
    expect(() => newPullRequest({ ...pr, title: '  ' })).toThrow()
    expect(() => newPullRequest({ ...pr, head: '-x' })).toThrow()
    expect(() => newPullRequest({ ...pr, title: 'x'.repeat(301) })).toThrow()
  })
```

Run: `npx vitest run test/integration/hosting.test.ts test/unit/validate.test.ts`
Expected: FAIL.

- [ ] **Step 2: Validazione in `src/main/validate.ts`**

Aggiungi `MERGE_METHODS` all'import da `'../shared/hosting'`, `MergeRequest` e `NewPullRequest` all'import dei tipi e, in fondo al file:

```ts
/** Server di un account: host ed eventuale porta, senza protocollo né percorso. */
export function hostName(value: unknown): string {
  const s = str(value, t('field.server')).trim().toLowerCase()
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(s)) throw new TypeError(t('validation.invalidHost', { value: s }))
  return s
}

export function token(value: unknown): string {
  const s = str(value, 'token').trim()
  if (!s || s.length > 500 || /\s/.test(s)) throw new TypeError(t('validation.invalidToken'))
  return s
}

const MAX_HOSTING_TEXT = 65_000

function hostingText(value: unknown, name: string): string {
  const s = text(value, name)
  if (s.length > MAX_HOSTING_TEXT) throw new TypeError(t('validation.tooLong', { name }))
  return s
}

export function commentBody(value: unknown): string {
  const s = hostingText(value, t('field.comment'))
  if (!s.trim()) throw new TypeError(t('validation.required', { name: t('field.comment') }))
  return s
}

export function mergeRequest(value: unknown): MergeRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    method: oneOf(v.method, MERGE_METHODS, 'method'),
    squash: v.squash === true,
    message: hostingText(v.message ?? '', 'message'),
    deleteBranch: v.deleteBranch === true,
    sha: sha(v.sha),
  }
}

export function newPullRequest(value: unknown): NewPullRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const title = typeof v.title === 'string' ? v.title.trim() : ''
  if (!title) throw new TypeError(t('validation.required', { name: t('field.title') }))
  if (title.length > 300) throw new TypeError(t('validation.tooLong', { name: t('field.title') }))
  return {
    remote: refName(v.remote),
    base: refName(v.base),
    headRemote: refName(v.headRemote),
    head: refName(v.head),
    title,
    body: hostingText(v.body ?? '', t('field.description')),
    draft: v.draft === true,
  }
}
```

Testi, `en.ts`:

```ts
  'field.server': 'server',
  'field.title': 'title',
  'field.comment': 'comment',
  'validation.invalidHost': 'Invalid server: {value}',
  'validation.invalidToken': 'Invalid token',
  'validation.tooLong': '{name} is too long',
```

`it.ts`:

```ts
  'field.server': 'server',
  'field.title': 'titolo',
  'field.comment': 'commento',
  'validation.invalidHost': 'Server non valido: {value}',
  'validation.invalidToken': 'Token non valido',
  'validation.tooLong': '{name} è troppo lungo',
```

- [ ] **Step 3: `src/main/hosting/pull-requests.ts`**

```ts
import type { CiStatus, HostingAccount, HostingTarget } from '../../shared/types'
import type { GitRunner } from '../git/runner'
import { t } from '../i18n'
import type { Accounts } from './accounts'
import type { HostingProvider } from './provider'

/** Dove stanno le PR di un remote e con quale account. */
export interface RemoteHosting {
  provider: HostingProvider
  project: string
  account: HostingAccount
  target: HostingTarget
}

export class PullRequests {
  /** Esiti della CI già conclusi, per account, progetto e SHA: non cambiano più. */
  private readonly finished = new Map<string, CiStatus>()

  constructor(private readonly accounts: Accounts) {}

  /** Dall'URL configurato del remote (senza le riscritture insteadOf), che dice su quale server sta il progetto. */
  async target(runner: GitRunner, root: string, remote: string): Promise<HostingTarget | null> {
    const url = (await runner.run(['config', '--get', `remote.${remote}.url`])).stdout.trim()
    return this.accounts.target(root, remote, url)
  }

  async connect(runner: GitRunner, root: string, remote: string): Promise<RemoteHosting> {
    const target = await this.target(runner, root, remote)
    if (!target) throw new Error(t('error.notHosted', { remote }))
    if (!target.account) throw new Error(t('error.noAccount', { host: target.host }))
    return { provider: this.accounts.provider(target.account), project: target.project, account: target.account, target }
  }

  // ponytail: la cache cresce con gli SHA visti in questa sessione; poche migliaia di voci al massimo, si azzera alla chiusura
  async checks(hosting: RemoteHosting, number: number, sha: string): Promise<CiStatus> {
    const key = `${hosting.account.id} ${hosting.project} ${sha}`
    const cached = this.finished.get(key)
    if (cached) return cached
    const status = await hosting.provider.checks(hosting.project, number, sha)
    if (status.state === 'success' || status.state === 'failure') this.finished.set(key, status)
    return status
  }
}
```

Run: `npx vitest run test/integration/hosting.test.ts test/unit/validate.test.ts test/unit/i18n.test.ts`
Expected: PASS.

- [ ] **Step 4: Canali e `Api` in `src/shared/ipc.ts`**

Negli import dei tipi aggiungi:
- `CiStatus`, `HostingService`, `HostingTarget`;
- `MergeRequest`, `NewPullRequest`;
- `PullRequest`, `PullRequestChanges`, `PullRequestDetail`, `PullRequestFilter`.

In `Channels`, prima del commento `// eventi dal main al renderer`:

```ts
  addAccount: 'accounts:add',
  removeAccount: 'accounts:remove',
  setRemoteAccount: 'accounts:set-remote',
  prTarget: 'pr:target',
  prList: 'pr:list',
  prDetail: 'pr:detail',
  prChecks: 'pr:checks',
  prComment: 'pr:comment',
  prMerge: 'pr:merge',
  prSetState: 'pr:set-state',
  prCreate: 'pr:create',
  prDefaultBranch: 'pr:default-branch',
  prChanges: 'pr:changes',
  prFileDiff: 'pr:file-diff',
  branchSummary: 'pr:branch-summary',
```

In `Api`, prima di `onProgress`:

```ts
  /** Verifica il token (GET /user) e salva l'account; il token resta nel main. */
  addAccount(service: HostingService, host: string, token: string): Promise<Result<AppSettings>>
  removeAccount(id: string): Promise<Result<AppSettings>>
  /** Account usato per un remote; null = automatico (il primo con lo stesso host). */
  setRemoteAccount(root: string, remote: string, id: string | null): Promise<Result<AppSettings>>
  /** Server, progetto e account del remote; null se il remote non è su un server (es. una cartella). */
  pullRequestTarget(root: string, remote: string): Promise<Result<HostingTarget | null>>
  pullRequests(root: string, remote: string, filter: PullRequestFilter): Promise<Result<PullRequest[]>>
  pullRequestDetail(root: string, remote: string, number: number): Promise<Result<PullRequestDetail>>
  pullRequestChecks(root: string, remote: string, number: number, sha: string): Promise<Result<CiStatus>>
  pullRequestComment(root: string, remote: string, number: number, body: string): Promise<Result<void>>
  pullRequestMerge(root: string, remote: string, number: number, request: MergeRequest): Promise<Result<void>>
  pullRequestSetState(root: string, remote: string, number: number, state: 'open' | 'closed'): Promise<Result<void>>
  /** Restituisce il numero della nuova PR. */
  pullRequestCreate(root: string, input: NewPullRequest): Promise<Result<number>>
  /** Branch principale del repo remoto: la destinazione proposta per una nuova PR. */
  pullRequestDefaultBranch(root: string, remote: string): Promise<Result<string>>
  /** Scarica con git gli oggetti della PR e ne legge commit e file. */
  pullRequestChanges(root: string, remote: string, number: number, base: { branch: string; sha: string }, headSha: string): Promise<Result<PullRequestChanges>>
  pullRequestFileDiff(root: string, mergeBase: string, headSha: string, file: { path: string; oldPath?: string }, options: DiffOptions): Promise<Result<FileDiff>>
  /** Commit di head che non sono in base: quanti e, se è uno solo, il suo messaggio. */
  branchSummary(root: string, base: string, head: string): Promise<Result<{ count: number; message: string }>>
```

In `src/preload/index.ts`, nell'oggetto `api` prima di `onProgress`:

```ts
  addAccount: (service, host, token) => ipcRenderer.invoke(Channels.addAccount, service, host, token),
  removeAccount: (id) => ipcRenderer.invoke(Channels.removeAccount, id),
  setRemoteAccount: (root, remote, id) => ipcRenderer.invoke(Channels.setRemoteAccount, root, remote, id),
  pullRequestTarget: (root, remote) => ipcRenderer.invoke(Channels.prTarget, root, remote),
  pullRequests: (root, remote, filter) => ipcRenderer.invoke(Channels.prList, root, remote, filter),
  pullRequestDetail: (root, remote, number) => ipcRenderer.invoke(Channels.prDetail, root, remote, number),
  pullRequestChecks: (root, remote, number, sha) => ipcRenderer.invoke(Channels.prChecks, root, remote, number, sha),
  pullRequestComment: (root, remote, number, body) => ipcRenderer.invoke(Channels.prComment, root, remote, number, body),
  pullRequestMerge: (root, remote, number, request) => ipcRenderer.invoke(Channels.prMerge, root, remote, number, request),
  pullRequestSetState: (root, remote, number, state) => ipcRenderer.invoke(Channels.prSetState, root, remote, number, state),
  pullRequestCreate: (root, input) => ipcRenderer.invoke(Channels.prCreate, root, input),
  pullRequestDefaultBranch: (root, remote) => ipcRenderer.invoke(Channels.prDefaultBranch, root, remote),
  pullRequestChanges: (root, remote, number, base, headSha) => ipcRenderer.invoke(Channels.prChanges, root, remote, number, base, headSha),
  pullRequestFileDiff: (root, mergeBase, headSha, file, options) => ipcRenderer.invoke(Channels.prFileDiff, root, mergeBase, headSha, file, options),
  branchSummary: (root, base, head) => ipcRenderer.invoke(Channels.branchSummary, root, base, head),
```

- [ ] **Step 5: `src/main/hosting/ipc.ts`**

```ts
import { ipcMain, net, safeStorage } from 'electron'
import { join } from 'node:path'
import { HOSTING_SERVICES, PR_FILTERS } from '../../shared/hosting'
import { Channels, type Result } from '../../shared/ipc'
import type { CommandLogEntry } from '../../shared/types'
import { fetchPullRequest, readBranchSummary, readPullRequestChanges, readPullRequestFileDiff } from '../git/pull-request'
import { t } from '../i18n'
import type { RepoSession } from '../repo-session'
import type { SettingsStore } from '../settings'
import {
  commentBody,
  diffOptions,
  fileRequest,
  hostName,
  mergeRequest,
  newPullRequest,
  oneOf,
  prNumber,
  refName,
  revision,
  sha,
  str,
  token,
  withOldPath,
} from '../validate'
import { Accounts } from './accounts'
import { PullRequests } from './pull-requests'
import { type Cipher, TokenStore } from './tokens'

export interface HostingIpcDeps {
  settings: SettingsStore
  userData: string
  log: (entry: CommandLogEntry) => void
  attempt: <T>(fn: () => Promise<T> | T) => Promise<Result<T>>
  withSession: <T>(root: unknown, fn: (session: RepoSession) => Promise<T> | T) => Promise<Result<T>>
}

/** Negli E2E niente portachiavi vero: i token dei test sono finti, e il portachiavi dell'utente resta intatto. */
const cipher: Cipher =
  process.env.MERLINO_E2E === '1'
    ? { available: () => true, encrypt: (text) => Buffer.from(text), decrypt: (data) => data.toString() }
    : {
        available: () => safeStorage.isEncryptionAvailable(),
        encrypt: (text) => safeStorage.encryptString(text),
        decrypt: (data) => safeStorage.decryptString(data),
      }

export function registerHostingIpc({ settings, userData, log, attempt, withSession }: HostingIpcDeps): void {
  const accounts = new Accounts(settings, new TokenStore(join(userData, 'tokens.json'), cipher), (url, init) => net.fetch(url, init), log)
  const prs = new PullRequests(accounts)
  const connect = (s: RepoSession, remote: unknown) => prs.connect(s.runner, s.root, refName(remote))

  ipcMain.handle(Channels.addAccount, (_e, service: unknown, host: unknown, value: unknown) =>
    attempt(() => accounts.add(oneOf(service, HOSTING_SERVICES, 'service'), hostName(host), token(value))),
  )
  ipcMain.handle(Channels.removeAccount, (_e, id: unknown) => attempt(() => accounts.remove(str(id, 'id'))))
  ipcMain.handle(Channels.setRemoteAccount, (_e, root: unknown, remote: unknown, id: unknown) =>
    attempt(() => accounts.setForRemote(str(root, 'root'), refName(remote), id === null ? null : str(id, 'id'))),
  )
  ipcMain.handle(Channels.prTarget, (_e, root: unknown, remote: unknown) => withSession(root, (s) => prs.target(s.runner, s.root, refName(remote))))
  ipcMain.handle(Channels.prList, (_e, root: unknown, remote: unknown, filter: unknown) =>
    withSession(root, async (s) => {
      const h = await connect(s, remote)
      return h.provider.list(h.project, oneOf(filter, PR_FILTERS, 'filter'))
    }),
  )
  ipcMain.handle(Channels.prDetail, (_e, root: unknown, remote: unknown, number: unknown) =>
    withSession(root, async (s) => {
      const h = await connect(s, remote)
      return h.provider.detail(h.project, prNumber(number))
    }),
  )
  ipcMain.handle(Channels.prChecks, (_e, root: unknown, remote: unknown, number: unknown, head: unknown) =>
    withSession(root, async (s) => prs.checks(await connect(s, remote), prNumber(number), sha(head))),
  )
  ipcMain.handle(Channels.prComment, (_e, root: unknown, remote: unknown, number: unknown, body: unknown) =>
    withSession(root, async (s) => {
      const h = await connect(s, remote)
      return h.provider.comment(h.project, prNumber(number), commentBody(body))
    }),
  )
  ipcMain.handle(Channels.prMerge, (_e, root: unknown, remote: unknown, number: unknown, request: unknown) =>
    withSession(root, async (s) => {
      const h = await connect(s, remote)
      return h.provider.merge(h.project, prNumber(number), mergeRequest(request))
    }),
  )
  ipcMain.handle(Channels.prSetState, (_e, root: unknown, remote: unknown, number: unknown, state: unknown) =>
    withSession(root, async (s) => {
      const h = await connect(s, remote)
      return h.provider.setState(h.project, prNumber(number), oneOf(state, ['open', 'closed'] as const, 'state'))
    }),
  )
  ipcMain.handle(Channels.prDefaultBranch, (_e, root: unknown, remote: unknown) =>
    withSession(root, async (s) => {
      const h = await connect(s, remote)
      return h.provider.defaultBranch(h.project)
    }),
  )
  ipcMain.handle(Channels.prCreate, (_e, root: unknown, value: unknown) =>
    withSession(root, async (s) => {
      const input = newPullRequest(value)
      const h = await prs.connect(s.runner, s.root, input.remote)
      const fork = input.headRemote === input.remote ? null : await prs.target(s.runner, s.root, input.headRemote)
      if (fork && fork.host !== h.target.host) throw new Error(t('error.forkOtherServer'))
      const headProject = fork && fork.project !== h.project ? fork.project : null
      return h.provider.create(h.project, { base: input.base, head: input.head, headProject, title: input.title, body: input.body, draft: input.draft })
    }),
  )
  ipcMain.handle(Channels.prChanges, (_e, root: unknown, remote: unknown, number: unknown, base: unknown, head: unknown) =>
    withSession(root, async (s) => {
      const n = prNumber(number)
      const b = (typeof base === 'object' && base !== null ? base : {}) as { branch?: unknown; sha?: unknown }
      const h = await connect(s, remote)
      await fetchPullRequest(s.runner, refName(remote), h.account.service, n, refName(b.branch))
      return readPullRequestChanges(s.runner, sha(b.sha), sha(head))
    }),
  )
  ipcMain.handle(Channels.prFileDiff, (_e, root: unknown, mergeBase: unknown, head: unknown, file: unknown, options: unknown) =>
    withSession(root, (s) => {
      const f = fileRequest(file)
      withOldPath(f)
      return readPullRequestFileDiff(s.runner, sha(mergeBase), sha(head), f, diffOptions(options))
    }),
  )
  ipcMain.handle(Channels.branchSummary, (_e, root: unknown, base: unknown, head: unknown) =>
    withSession(root, (s) => readBranchSummary(s.runner, revision(base), revision(head))),
  )
}
```

- [ ] **Step 6: Registrazione in `src/main/ipc-handlers.ts`**

Aggiungi `app` all'import da `'electron'` e l'import `import { registerHostingIpc } from './hosting/ipc'`. Dopo la definizione di `attempt` (prima del commento sul fetch automatico):

```ts
  registerHostingIpc({ settings, userData: app.getPath('userData'), log: onLog, attempt, withSession })
```

- [ ] **Step 7: Le chiamate alle API nel pannello Output**

In `src/renderer/components/OutputPanel.vue`, sostituisci la riga del comando e quella del codice d'uscita con:

```vue
        <code>{{ e.api ? e.args.join(' ') : e.args.length ? `git ${e.args.join(' ')}` : t('output.uiError') }}</code>
        <span class="muted">{{ e.durationMs }} ms</span>
        <span v-if="!e.ok && e.exitCode !== null" class="error">{{ e.api ? `HTTP ${e.exitCode}` : `exit ${e.exitCode}` }}</span>
```

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: tutto verde.

- [ ] **Step 8: Commit**

```bash
git add src/main/hosting/pull-requests.ts src/main/hosting/ipc.ts src/main/ipc-handlers.ts src/main/validate.ts src/shared/ipc.ts src/preload/index.ts src/renderer/components/OutputPanel.vue src/shared/i18n/en.ts src/shared/i18n/it.ts test/integration/hosting.test.ts test/unit/validate.test.ts
git commit -m "feat: IPC delle pull request, con validazione e chiamate nel pannello Output"
```

---

### Task 8: Impostazioni → Account e "Account…" sul remote

**Files:**
- Create: `src/renderer/components/settings/AccountSettings.vue`, `test/e2e/fake-hosting.ts`, `test/e2e/pull-requests.spec.ts`
- Modify: `src/renderer/stores/app.ts`, `src/renderer/components/SettingsView.vue`, `src/renderer/actions/branches.ts`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`

**Interfaces:**
- Consumes: `Api.addAccount`, `removeAccount`, `setRemoteAccount` (Task 7); `remoteAccountKey`, `accountLabel` (Task 1).
- Produces:
  - `SettingsSection` con `'accounts'`;
  - nello store dell'app:
    - `accountHost: Ref<string | null>`;
    - `addAccount(service, host, token): Promise<string | null>`, che restituisce `null` se va bene e altrimenti il messaggio d'errore;
    - `removeAccount(id)`;
    - `setRemoteAccount(root, remote, id | null)`;
    - `connectAccount(host)`.
  - Per gli E2E:
    - `fakeHosting(routes)` → `{ url, calls, close }`;
    - `hostedRepo(host, project)` → `{ bare, clone }`;
    - `seedAccount(userData, account, token)`;
    - `ghPull(n, extra?)`, `glMergeRequest(iid, extra?)`;
    - `GITHUB_ACCOUNT`, `GITLAB_ACCOUNT`.

- [ ] **Step 1: Strumenti per gli E2E, `test/e2e/fake-hosting.ts`**

```ts
import { writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { HostingAccount } from '../../src/shared/types'
import { git, makeRemotePair } from '../helpers/repo'

export interface FakeCall {
  method: string
  /** Percorso con la query. */
  path: string
  body: unknown
  /** Header Authorization (GitHub) o PRIVATE-TOKEN (GitLab). */
  token: string | undefined
}

export interface FakeRoute {
  method: string
  /** Percorso senza query: testo esatto o espressione regolare. */
  path: string | RegExp
  status?: number
  body?: unknown
}

export const GITHUB_ACCOUNT: HostingAccount = { id: 'gh', service: 'github', host: 'github.example.test', username: 'ada' }
export const GITLAB_ACCOUNT: HostingAccount = { id: 'gl', service: 'gitlab', host: 'gitlab.example.test', username: 'ada' }

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : undefined
}

/**
 * Server locale che risponde come le API di GitHub (/github/…) e di GitLab (/gitlab/…).
 * Le rotte le dichiara il test; body può essere una funzione della chiamata. Il test legge poi le chiamate ricevute.
 */
export async function fakeHosting(routes: FakeRoute[]) {
  const calls: FakeCall[] = []
  const server = createServer((req, res) => {
    void readBody(req).then((body) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const token = (req.headers.authorization ?? req.headers['private-token']) as string | undefined
      const call: FakeCall = { method: req.method ?? 'GET', path: url.pathname + url.search, body, token }
      calls.push(call)
      const route = routes.find((r) => r.method === call.method && (typeof r.path === 'string' ? r.path === url.pathname : r.path.test(url.pathname)))
      const status = route ? (route.status ?? 200) : 404
      const data = route ? (typeof route.body === 'function' ? (route.body as (c: FakeCall) => unknown)(call) : route.body) : { message: 'Not Found' }
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(status === 204 || data === undefined ? '' : JSON.stringify(data))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, calls, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

/** Un clone con origin su un server fittizio: per Merlino sta su host/project, per git è un repo bare locale (insteadOf). */
export function hostedRepo(host: string, project: string): { bare: string; clone: string } {
  const { bare, clone } = makeRemotePair()
  const url = `https://${host}/${project}.git`
  git(clone, 'remote', 'set-url', 'origin', url)
  git(clone, 'config', `url.${bare}.insteadOf`, url)
  git(clone, 'fetch', '-q', 'origin')
  return { bare, clone }
}

/** Un account già collegato nella cartella dati. Negli E2E i token non sono cifrati (vedi hosting/ipc.ts). */
export function seedAccount(userData: string, account: HostingAccount, token: string): void {
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ accounts: [account] }))
  writeFileSync(join(userData, 'tokens.json'), JSON.stringify({ [account.id]: Buffer.from(token).toString('base64') }))
}

/** Una PR come la dà l'API di GitHub. */
export const ghPull = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `PR ${n}`,
  body: '',
  state: 'open',
  draft: false,
  merged_at: null,
  user: { login: 'grace' },
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-21T10:00:00Z',
  html_url: `https://github.example.test/ada/demo/pull/${n}`,
  head: { ref: 'feature/login', sha: 'a'.repeat(40), repo: { full_name: 'ada/demo' } },
  base: { ref: 'main', sha: 'b'.repeat(40) },
  ...extra,
})

/** Una merge request come la dà l'API di GitLab. */
export const glMergeRequest = (iid: number, extra: Record<string, unknown> = {}) => ({
  iid,
  title: `MR ${iid}`,
  description: '',
  state: 'opened',
  draft: false,
  author: { username: 'grace' },
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-21T10:00:00Z',
  web_url: `https://gitlab.example.test/group/demo/-/merge_requests/${iid}`,
  source_branch: 'feature/export',
  target_branch: 'main',
  sha: 'c'.repeat(40),
  source_project_id: 7,
  target_project_id: 7,
  user_notes_count: 3,
  ...extra,
})
```

- [ ] **Step 2: E2E dell'account (fallisce)**

`test/e2e/pull-requests.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Impostazioni → Account: collega con il token, che non finisce in settings.json; poi lo rimuove', async () => {
  const server = await fakeHosting([{ method: 'GET', path: '/github/user', body: { login: 'ada' } }])
  const { app, page, userData } = await launch([], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByText('Open Repository…')).toBeVisible()
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-accounts').click()
  await page.getByTestId('account-host').fill('github.example.test')
  await page.getByTestId('account-token').fill('tok-segreto')
  await page.getByTestId('account-connect').click()
  await expect(page.getByTestId('account-message')).toHaveText('Connected as ada (github.example.test)')
  await expect(page.getByTestId('account-row')).toContainText('ada@github.example.test')
  expect(server.calls[0]).toMatchObject({ method: 'GET', path: '/github/user', token: 'Bearer tok-segreto' })
  expect(readFileSync(join(userData, 'settings.json'), 'utf8')).not.toContain('tok-segreto')
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('account-remove').click()
  await expect(page.getByTestId('account-row')).toHaveCount(0)
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: FAIL, non c'è la sezione Account.

- [ ] **Step 3: Testi**

`en.ts`:

```ts
  'settings.accounts': 'Accounts',
  'accounts.hint': 'Accounts are used for pull and merge requests. The token stays encrypted in the system keychain.',
  'accounts.list': 'Connected accounts',
  'accounts.none': 'No accounts yet.',
  'accounts.add': 'Add account',
  'accounts.service': 'Service',
  'accounts.server': 'Server',
  'accounts.token': 'Token',
  'accounts.createToken': 'Create Token…',
  'accounts.githubScopes': 'A classic token with the repo scope.',
  'accounts.gitlabScopes': 'A personal access token with the api scope.',
  'accounts.connect': 'Connect',
  'accounts.checking': 'Checking…',
  'accounts.connected': 'Connected as {user} ({host})',
  'accounts.remove': 'Remove',
  'accounts.confirmRemove': 'Remove the account {account}? Its token is deleted from Merlino.',
  'accounts.automatic': 'Automatic',
  'common.openInBrowser': 'Open in Browser',
  'ctx.account': 'Account…',
```

`it.ts`:

```ts
  'settings.accounts': 'Account',
  'accounts.hint': 'Gli account servono per pull e merge request. Il token resta cifrato nel portachiavi del sistema.',
  'accounts.list': 'Account collegati',
  'accounts.none': 'Nessun account.',
  'accounts.add': 'Aggiungi account',
  'accounts.service': 'Servizio',
  'accounts.server': 'Server',
  'accounts.token': 'Token',
  'accounts.createToken': 'Crea token…',
  'accounts.githubScopes': 'Un token classico con il permesso repo.',
  'accounts.gitlabScopes': 'Un token personale con il permesso api.',
  'accounts.connect': 'Collega',
  'accounts.checking': 'Verifica…',
  'accounts.connected': 'Connesso come {user} ({host})',
  'accounts.remove': 'Rimuovi',
  'accounts.confirmRemove': "Rimuovere l'account {account}? Il suo token viene cancellato da Merlino.",
  'accounts.automatic': 'Automatico',
  'common.openInBrowser': 'Apri nel browser',
  'ctx.account': 'Account…',
```

- [ ] **Step 4: Store dell'app (`src/renderer/stores/app.ts`)**

- `SettingsSection` diventa `'general' | 'commit' | 'diff' | 'integrations' | 'accounts' | 'git'`.
- Aggiungi `HostingService` all'import dei tipi.
- Dopo `settingsSection` aggiungi:

```ts
  /** Server proposto in Impostazioni → Account quando si arriva da "Collega account…". */
  const accountHost = ref<string | null>(null)

  /** null se l'account è collegato; altrimenti il messaggio d'errore, da mostrare nel modulo. */
  async function addAccount(service: HostingService, host: string, token: string): Promise<string | null> {
    const r = await window.api.addAccount(service, host, token)
    if (!r.ok) return r.error.message
    settings.value = r.value
    return null
  }

  async function removeAccount(id: string) {
    const r = await window.api.removeAccount(id)
    if (r.ok) settings.value = r.value
    else error.value = r.error.message
  }

  async function setRemoteAccount(root: string, remote: string, id: string | null) {
    const r = await window.api.setRemoteAccount(root, remote, id)
    if (r.ok) settings.value = r.value
    else error.value = r.error.message
  }

  /** Apre Impostazioni → Account con il server già scritto. */
  function connectAccount(host: string) {
    accountHost.value = host
    settingsSection.value = 'accounts'
  }
```

- Nel `return` aggiungi `accountHost, addAccount, removeAccount, setRemoteAccount, connectAccount`.

- [ ] **Step 5: `src/renderer/components/settings/AccountSettings.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { accountLabel } from '../../../shared/hosting'
import type { HostingAccount, HostingService } from '../../../shared/types'
import { t } from '../../i18n'
import { useAppStore } from '../../stores/app'

const app = useAppStore()
const DEFAULT_HOST: Record<HostingService, string> = { github: 'github.com', gitlab: 'gitlab.com' }
const SERVICE_NAME: Record<HostingService, string> = { github: 'GitHub', gitlab: 'GitLab' }
// Da "Collega account…": il server del remote, e il servizio intuito dal nome
const service = ref<HostingService>(app.accountHost?.includes('gitlab') ? 'gitlab' : 'github')
const host = ref(app.accountHost ?? DEFAULT_HOST.github)
const token = ref('')
const busy = ref(false)
const message = ref<{ error: boolean; text: string } | null>(null)

watch(service, (now, before) => {
  if (host.value === DEFAULT_HOST[before]) host.value = DEFAULT_HOST[now]
})

/** La pagina di creazione del token, già compilata con nome e permessi. */
function tokenUrl(): string {
  const h = host.value.trim() || DEFAULT_HOST[service.value]
  return service.value === 'github'
    ? `https://${h}/settings/tokens/new?scopes=repo&description=Merlino`
    : `https://${h}/-/user_settings/personal_access_tokens?name=Merlino&scopes=api`
}

// window.open passa da setWindowOpenHandler del main, che apre solo http(s) nel browser
const open = (url: string) => window.open(url)

async function connect() {
  busy.value = true
  message.value = null
  const h = host.value.trim().toLowerCase()
  const error = await app.addAccount(service.value, h, token.value.trim())
  busy.value = false
  if (error) {
    message.value = { error: true, text: error }
    return
  }
  const account = app.settings?.accounts.findLast((a) => a.service === service.value && a.host === h)
  message.value = { error: false, text: t('accounts.connected', { user: account?.username ?? '', host: h }) }
  token.value = ''
}

function remove(account: HostingAccount) {
  if (window.confirm(t('accounts.confirmRemove', { account: accountLabel(account) }))) void app.removeAccount(account.id)
}
</script>

<template>
  <form class="settings-form" @submit.prevent="connect">
    <h2>{{ t('accounts.list') }}</h2>
    <p class="hint full">{{ t('accounts.hint') }}</p>
    <p v-if="!app.settings?.accounts.length" class="hint full">{{ t('accounts.none') }}</p>
    <template v-for="a in app.settings?.accounts ?? []" :key="a.id">
      <label>{{ SERVICE_NAME[a.service] }}</label>
      <div class="row" data-testid="account-row">
        <span class="name">{{ accountLabel(a) }}</span>
        <button type="button" @click="open(`https://${a.host}/${a.username}`)">{{ t('common.openInBrowser') }}</button>
        <button type="button" data-testid="account-remove" @click="remove(a)">{{ t('accounts.remove') }}</button>
      </div>
    </template>

    <h2>{{ t('accounts.add') }}</h2>
    <label for="account-service">{{ t('accounts.service') }}</label>
    <select id="account-service" v-model="service" data-testid="account-service">
      <option value="github">GitHub</option>
      <option value="gitlab">GitLab</option>
    </select>
    <label for="account-host">{{ t('accounts.server') }}</label>
    <input id="account-host" v-model="host" data-testid="account-host" spellcheck="false" />
    <label for="account-token">{{ t('accounts.token') }}</label>
    <div class="row">
      <input id="account-token" v-model="token" type="password" autocomplete="off" data-testid="account-token" />
      <button type="button" @click="open(tokenUrl())">{{ t('accounts.createToken') }}</button>
    </div>
    <p class="hint">{{ service === 'github' ? t('accounts.githubScopes') : t('accounts.gitlabScopes') }}</p>
    <span />
    <div class="row">
      <button class="primary" data-testid="account-connect" :disabled="busy || !token.trim() || !host.trim()">
        {{ busy ? t('accounts.checking') : t('accounts.connect') }}
      </button>
    </div>
    <p v-if="message" class="hint" :class="{ error: message.error }" data-testid="account-message">{{ message.text }}</p>
  </form>
</template>

<style scoped>
.hint.full { grid-column: 1 / -1; margin: -2px 0 2px; }
.name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
input:not([type]), input[type='password'] { width: min(100%, 420px); }
</style>
```

- [ ] **Step 6: La sezione nelle Impostazioni**

In `src/renderer/components/SettingsView.vue` importa `AccountSettings from './settings/AccountSettings.vue'` e in `SECTIONS`, dopo `integrations`:

```ts
  { id: 'accounts', title: 'settings.accounts', component: AccountSettings },
```

- [ ] **Step 7: "Account…" nel menu del remote (`src/renderer/actions/branches.ts`)**

Aggiungi l'import `import { accountLabel, remoteAccountKey } from '../../shared/hosting'` e, prima di `remoteMenu`:

```ts
/** Sceglie l'account per le pull request del remote: automatico (stesso host) o uno qualsiasi, per alias SSH e più account. */
async function chooseAccount(repo: Repo, remote: RemoteInfo) {
  const app = useAppStore()
  const chosen = app.settings?.remoteAccounts[remoteAccountKey(repo.root, remote.name)] ?? null
  const mark = (on: boolean) => (on ? '✓ ' : '')
  await popup([
    { label: `${mark(chosen === null)}${t('accounts.automatic')}`, run: () => app.setRemoteAccount(repo.root, remote.name, null) },
    null,
    ...(app.settings?.accounts ?? []).map((a) => ({
      label: `${mark(chosen === a.id)}${accountLabel(a)}`,
      run: () => app.setRemoteAccount(repo.root, remote.name, a.id),
    })),
  ])
}
```

In `remoteMenu`, metti come prima voce `{ label: t('ctx.account'), run: () => chooseAccount(repo, remote) },` seguita da `null,`, prima di "Rimuovi".

Run: `npm run typecheck && npm run lint && npx vitest run test/unit/i18n.test.ts && npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: tutto verde.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/settings/AccountSettings.vue src/renderer/components/SettingsView.vue src/renderer/stores/app.ts src/renderer/actions/branches.ts src/shared/i18n/en.ts src/shared/i18n/it.ts test/e2e/fake-hosting.ts test/e2e/pull-requests.spec.ts
git commit -m "feat: Impostazioni → Account e scelta dell'account dal menu del remote"
```

---

### Task 9: Vista Pull requests e lista

**Files:**
- Create: `src/renderer/stores/pull-requests.ts`, `src/renderer/components/PullRequestList.vue`, `src/renderer/components/PullRequestDetail.vue`, `src/renderer/actions/pull-requests.ts`
- Modify:
  - `src/renderer/components/RepoView.vue`, `src/renderer/components/RepoSidebar.vue`;
  - `src/renderer/App.vue`, `src/renderer/stores/app.ts`;
  - `src/renderer/actions/working.ts`;
  - `src/shared/shortcuts.ts`, `src/main/menu.ts`;
  - `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`.
- Test: `test/e2e/pull-requests.spec.ts`

**Interfaces:**
- Consumes: `Api.pullRequestTarget`, `pullRequests`, `pullRequestChecks`, `pullRequestDetail` (Task 7); `app.connectAccount` (Task 8).
- Produces:
  - `usePullRequestStore(root)` con:
    - stato: `visible`, `remotes`, `remote`, `current`, `usable`, `ready`, `filter`, `query`, `list`, `shown`, `openCount`, `loading`, `busy`, `error`, `errorCode`, `stale`, `ci`, `selected`, `detail`, `tab`;
    - funzioni: `show(on)`, `load()`, `loadChecks(prs, force?)`, `select(n)`, `loadDetail()`, `refresh()`, `setError(info)`, `stopTimer()`.
  - `disposePullRequestStore(root)`.
  - Scorciatoie `view.history` (<kbd>⌘1</kbd>) e `view.pullRequests` (<kbd>⌘2</kbd>).
  - `registerPullRequestActions()`.

- [ ] **Step 1: E2E della lista (fallisce)**

In `test/e2e/pull-requests.spec.ts` aggiungi agli import:
- da `./fake-hosting`: `ghPull`, `glMergeRequest`, `GITHUB_ACCOUNT`, `GITLAB_ACCOUNT`, `hostedRepo`, `seedAccount`;

poi aggiungi in fondo al file:

```ts
const ONE = '1'.repeat(40)
const TWO = '2'.repeat(40)
const ok = (state: string) => ({ statuses: [{ context: 'ci', state, target_url: null }] })

test('vista Pull requests: numero nella sidebar, lista con CI, ricerca, filtro e ritorno alla storia', async () => {
  const { clone } = hostedRepo('github.example.test', 'ada/demo')
  const userData = tempUserData()
  seedAccount(userData, GITHUB_ACCOUNT, 'tok')
  const server = await fakeHosting([
    {
      method: 'GET',
      path: '/github/repos/ada/demo/pulls',
      body: (call: { path: string }) =>
        call.path.includes('state=open')
          ? [
              ghPull(1, { title: 'feat: login', head: { ref: 'feature/login', sha: ONE, repo: { full_name: 'ada/demo' } } }),
              ghPull(2, { title: 'fix: header', user: { login: 'ada' }, head: { ref: 'fix/header', sha: TWO, repo: { full_name: 'ada/demo' } } }),
            ]
          : [ghPull(3, { title: 'docs: readme', state: 'closed', merged_at: '2026-10-22T10:00:00Z' })],
    },
    { method: 'GET', path: /\/commits\/1+\/status$/, body: ok('success') },
    { method: 'GET', path: /\/commits\/2+\/status$/, body: ok('failure') },
    { method: 'GET', path: /\/commits\/a+\/status$/, body: ok('success') },
    { method: 'GET', path: /\/check-runs$/, body: { check_runs: [] } },
  ])
  const { app, page } = await launch([clone], userData, { MERLINO_E2E_API: server.url })
  await expect(page.getByTestId('pr-count')).toHaveText('2')
  await page.getByTestId('nav-pull-requests').click()
  const rows = page.getByTestId('pr-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByTestId('pr-ci')).toHaveText('✓')
  await expect(rows.nth(1).getByTestId('pr-ci')).toHaveText('✗')
  expect(server.calls.find((c) => c.path.startsWith('/github/repos/ada/demo/pulls'))?.token).toBe('Bearer tok')
  await page.getByTestId('pr-search').fill('header')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('fix: header')
  await page.getByTestId('pr-search').fill('')
  await page.getByTestId('pr-filter').selectOption('merged')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Merged')
  await page.keyboard.press(`${mod}+1`)
  await expect(page.getByTestId('commit-row').first()).toBeVisible()
  await page.keyboard.press(`${mod}+2`)
  await expect(page.getByTestId('pr-list')).toBeVisible()
  await app.close()
  await server.close()
})

test('remote su un server senza account: invito a collegarne uno', async () => {
  const { clone } = hostedRepo('github.example.test', 'ada/demo')
  const { app, page } = await launch([clone])
  await page.getByTestId('nav-pull-requests').click()
  await expect(page.getByTestId('pr-no-account')).toContainText('No account for github.example.test')
  await page.getByTestId('pr-connect').click()
  await expect(page.getByTestId('account-host')).toHaveValue('github.example.test')
  await app.close()
})

test('GitLab: merge request nella lista, con i commenti', async () => {
  const { clone } = hostedRepo('gitlab.example.test', 'group/demo')
  const userData = tempUserData()
  seedAccount(userData, GITLAB_ACCOUNT, 'tok-gl')
  const server = await fakeHosting([
    { method: 'GET', path: '/gitlab/projects/group%2Fdemo/merge_requests', body: [glMergeRequest(4, { title: 'feat: export' })] },
    { method: 'GET', path: '/gitlab/projects/group%2Fdemo/merge_requests/4', body: glMergeRequest(4, { head_pipeline: null }) },
  ])
  const { app, page } = await launch([clone], userData, { MERLINO_E2E_API: server.url })
  await page.getByTestId('nav-pull-requests').click()
  await expect(page.getByTestId('pr-row')).toContainText('feat: export')
  await expect(page.getByTestId('pr-row')).toContainText('💬 3')
  expect(server.calls[0].token).toBe('tok-gl')
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: i tre test nuovi FAIL (manca `nav-pull-requests`).

- [ ] **Step 2: Testi**

`en.ts`:

```ts
  'sidebar.history': 'History',
  'sidebar.pullRequests': 'Pull Requests',
  'action.view.history': 'History',
  'action.view.pullRequests': 'Pull Requests',
  'action.pr.refresh': 'Refresh Pull Requests',
  'prs.search': 'Search title, description, author, branch',
  'prs.filter.open': 'Open',
  'prs.filter.merged': 'Merged',
  'prs.filter.closed': 'Closed',
  'prs.filter.all': 'All',
  'prs.state.open': 'Open',
  'prs.state.merged': 'Merged',
  'prs.state.closed': 'Closed',
  'prs.draft': 'Draft',
  'prs.refresh': 'Refresh',
  'prs.none': 'No pull requests',
  'prs.noRemote': 'This repository has no remote on GitHub or GitLab.',
  'prs.noAccount': 'No account for {host}',
  'prs.connect': 'Connect Account…',
  'prs.updateToken': 'Update Token…',
  'prs.stale': 'Not up to date',
  'prs.selectOne': 'Select a pull request',
```

`it.ts`:

```ts
  'sidebar.history': 'Storia',
  'sidebar.pullRequests': 'Pull request',
  'action.view.history': 'Storia',
  'action.view.pullRequests': 'Pull request',
  'action.pr.refresh': 'Aggiorna le pull request',
  'prs.search': 'Cerca titolo, descrizione, autore, branch',
  'prs.filter.open': 'Aperte',
  'prs.filter.merged': 'Unite',
  'prs.filter.closed': 'Chiuse',
  'prs.filter.all': 'Tutte',
  'prs.state.open': 'Aperta',
  'prs.state.merged': 'Unita',
  'prs.state.closed': 'Chiusa',
  'prs.draft': 'Bozza',
  'prs.refresh': 'Aggiorna',
  'prs.none': 'Nessuna pull request',
  'prs.noRemote': 'Questo repository non ha remote su GitHub o GitLab.',
  'prs.noAccount': 'Nessun account per {host}',
  'prs.connect': 'Collega account…',
  'prs.updateToken': 'Aggiorna token…',
  'prs.stale': 'Non aggiornata',
  'prs.selectOne': 'Seleziona una pull request',
```

- [ ] **Step 3: Scorciatoie e menu**

In `src/shared/shortcuts.ts`, in `shortcuts`:

```ts
  'view.history': { key: '1', mod: true },
  'view.pullRequests': { key: '2', mod: true },
```

In `src/main/menu.ts`, all'inizio del `submenu` di `menu.view`:

```ts
        action('view.history'),
        action('view.pullRequests'),
        { type: 'separator' },
```

- [ ] **Step 4: `src/renderer/stores/pull-requests.ts`**

```ts
import { defineStore, getActivePinia } from 'pinia'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type { CiStatus, GitErrorInfo, HostingTarget, PullRequest, PullRequestDetail, PullRequestFilter } from '../../shared/types'
import { useAppStore } from './app'
import { useRepoStore } from './repo'

const storeId = (root: string) => `prs:${root}`
const CI_WORKERS = 4
const CI_POLL_MS = 30_000

// Il remote scelto è una comodità di chi usa l'app: se il browser non lo ricorda, si riparte da origin
function savedRemote(root: string): string | null {
  try {
    return localStorage.getItem(`merlino.prRemote:${root}`)
  } catch {
    return null
  }
}

function saveRemote(root: string, remote: string) {
  try {
    localStorage.setItem(`merlino.prRemote:${root}`, remote)
  } catch {
    // niente memoria: alla prossima apertura si riparte da origin
  }
}

function define(root: string) {
  return defineStore(storeId(root), () => {
    const app = useAppStore()
    const repo = useRepoStore(root)

    /** La vista Pull requests al posto della storia. */
    const visible = ref(false)
    /** I remote con un server riconosciuto, con il loro account (se c'è). */
    const remotes = shallowRef<{ name: string; target: HostingTarget }[]>([])
    const remote = ref<string | null>(null)
    const current = computed(() => remotes.value.find((r) => r.name === remote.value)?.target ?? null)
    const usable = computed(() => remotes.value.filter((r) => r.target.account))
    const ready = computed(() => !!current.value?.account)

    const filter = ref<PullRequestFilter>('open')
    const query = ref('')
    const list = shallowRef<PullRequest[]>([])
    /** Le PR aperte del remote scelto, per il numero nella sidebar. */
    const openCount = ref(0)
    const loading = ref(false)
    /** Un'azione sulla PR in corso. */
    const busy = ref(false)
    const error = ref<string | null>(null)
    const errorCode = ref<GitErrorInfo['code'] | null>(null)
    /** La lista mostrata è quella di prima: l'ultimo aggiornamento è fallito. */
    const stale = ref(false)
    /** Stato della CI per SHA. */
    const ci = reactive(new Map<string, CiStatus>())

    const selected = ref<number | null>(null)
    const detail = shallowRef<PullRequestDetail | null>(null)
    const tab = ref<'conversation' | 'commits' | 'changes'>('conversation')
    let listRequest = 0
    let detailRequest = 0

    const shown = computed(() => {
      const q = query.value.trim().toLowerCase()
      if (!q) return list.value
      return list.value.filter((p) => [`#${p.number}`, p.title, p.body, p.author, p.head.branch, p.base.branch].some((s) => s.toLowerCase().includes(q)))
    })

    function setError(info: GitErrorInfo) {
      error.value = info.message
      errorCode.value = info.code ?? null
    }

    function show(on: boolean) {
      visible.value = on
    }

    async function loadTargets() {
      const names = (repo.refs?.remotes ?? []).map((r) => r.name)
      const results = await Promise.all(names.map(async (name) => ({ name, r: await window.api.pullRequestTarget(root, name) })))
      remotes.value = results.flatMap(({ name, r }) => (r.ok && r.value ? [{ name, target: r.value }] : []))
      const pick = (items: { name: string }[]) => items.find((x) => x.name === savedRemote(root)) ?? items.find((x) => x.name === 'origin') ?? items[0]
      remote.value = (pick(usable.value) ?? pick(remotes.value))?.name ?? null
    }

    async function load() {
      const request = ++listRequest
      const name = remote.value
      if (!name || !ready.value) {
        list.value = []
        openCount.value = 0
        return
      }
      loading.value = true
      const r = await window.api.pullRequests(root, name, filter.value)
      if (request !== listRequest) return
      loading.value = false
      if (!r.ok) {
        setError(r.error)
        stale.value = list.value.length > 0
        return
      }
      error.value = null
      errorCode.value = null
      stale.value = false
      list.value = r.value
      if (filter.value === 'open') openCount.value = r.value.length
      void loadChecks(r.value)
    }

    /** Stato della CI, quattro richieste alla volta; force ricarica anche quelli già noti. */
    async function loadChecks(prs: PullRequest[], force = false) {
      const name = remote.value
      if (!name) return
      const queue = prs.filter((p) => force || !ci.has(p.head.sha) || ci.get(p.head.sha)?.state === 'pending')
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          const r = await window.api.pullRequestChecks(root, name, p.number, p.head.sha)
          if (r.ok) ci.set(p.head.sha, r.value)
        }
      }
      await Promise.all(Array.from({ length: CI_WORKERS }, worker))
    }

    async function select(number: number) {
      selected.value = number
      tab.value = 'conversation'
      detail.value = null
      await loadDetail()
    }

    async function loadDetail() {
      const n = selected.value
      const name = remote.value
      if (n === null || !name) return
      const request = ++detailRequest
      const r = await window.api.pullRequestDetail(root, name, n)
      if (request !== detailRequest) return
      if (!r.ok) {
        setError(r.error)
        return
      }
      detail.value = r.value
      void loadChecks([r.value.pr], true)
    }

    async function refresh() {
      await Promise.all([load(), loadDetail()])
    }

    // Finché la vista è aperta, le CI in corso si ricontrollano ogni 30 secondi
    let timer: ReturnType<typeof setInterval> | undefined
    function stopTimer() {
      clearInterval(timer)
    }
    watch(
      visible,
      (on) => {
        stopTimer()
        if (!on) return
        timer = setInterval(() => {
          const pending = list.value.filter((p) => ci.get(p.head.sha)?.state === 'pending')
          if (pending.length) void loadChecks(pending)
        }, CI_POLL_MS)
      },
      { immediate: true },
    )

    // Fetch e push cambiano i ref remoti, le Impostazioni cambiano gli account: lista e numero si ricaricano
    const remotesKey = computed(() => (repo.refs?.remotes ?? []).map((r) => `${r.name} ${r.url} ${r.branches.map((b) => b.sha).join(',')}`).join('|'))
    const accountsKey = computed(() => JSON.stringify([app.settings?.accounts, app.settings?.remoteAccounts]))
    watch(
      [remotesKey, accountsKey],
      async () => {
        await loadTargets()
        await load()
      },
      { immediate: true },
    )
    watch(remote, (name) => {
      if (name) saveRemote(root, name)
    })
    watch([remote, filter], () => {
      selected.value = null
      detail.value = null
      void load()
    })

    return {
      root, visible, remotes, remote, current, usable, ready, filter, query, list, shown, openCount, loading, busy, error, errorCode, stale, ci,
      selected, detail, tab, show, load, loadChecks, select, loadDetail, refresh, setError, stopTimer,
    }
  })
}

const definitions = new Map<string, ReturnType<typeof define>>()

/** Uno store per ogni repo aperto, come useRepoStore. */
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
  const store = useStore()
  store.stopTimer()
  store.$dispose()
  delete getActivePinia()?.state.value[storeId(root)]
  definitions.delete(root)
}
```

In `src/renderer/stores/app.ts` importa `disposePullRequestStore` da `'./pull-requests'` e in `close`, prima di `disposeRepoStore(root)`, aggiungi `disposePullRequestStore(root)`.

- [ ] **Step 5: `src/renderer/components/PullRequestList.vue`**

```vue
<script setup lang="ts">
import type { MessageKey } from '../../shared/i18n'
import type { PullRequest, PullRequestFilter } from '../../shared/types'
import { formatShortDate } from '../history/format'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { usePullRequestStore } from '../stores/pull-requests'

const props = defineProps<{ root: string }>()
const app = useAppStore()
const prs = usePullRequestStore(props.root)
const FILTERS: PullRequestFilter[] = ['open', 'merged', 'closed', 'all']
const CI_ICONS: Record<string, string> = { success: '✓', failure: '✗', pending: '●' }
const ciState = (pr: PullRequest) => prs.ci.get(pr.head.sha)?.state ?? 'none'
const head = (pr: PullRequest) => (pr.head.fork ? `${pr.head.fork}:${pr.head.branch}` : pr.head.branch)
</script>

<template>
  <section class="pr-list" data-testid="pr-list">
    <header>
      <input v-model="prs.query" type="search" :placeholder="t('prs.search')" data-testid="pr-search" />
      <select v-model="prs.filter" data-testid="pr-filter">
        <option v-for="f in FILTERS" :key="f" :value="f">{{ t(`prs.filter.${f}` as MessageKey) }}</option>
      </select>
      <select v-if="prs.usable.length > 1" v-model="prs.remote" data-testid="pr-remote">
        <option v-for="r in prs.usable" :key="r.name" :value="r.name">{{ r.name }}</option>
      </select>
      <button :aria-label="t('prs.refresh')" :disabled="prs.loading" data-testid="pr-refresh" @click="prs.refresh()">↻</button>
    </header>
    <p v-if="prs.error" class="error message" data-testid="pr-error">
      <span>{{ prs.error }}</span>
      <button v-if="prs.errorCode === 'auth'" @click="app.connectAccount(prs.current?.host ?? '')">{{ t('prs.updateToken') }}</button>
    </p>
    <p v-if="!prs.current" class="muted empty">{{ t('prs.noRemote') }}</p>
    <div v-else-if="!prs.ready" class="empty" data-testid="pr-no-account">
      <p>{{ t('prs.noAccount', { host: prs.current?.host ?? '' }) }}</p>
      <button class="primary" data-testid="pr-connect" @click="app.connectAccount(prs.current?.host ?? '')">{{ t('prs.connect') }}</button>
    </div>
    <template v-else>
      <p v-if="prs.stale" class="muted note">{{ t('prs.stale') }}</p>
      <p v-if="!prs.shown.length && !prs.loading" class="muted empty">{{ t('prs.none') }}</p>
      <ul>
        <li
          v-for="pr in prs.shown"
          :key="pr.number"
          :class="{ selected: pr.number === prs.selected }"
          data-testid="pr-row"
          @click="prs.select(pr.number)"
        >
          <div class="line">
            <span class="title"><span class="number">#{{ pr.number }}</span> {{ pr.title }}</span>
            <span v-if="pr.draft" class="badge">{{ t('prs.draft') }}</span>
            <span v-if="pr.state !== 'open'" class="badge" :class="pr.state">{{ t(`prs.state.${pr.state}` as MessageKey) }}</span>
            <span class="ci" :class="ciState(pr)" data-testid="pr-ci">{{ CI_ICONS[ciState(pr)] ?? '' }}</span>
          </div>
          <div class="line meta">
            <span class="info">{{ pr.author }} · {{ formatShortDate(pr.updatedAt) }} · {{ head(pr) }} → {{ pr.base.branch }}</span>
            <span v-if="pr.comments">💬 {{ pr.comments }}</span>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.pr-list { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--border); }
header { display: flex; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
header input { flex: 1; min-width: 0; }
header button { padding: 2px 8px; }
ul { flex: 1; min-height: 0; margin: 0; padding: 0; list-style: none; overflow: auto; }
li { padding: 5px 10px; border-bottom: 1px solid var(--border); cursor: default; }
li:hover { background: var(--bg-hover); }
li.selected { background: var(--accent); color: var(--accent-fg); }
li.selected .meta, li.selected .number { color: inherit; }
.line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.number { color: var(--fg-muted); }
.meta { font-size: 12px; color: var(--fg-muted); }
.info { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { padding: 0 6px; border-radius: 8px; background: var(--bg-hover); color: var(--fg); font-size: 11px; }
.badge.merged { background: #8250df; color: #fff; }
.ci { width: 14px; text-align: center; }
.ci.success { color: #1a7f37; }
.ci.failure { color: var(--danger); }
.ci.pending { color: #bf8700; }
.message { display: flex; align-items: center; gap: 8px; margin: 0; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.message span { flex: 1; }
.empty { margin: 0; padding: 16px; text-align: center; }
.note { margin: 0; padding: 4px 10px; font-size: 12px; }
</style>
```

- [ ] **Step 6: `src/renderer/components/PullRequestDetail.vue` (per ora solo lo stato vuoto; il Task 10 lo completa)**

```vue
<script setup lang="ts">
import { t } from '../i18n'
</script>

<template>
  <section class="pr-detail">
    <p class="muted center">{{ t('prs.selectOne') }}</p>
  </section>
</template>

<style scoped>
.pr-detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.center { margin: auto; }
</style>
```

- [ ] **Step 7: Vista in `RepoView.vue` e voci della sidebar**

In `src/renderer/components/RepoView.vue`:
- importa `usePullRequestStore`, `PullRequestList` e `PullRequestDetail`;
- aggiungi `const prs = usePullRequestStore(props.root)`;
- sostituisci il contenuto di `<div class="panes">` con:

```vue
      <RepoSidebar :root="root" />
      <template v-if="prs.visible">
        <PullRequestList :root="root" />
        <PullRequestDetail :root="root" />
      </template>
      <template v-else>
        <HistoryView :root="root" />
        <WorkingView v-if="repo.view === 'working'" :root="root" />
        <CommitDetail v-else :root="root" />
      </template>
```

In `src/renderer/components/RepoSidebar.vue`:
- importa `usePullRequestStore` e aggiungi `const prs = usePullRequestStore(props.root)`;
- come primo figlio di `<aside class="sidebar">` aggiungi:

```vue
    <nav class="views">
      <button :class="{ active: !prs.visible }" data-testid="nav-history" @click="prs.show(false)">{{ t('sidebar.history') }}</button>
      <button :class="{ active: prs.visible }" data-testid="nav-pull-requests" @click="prs.show(true)">
        {{ t('sidebar.pullRequests') }}
        <span v-if="prs.openCount" class="count" data-testid="pr-count">{{ prs.openCount }}</span>
      </button>
    </nav>
```

e nello stile:

```css
.views { display: flex; flex-direction: column; gap: 2px; padding: 8px 6px 4px; }
.views button { display: flex; align-items: center; gap: 6px; text-align: left; border: 0; background: transparent; padding: 4px 10px; }
.views button:hover { background: var(--bg-hover); }
.views button.active { background: var(--selected-bg); font-weight: 600; }
.views .count { margin-left: auto; padding: 0 6px; border-radius: 8px; background: var(--bg-hover); font-size: 11px; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 8: Azioni (`src/renderer/actions/pull-requests.ts`) e un <kbd>⌘↩</kbd> che non deve committare di nascosto**

```ts
import { shortcuts } from '../../shared/shortcuts'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { usePullRequestStore } from '../stores/pull-requests'
import { registry } from './builtin'

/** La vista Pull requests e le azioni sulle PR del repo della tab attiva. */
export function registerPullRequestActions(): void {
  const app = useAppStore()
  const prs = () => (app.active ? usePullRequestStore(app.active) : null)
  const hasRepo = () => app.active !== null

  registry.register(
    {
      id: 'view.history',
      get title() {
        return t('action.view.history')
      },
      keys: shortcuts['view.history'],
      when: hasRepo,
      run: () => prs()?.show(false),
    },
    {
      id: 'view.pullRequests',
      get title() {
        return t('action.view.pullRequests')
      },
      keys: shortcuts['view.pullRequests'],
      when: hasRepo,
      run: () => prs()?.show(true),
    },
    {
      id: 'pr.refresh',
      get title() {
        return t('action.pr.refresh')
      },
      when: () => !!prs()?.ready,
      run: () => prs()?.refresh(),
    },
  )
}
```

In `src/renderer/App.vue` importa `registerPullRequestActions` e chiamala dopo `registerBranchActions()`.

In `src/renderer/actions/working.ts`, l'azione `working.commit` non deve partire mentre è aperta la vista Pull requests, dove il commit non si vede:
- importa `usePullRequestStore`;
- il suo `when` diventa:

```ts
      when: () => repo()?.view === 'working' && repo()?.canCommit === true && !(app.active && usePullRequestStore(app.active).visible),
```

Run: `npm run typecheck && npm run lint && npx vitest run && npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: tutto verde.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stores/pull-requests.ts src/renderer/stores/app.ts src/renderer/components/PullRequestList.vue src/renderer/components/PullRequestDetail.vue src/renderer/components/RepoView.vue src/renderer/components/RepoSidebar.vue src/renderer/actions/pull-requests.ts src/renderer/actions/working.ts src/renderer/App.vue src/shared/shortcuts.ts src/main/menu.ts src/shared/i18n/en.ts src/shared/i18n/it.ts test/e2e/pull-requests.spec.ts
git commit -m "feat: vista Pull requests con lista, CI, ricerca e filtro"
```

---

### Task 10: Dettaglio (conversazione, commit, modifiche), commento, chiusura e riapertura

**Files:**
- Create: `src/renderer/markdown.ts`, `src/renderer/components/PullRequestConversation.vue`, `src/renderer/components/PullRequestCommits.vue`, `src/renderer/components/PullRequestChanges.vue`
- Modify: `package.json`, `package-lock.json`, `src/renderer/stores/pull-requests.ts`, `src/renderer/components/PullRequestDetail.vue`, `src/renderer/styles.css`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/e2e/pull-requests.spec.ts`

**Interfaces:**
- Consumes:
  - `Api.pullRequestChanges`, `pullRequestFileDiff`, `pullRequestComment`, `pullRequestSetState` (Task 7);
  - store del Task 9;
  - `popup` da `actions/branches.ts`; `CommitDetail`, `DiffView`.
- Produces:
  - nello store:
    - stato: `changes`, `changesError`, `changesFile`, `changesDiff`, `commit`;
    - funzioni: `openTab(name)`, `loadChanges()`, `selectChangesFile(file)`, `loadChangesDiff(force?)`, `showCommit(sha)`, `act(op)`, `comment(body)`, `setState(state)`;
  - `renderMarkdown(text): string`.

- [ ] **Step 1: E2E del dettaglio (fallisce)**

In `test/e2e/pull-requests.spec.ts` aggiungi agli import:
- `cloneOf` e `git` da `'../helpers/repo'`;
- `writeFileSync` a quelli di `node:fs`;

poi in fondo:

```ts
/** Repo su un server fittizio con la PR #1 (due commit) pubblicata come refs/pull/1/head nel bare. */
function repoWithPullRequest() {
  const { bare, clone } = hostedRepo('github.example.test', 'ada/demo')
  const author = cloneOf(bare)
  git(author, 'switch', '-q', '-c', 'feature/login')
  for (const [file, text, message] of [['login.txt', 'login\n', 'feat: login'], ['file1.txt', 'cambiato\n', 'fix: file1']]) {
    writeFileSync(join(author, file), text)
    git(author, 'add', '.')
    git(author, 'commit', '-q', '-m', message)
  }
  git(author, 'push', '-q', 'origin', 'HEAD:refs/pull/1/head', 'HEAD:refs/heads/feature/login')
  return { bare, clone, author, head: git(author, 'rev-parse', 'HEAD').trim(), base: git(bare, 'rev-parse', 'main').trim() }
}

test('dettaglio: Markdown ripulito, commento, modifiche e commit da git, chiusura', async () => {
  const { clone, head, base } = repoWithPullRequest()
  const userData = tempUserData()
  seedAccount(userData, GITHUB_ACCOUNT, 'tok')
  let closed = false
  const comments = [{ id: 1, user: { login: 'grace' }, body: 'Serve un test', created_at: '2026-10-21T11:00:00Z' }]
  const pr = () =>
    ghPull(1, {
      title: 'feat: login',
      body: '**importante**\n\n<script>window.hacked = true</script>',
      state: closed ? 'closed' : 'open',
      head: { ref: 'feature/login', sha: head, repo: { full_name: 'ada/demo' } },
      base: { ref: 'main', sha: base },
      comments: comments.length,
      mergeable: true,
      mergeable_state: 'clean',
    })
  const server = await fakeHosting([
    { method: 'GET', path: '/github/repos/ada/demo/pulls', body: () => (closed ? [] : [pr()]) },
    { method: 'GET', path: '/github/repos/ada/demo/pulls/1', body: () => pr() },
    { method: 'GET', path: '/github/repos/ada/demo', body: { default_branch: 'main' } },
    { method: 'GET', path: '/github/repos/ada/demo/issues/1/comments', body: () => comments },
    {
      method: 'POST',
      path: '/github/repos/ada/demo/issues/1/comments',
      body: (call: { body: { body: string } }) => {
        comments.push({ id: 2, user: { login: 'ada' }, body: call.body.body, created_at: '2026-10-21T12:00:00Z' })
        return { id: 2 }
      },
    },
    {
      method: 'GET',
      path: '/github/repos/ada/demo/pulls/1/commits',
      body: [{ sha: head, commit: { message: 'fix: file1', author: { name: 'Grace Hopper', date: '2026-10-21T10:30:00Z' } }, author: { login: 'grace' } }],
    },
    {
      method: 'PATCH',
      path: '/github/repos/ada/demo/pulls/1',
      body: () => {
        closed = true
        return pr()
      },
    },
    { method: 'GET', path: /\/status$/, body: ok('success') },
    { method: 'GET', path: /\/check-runs$/, body: { check_runs: [] } },
  ])
  const { app, page } = await launch([clone], userData, { MERLINO_E2E_API: server.url })
  await page.getByTestId('nav-pull-requests').click()
  await page.getByTestId('pr-row').click()
  await expect(page.getByTestId('pr-header')).toContainText('feat: login')
  await expect(page.getByTestId('pr-body').locator('strong')).toHaveText('importante')
  await expect(page.getByTestId('pr-body').locator('script')).toHaveCount(0)
  expect(await page.evaluate(() => (globalThis as { hacked?: boolean }).hacked)).toBeUndefined()
  await expect(page.getByTestId('pr-comment')).toContainText('Serve un test')
  await expect(page.getByTestId('pr-ci-summary')).toContainText('1 passed')

  await page.getByTestId('pr-comment-text').fill('Fatto!')
  await page.getByTestId('pr-comment-text').press(`${mod}+Enter`)
  await expect(page.getByTestId('pr-comment')).toHaveCount(2)
  expect(server.calls.find((c) => c.method === 'POST')?.body).toEqual({ body: 'Fatto!' })

  await page.getByTestId('pr-tab-changes').click()
  await expect(page.getByTestId('pr-file')).toHaveCount(2)
  await expect(page.getByTestId('diff-line-add').first()).toBeVisible()
  await page.getByTestId('pr-tab-commits').click()
  await page.getByTestId('pr-commit').filter({ hasText: 'feat: login' }).click()
  await expect(page.getByTestId('commit-message')).toContainText('feat: login')
  await page.getByTestId('pr-commits-back').click()
  await expect(page.getByTestId('pr-commit')).toHaveCount(2)

  await page.getByTestId('pr-close').click()
  await expect(page.getByTestId('pr-reopen')).toBeVisible()
  expect(server.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ state: 'closed' })
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts -g dettaglio`
Expected: FAIL.

- [ ] **Step 2: Dipendenze per il Markdown**

```bash
npm install -D -E marked@18.1.0 dompurify@3.4.16
```

Controlla in `package.json` che le due versioni siano esatte, senza `^`.

- [ ] **Step 3: `src/renderer/markdown.ts`**

```ts
import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Le immagini non si caricano (la CSP ammette solo immagini locali): diventano link
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    image({ href, text }) {
      return `<a href="${href.replace(/"/g, '&quot;')}">${text || href}</a>`
    },
  },
})

// I link si aprono nel browser: target _blank passa da setWindowOpenHandler del main, che ammette solo http(s)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Markdown di GitHub e GitLab in HTML sicuro: niente script, stili, iframe o immagini remote. */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }), { FORBID_TAGS: ['style', 'img'], FORBID_ATTR: ['style'] })
}
```

In `src/renderer/styles.css`, in fondo:

```css
/* Markdown di pull request e commenti */
.md { line-height: 1.5; overflow-wrap: anywhere; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md p, .md ul, .md ol, .md pre, .md blockquote, .md table { margin: 0 0 8px; }
.md h1, .md h2, .md h3, .md h4 { margin: 12px 0 6px; font-size: 14px; }
.md code { padding: 1px 4px; border-radius: 4px; background: var(--bg-alt); font: 12px ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
.md pre { padding: 8px; border-radius: 5px; background: var(--bg-alt); overflow: auto; }
.md pre code { padding: 0; background: none; }
.md blockquote { padding-left: 10px; border-left: 3px solid var(--border); color: var(--fg-muted); }
.md table { border-collapse: collapse; }
.md th, .md td { padding: 3px 8px; border: 1px solid var(--border); }
.md a { color: var(--accent); }
```

- [ ] **Step 4: Testi**

`en.ts`:

```ts
  'prs.tab.conversation': 'Conversation',
  'prs.tab.commits': 'Commits',
  'prs.tab.changes': 'Changes',
  'prs.noDescription': 'No description.',
  'prs.commentPlaceholder': 'Leave a comment (Markdown)',
  'prs.comment': 'Comment',
  'prs.close': 'Close',
  'prs.reopen': 'Reopen',
  'prs.more': 'More',
  'prs.copyLink': 'Copy Link',
  'prs.back': '← Commits',
  'prs.loadingChanges': 'Downloading the pull request…',
  'prs.changesFailed': 'Could not download the pull request: {message}',
  'prs.ci.passed.one': '{count} passed',
  'prs.ci.passed.other': '{count} passed',
  'prs.ci.failed.one': '{count} failed',
  'prs.ci.failed.other': '{count} failed',
  'prs.ci.pending.one': '{count} running',
  'prs.ci.pending.other': '{count} running',
  'prs.ci.skipped.one': '{count} skipped',
  'prs.ci.skipped.other': '{count} skipped',
  'prs.check.success': 'passed',
  'prs.check.failure': 'failed',
  'prs.check.pending': 'running',
  'prs.check.skipped': 'skipped',
  'prs.check.cancelled': 'cancelled',
```

`it.ts`:

```ts
  'prs.tab.conversation': 'Conversazione',
  'prs.tab.commits': 'Commit',
  'prs.tab.changes': 'Modifiche',
  'prs.noDescription': 'Nessuna descrizione.',
  'prs.commentPlaceholder': 'Scrivi un commento (Markdown)',
  'prs.comment': 'Commenta',
  'prs.close': 'Chiudi',
  'prs.reopen': 'Riapri',
  'prs.more': 'Altro',
  'prs.copyLink': 'Copia link',
  'prs.back': '← Commit',
  'prs.loadingChanges': 'Scarico la pull request…',
  'prs.changesFailed': 'Non è stato possibile scaricare la pull request: {message}',
  'prs.ci.passed.one': '{count} superato',
  'prs.ci.passed.other': '{count} superati',
  'prs.ci.failed.one': '{count} fallito',
  'prs.ci.failed.other': '{count} falliti',
  'prs.ci.pending.one': '{count} in corso',
  'prs.ci.pending.other': '{count} in corso',
  'prs.ci.skipped.one': '{count} saltato',
  'prs.ci.skipped.other': '{count} saltati',
  'prs.check.success': 'superato',
  'prs.check.failure': 'fallito',
  'prs.check.pending': 'in corso',
  'prs.check.skipped': 'saltato',
  'prs.check.cancelled': 'annullato',
```

- [ ] **Step 5: Store: modifiche, commit, commento, stato**

In `src/renderer/stores/pull-requests.ts`:
- aggiungi agli import:
  - `Result` da `'../../shared/ipc'`;
  - `FileChange`, `FileDiff`, `PullRequestChanges` ai tipi.
- Dopo `let detailRequest = 0` aggiungi:

```ts
    // Commit e file della PR, letti con git la prima volta che servono
    const changes = shallowRef<PullRequestChanges | null>(null)
    const changesError = ref<string | null>(null)
    const changesFile = shallowRef<FileChange | null>(null)
    const changesDiff = shallowRef<FileDiff | null>(null)
    /** Commit della PR aperto nella scheda Commit: il dettaglio è quello dello store del repo. */
    const commit = ref<string | null>(null)

    function resetChanges() {
      changes.value = null
      changesError.value = null
      changesFile.value = null
      changesDiff.value = null
      commit.value = null
    }
```

- In `select`, dopo `detail.value = null`, aggiungi `resetChanges()`.
- In `loadDetail`, sostituisci `detail.value = r.value` con:

```ts
      // Nuovi commit sulla PR: commit e modifiche vanno riletti
      if (detail.value && detail.value.pr.head.sha !== r.value.pr.head.sha) resetChanges()
      detail.value = r.value
      if (tab.value !== 'conversation') void loadChanges()
```

- Dopo `refresh` aggiungi:

```ts
    async function loadChanges() {
      const d = detail.value
      const name = remote.value
      if (!d || !name || changes.value) return
      changesError.value = null
      const r = await window.api.pullRequestChanges(root, name, d.pr.number, d.pr.base, d.pr.head.sha)
      if (detail.value?.pr.number !== d.pr.number) return
      if (!r.ok) {
        changesError.value = r.error.message
        return
      }
      changes.value = r.value
      await selectChangesFile(r.value.files[0] ?? null)
    }

    async function selectChangesFile(file: FileChange | null) {
      changesFile.value = file
      await loadChangesDiff()
    }

    async function loadChangesDiff(force = false) {
      const c = changes.value
      const f = changesFile.value
      const d = detail.value
      if (!c || !f || !d) {
        changesDiff.value = null
        return
      }
      const target = f.oldPath ? { path: f.path, oldPath: f.oldPath } : { path: f.path }
      const r = await window.api.pullRequestFileDiff(root, c.mergeBase, d.pr.head.sha, target, {
        ignoreWhitespace: repo.diffOptions.ignoreWhitespace,
        force,
        context: app.preferences.diffContext,
        algorithm: app.preferences.diffAlgorithm,
      })
      if (r.ok) changesDiff.value = r.value
      else changesError.value = r.error.message
    }

    function openTab(name: 'conversation' | 'commits' | 'changes') {
      tab.value = name
      if (name !== 'conversation') void loadChanges()
    }

    /** Un commit della PR nella scheda Commit, dopo aver scaricato gli oggetti della PR. */
    async function showCommit(sha: string) {
      openTab('commits')
      commit.value = sha
      await loadChanges()
      if (commit.value === sha && changes.value) await repo.select(sha)
    }

    /** Un'azione sulla PR: mostra l'eventuale errore e ricarica lista e dettaglio. */
    async function act(op: Promise<Result<unknown>>): Promise<boolean> {
      busy.value = true
      error.value = null
      const r = await op
      busy.value = false
      if (!r.ok) setError(r.error)
      await refresh()
      return r.ok
    }

    const comment = (body: string) => act(window.api.pullRequestComment(root, remote.value ?? '', selected.value ?? 0, body))
    const setState = (state: 'open' | 'closed') => act(window.api.pullRequestSetState(root, remote.value ?? '', selected.value ?? 0, state))

    watch(
      () => repo.diffOptions.ignoreWhitespace,
      () => void loadChangesDiff(),
    )
```

- Nel `return` aggiungi:
  - `changes, changesError, changesFile, changesDiff, commit`;
  - `openTab, loadChanges, selectChangesFile, loadChangesDiff, showCommit, act, comment, setState`.

- [ ] **Step 6: `src/renderer/components/PullRequestConversation.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { formatDate } from '../history/format'
import { t } from '../i18n'
import { renderMarkdown } from '../markdown'
import { usePullRequestStore } from '../stores/pull-requests'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const text = ref('')

async function send() {
  if (!text.value.trim() || prs.busy) return
  if (await prs.comment(text.value)) text.value = ''
}
</script>

<template>
  <div v-if="prs.detail" class="conversation">
    <!-- renderMarkdown passa da DOMPurify: niente script né stili -->
    <article class="body md" data-testid="pr-body">
      <div v-if="prs.detail.pr.body.trim()" v-html="renderMarkdown(prs.detail.pr.body)" />
      <p v-else class="muted">{{ t('prs.noDescription') }}</p>
    </article>
    <template v-for="item in prs.detail.timeline" :key="item.kind === 'comment' ? `c${item.id}` : item.sha">
      <article v-if="item.kind === 'comment'" class="comment" data-testid="pr-comment">
        <header>
          <strong>{{ item.author }}</strong>
          <span class="muted">{{ formatDate(item.time) }}</span>
        </header>
        <div class="md" v-html="renderMarkdown(item.body)" />
      </article>
      <button v-else class="commit" data-testid="pr-timeline-commit" @click="prs.showCommit(item.sha)">
        <code>{{ item.sha.slice(0, 7) }}</code>
        <span class="subject">{{ item.subject }}</span>
        <span class="muted">{{ item.author }}</span>
      </button>
    </template>
    <!-- .stop: ⌘↩ invia il commento e non arriva alle scorciatoie della finestra -->
    <form class="reply" @submit.prevent="send">
      <textarea
        v-model="text"
        rows="3"
        data-testid="pr-comment-text"
        :placeholder="t('prs.commentPlaceholder')"
        @keydown.meta.enter.prevent.stop="send"
        @keydown.ctrl.enter.prevent.stop="send"
      />
      <button class="primary" data-testid="pr-comment-send" :disabled="!text.trim() || prs.busy">{{ t('prs.comment') }}</button>
    </form>
  </div>
</template>

<style scoped>
.conversation { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.body, .comment { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; }
.comment header { display: flex; gap: 8px; margin-bottom: 4px; font-size: 12px; }
.commit { display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: transparent; padding: 2px 10px; font-size: 12px; }
.commit:hover { background: var(--bg-hover); }
.subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reply { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.reply textarea { width: 100%; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px; resize: vertical; }
</style>
```

- [ ] **Step 7: `src/renderer/components/PullRequestCommits.vue`**

```vue
<script setup lang="ts">
import { formatShortDate } from '../history/format'
import { t } from '../i18n'
import { usePullRequestStore } from '../stores/pull-requests'
import CommitDetail from './CommitDetail.vue'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
</script>

<template>
  <div class="pr-commits">
    <p v-if="prs.changesError" class="error note">{{ t('prs.changesFailed', { message: prs.changesError }) }}</p>
    <p v-else-if="!prs.changes" class="muted note">{{ t('prs.loadingChanges') }}</p>
    <template v-else-if="prs.commit">
      <button class="back" data-testid="pr-commits-back" @click="prs.commit = null">{{ t('prs.back') }}</button>
      <CommitDetail :root="root" />
    </template>
    <ul v-else>
      <li v-for="c in prs.changes.commits" :key="c.sha" data-testid="pr-commit" @click="prs.showCommit(c.sha)">
        <code>{{ c.sha.slice(0, 7) }}</code>
        <span class="subject">{{ c.subject }}</span>
        <span class="muted">{{ c.author }} · {{ formatShortDate(c.authorTime) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pr-commits { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
ul { margin: 0; padding: 0; list-style: none; overflow: auto; }
li { display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-bottom: 1px solid var(--border); cursor: default; }
li:hover { background: var(--bg-hover); }
.subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.back { align-self: flex-start; margin: 6px 12px; border: 0; background: transparent; color: var(--accent); }
.note { margin: 0; padding: 10px 12px; }
</style>
```

- [ ] **Step 8: `src/renderer/components/PullRequestChanges.vue`**

```vue
<script setup lang="ts">
import { t } from '../i18n'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import DiffView from './DiffView.vue'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
</script>

<template>
  <div class="pr-changes">
    <p v-if="prs.changesError" class="error note" data-testid="pr-changes-error">{{ t('prs.changesFailed', { message: prs.changesError }) }}</p>
    <p v-else-if="!prs.changes" class="muted note">{{ t('prs.loadingChanges') }}</p>
    <template v-else>
      <ul class="files">
        <li
          v-for="f in prs.changes.files"
          :key="f.path"
          :class="{ selected: f.path === prs.changesFile?.path }"
          data-testid="pr-file"
          @click="prs.selectChangesFile(f)"
        >
          <span class="status" :class="f.status">{{ f.status }}</span>
          <span class="path">{{ f.oldPath ? `${f.oldPath} → ${f.path}` : f.path }}</span>
          <span class="plus">+{{ f.added ?? '–' }}</span>
          <span class="minus">−{{ f.deleted ?? '–' }}</span>
        </li>
      </ul>
      <div class="diff-bar">
        <span class="path muted">{{ prs.changesFile?.path }}</span>
        <button @click="repo.toggleSplit()">{{ repo.diffOptions.split ? t('diff.unified') : t('diff.split') }}</button>
        <label>
          <input type="checkbox" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
          {{ t('diff.ignoreWhitespace') }}
        </label>
      </div>
      <DiffView v-if="prs.changesDiff" :diff="prs.changesDiff" :split="repo.diffOptions.split" @force="prs.loadChangesDiff(true)" />
    </template>
  </div>
</template>

<style scoped>
.pr-changes { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.files { max-height: 30%; margin: 0; padding: 0; list-style: none; overflow: auto; border-bottom: 1px solid var(--border); }
.files li { display: flex; align-items: center; gap: 8px; padding: 3px 12px; cursor: default; font-size: 12px; }
.files li:hover { background: var(--bg-hover); }
.files li.selected { background: var(--accent); color: var(--accent-fg); }
.status { width: 12px; font-weight: 700; }
.path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plus { color: #1a7f37; }
.minus { color: var(--danger); }
li.selected .plus, li.selected .minus { color: inherit; }
.diff-bar { display: flex; align-items: center; gap: 8px; padding: 4px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.diff-bar button { padding: 1px 8px; }
.note { margin: 0; padding: 10px 12px; }
</style>
```

- [ ] **Step 9: `src/renderer/components/PullRequestDetail.vue` completo**

Sostituisci il file con:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { MessageKey, PluralKey } from '../../shared/i18n'
import type { CheckState } from '../../shared/types'
import { popup } from '../actions/branches'
import { formatDate } from '../history/format'
import { t, tn } from '../i18n'
import { usePullRequestStore } from '../stores/pull-requests'
import PullRequestChanges from './PullRequestChanges.vue'
import PullRequestCommits from './PullRequestCommits.vue'
import PullRequestConversation from './PullRequestConversation.vue'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const pr = computed(() => prs.detail?.pr ?? null)
const ci = computed(() => (pr.value ? prs.ci.get(pr.value.head.sha) : undefined))
const CI_PARTS: [CheckState, PluralKey][] = [
  ['success', 'prs.ci.passed'],
  ['failure', 'prs.ci.failed'],
  ['pending', 'prs.ci.pending'],
  ['skipped', 'prs.ci.skipped'],
]
const ciText = computed(() => {
  const checks = ci.value?.checks ?? []
  return CI_PARTS.map(([state, key]) => [checks.filter((c) => c.state === state).length, key] as const)
    .filter(([n]) => n > 0)
    .map(([n, key]) => tn(key, n))
    .join(' · ')
})
const commitCount = computed(() => prs.detail?.timeline.filter((i) => i.kind === 'commit').length ?? 0)
const head = computed(() => (pr.value?.head.fork ? `${pr.value.head.fork}:${pr.value.head.branch}` : (pr.value?.head.branch ?? '')))
const state = computed(() => (pr.value?.draft && pr.value.state === 'open' ? 'draft' : (pr.value?.state ?? 'open')))

function more() {
  const url = pr.value?.webUrl ?? ''
  void popup([
    // window.open passa da setWindowOpenHandler del main, che apre solo http(s) nel browser
    { label: t('common.openInBrowser'), enabled: !!url, run: () => window.open(url) },
    { label: t('prs.copyLink'), enabled: !!url, run: () => navigator.clipboard.writeText(url) },
  ])
}
</script>

<template>
  <section class="pr-detail">
    <p v-if="!prs.detail || !pr" class="muted center">{{ t('prs.selectOne') }}</p>
    <template v-else>
      <header class="head" data-testid="pr-header">
        <h2><span class="muted">#{{ pr.number }}</span> {{ pr.title }}</h2>
        <div class="meta">
          <span class="state" :class="state">{{ state === 'draft' ? t('prs.draft') : t(`prs.state.${pr.state}` as MessageKey) }}</span>
          <span>{{ pr.author }}</span>
          <code>{{ head }} → {{ pr.base.branch }}</code>
          <span class="muted">{{ formatDate(pr.createdAt) }}</span>
        </div>
        <details v-if="ci && ci.checks.length" class="ci" data-testid="pr-ci-summary">
          <summary :class="ci.state">{{ ciText }}</summary>
          <ul>
            <li v-for="c in ci.checks" :key="c.name" :class="c.state">
              <a v-if="c.url" :href="c.url" target="_blank" rel="noopener noreferrer">{{ c.name }}</a>
              <span v-else>{{ c.name }}</span>
              <span class="muted">{{ t(`prs.check.${c.state}` as MessageKey) }}</span>
            </li>
          </ul>
        </details>
      </header>
      <nav class="tabs">
        <button :class="{ active: prs.tab === 'conversation' }" data-testid="pr-tab-conversation" @click="prs.openTab('conversation')">
          {{ t('prs.tab.conversation') }}
        </button>
        <button :class="{ active: prs.tab === 'commits' }" data-testid="pr-tab-commits" @click="prs.openTab('commits')">
          {{ t('prs.tab.commits') }} <span class="count">{{ commitCount }}</span>
        </button>
        <button :class="{ active: prs.tab === 'changes' }" data-testid="pr-tab-changes" @click="prs.openTab('changes')">
          {{ t('prs.tab.changes') }} <span v-if="prs.changes" class="count">{{ prs.changes.files.length }}</span>
        </button>
      </nav>
      <PullRequestConversation v-if="prs.tab === 'conversation'" :root="root" />
      <PullRequestCommits v-else-if="prs.tab === 'commits'" :root="root" />
      <PullRequestChanges v-else :root="root" />
      <footer class="actions">
        <span class="spacer" />
        <button v-if="pr.state === 'open'" data-testid="pr-close" :disabled="prs.busy" @click="prs.setState('closed')">{{ t('prs.close') }}</button>
        <button v-else-if="pr.state === 'closed'" data-testid="pr-reopen" :disabled="prs.busy" @click="prs.setState('open')">{{ t('prs.reopen') }}</button>
        <button :aria-label="t('prs.more')" data-testid="pr-more" @click="more">…</button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.pr-detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.center { margin: auto; }
.head { padding: 10px 12px; border-bottom: 1px solid var(--border); }
h2 { margin: 0 0 6px; font-size: 15px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
.state { padding: 1px 8px; border-radius: 10px; color: #fff; background: #1a7f37; }
.state.draft { background: var(--fg-muted); }
.state.merged { background: #8250df; }
.state.closed { background: var(--danger); }
.ci { margin-top: 6px; font-size: 12px; }
.ci summary { cursor: default; }
.ci summary.success { color: #1a7f37; }
.ci summary.failure { color: var(--danger); }
.ci summary.pending { color: #bf8700; }
.ci ul { margin: 4px 0 0; padding: 0 0 0 16px; }
.ci li { display: flex; gap: 8px; }
.ci a { color: var(--accent); }
.tabs { display: flex; gap: 2px; padding: 4px 8px 0; border-bottom: 1px solid var(--border); }
.tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; padding: 4px 10px; }
.tabs button.active { border-bottom-color: var(--accent); font-weight: 600; }
.count { padding: 0 5px; border-radius: 8px; background: var(--bg-hover); font-size: 11px; }
.actions { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-top: 1px solid var(--border); }
.actions button { padding: 2px 10px; }
</style>
```

Run: `npm run typecheck && npm run lint && npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: tutto verde.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/renderer/markdown.ts src/renderer/styles.css src/renderer/stores/pull-requests.ts src/renderer/components/PullRequestDetail.vue src/renderer/components/PullRequestConversation.vue src/renderer/components/PullRequestCommits.vue src/renderer/components/PullRequestChanges.vue src/shared/i18n/en.ts src/shared/i18n/it.ts test/e2e/pull-requests.spec.ts
git commit -m "feat: dettaglio delle pull request con conversazione, commit e modifiche"
```

---

### Task 11: Merge e checkout

**Files:**
- Create: `src/renderer/components/MergeDialog.vue`
- Modify: `src/renderer/stores/pull-requests.ts`, `src/renderer/components/PullRequestDetail.vue`, `src/renderer/components/RepoView.vue`, `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/e2e/pull-requests.spec.ts`

**Interfaces:**
- Consumes: `Api.pullRequestMerge` (Task 7), `RepoCommand` `checkoutPullRequest` (Task 6), `act` (Task 10).
- Produces: nello store `merging: Ref<boolean>`, `merge(request): Promise<boolean>`, `checkout(): Promise<void>`.

- [ ] **Step 1: E2E (fallisce)**

In fondo a `test/e2e/pull-requests.spec.ts`:

```ts
test('merge con squash ed eliminazione del branch; checkout di una PR da fork in pr/<n>', async () => {
  const { bare, clone, author, head } = repoWithPullRequest()
  // PR #2 da un fork: esiste solo come refs/pull/2/head
  git(author, 'switch', '-q', '-c', 'fix', 'main')
  writeFileSync(join(author, 'fix.txt'), 'fix\n')
  git(author, 'add', '.')
  git(author, 'commit', '-q', '-m', 'fix: dal fork')
  git(author, 'push', '-q', 'origin', 'HEAD:refs/pull/2/head')
  const forkHead = git(author, 'rev-parse', 'HEAD').trim()
  const base = git(bare, 'rev-parse', 'main').trim()
  const userData = tempUserData()
  seedAccount(userData, GITHUB_ACCOUNT, 'tok')
  let merged = false
  const one = () =>
    ghPull(1, {
      title: 'feat: login',
      merged_at: merged ? '2026-10-22T10:00:00Z' : null,
      state: merged ? 'closed' : 'open',
      head: { ref: 'feature/login', sha: head, repo: { full_name: 'ada/demo' } },
      base: { ref: 'main', sha: base },
      mergeable: true,
      mergeable_state: 'clean',
    })
  const two = ghPull(2, { title: 'fix: dal fork', head: { ref: 'fix', sha: forkHead, repo: { full_name: 'grace/demo' } }, base: { ref: 'main', sha: base } })
  const server = await fakeHosting([
    { method: 'GET', path: '/github/repos/ada/demo/pulls', body: () => (merged ? [two] : [one(), two]) },
    { method: 'GET', path: '/github/repos/ada/demo/pulls/1', body: () => one() },
    { method: 'GET', path: '/github/repos/ada/demo/pulls/2', body: two },
    {
      method: 'GET',
      path: '/github/repos/ada/demo',
      body: { default_branch: 'main', allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: true, delete_branch_on_merge: true },
    },
    { method: 'GET', path: /\/issues\/\d+\/comments$/, body: [] },
    { method: 'GET', path: /\/pulls\/\d+\/commits$/, body: [] },
    {
      method: 'PUT',
      path: '/github/repos/ada/demo/pulls/1/merge',
      body: () => {
        merged = true
        return { merged: true }
      },
    },
    { method: 'DELETE', path: '/github/repos/ada/demo/git/refs/heads/feature/login', status: 204 },
    { method: 'GET', path: /\/status$/, body: ok('success') },
    { method: 'GET', path: /\/check-runs$/, body: { check_runs: [] } },
  ])
  const { app, page } = await launch([clone], userData, { MERLINO_E2E_API: server.url })
  await page.getByTestId('nav-pull-requests').click()
  const rows = page.getByTestId('pr-row')
  await rows.filter({ hasText: 'feat: login' }).click()
  await page.getByTestId('pr-merge').click()
  const dialog = page.getByTestId('merge-dialog')
  await dialog.getByLabel('Squash and merge').check()
  await expect(dialog.getByTestId('merge-message')).toHaveValue('feat: login (#1)')
  await expect(dialog.getByTestId('merge-delete-branch')).toBeChecked()
  await dialog.getByTestId('merge-confirm').click()
  await expect(dialog).toBeHidden()
  expect(server.calls.find((c) => c.method === 'PUT')?.body).toEqual({ merge_method: 'squash', sha: head, commit_title: 'feat: login (#1)', commit_message: '' })
  expect(server.calls.some((c) => c.method === 'DELETE')).toBe(true)

  await expect(rows).toHaveCount(1)
  await rows.filter({ hasText: 'fix: dal fork' }).click()
  await page.getByTestId('pr-checkout').click()
  await expect(page.getByTestId('repo-branch')).toHaveText('pr/2')
  expect(git(clone, 'rev-parse', 'HEAD').trim()).toBe(forkHead)
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts -g squash`
Expected: FAIL.

- [ ] **Step 2: Testi**

`en.ts`:

```ts
  'merge.title': 'Merge #{number}',
  'merge.method.merge': 'Create a merge commit',
  'merge.method.squash': 'Squash and merge',
  'merge.method.rebase': 'Rebase and merge',
  'merge.method.semiLinear': 'Merge commit with semi-linear history',
  'merge.method.fastForward': 'Fast-forward merge',
  'merge.squash': 'Squash commits',
  'merge.message': 'Commit message',
  'merge.deleteBranch': 'Delete {branch} from the remote after merging',
  'merge.warning': 'Some optional checks failed.',
  'merge.block.conflicts': 'There are conflicts with the target branch.',
  'merge.block.checks': 'Required checks have not passed.',
  'merge.block.approvals': 'Approvals are missing.',
  'merge.block.draft': 'It is a draft.',
  'merge.block.discussions': 'Some discussions are still open.',
  'merge.block.rebase': 'The branch must be updated (rebase) first.',
  'merge.block.notOpen': 'The pull request is not open.',
  'merge.block.checking': 'The server is still checking whether it can be merged: refresh in a moment.',
  'merge.block.blocked': 'The branch rules block the merge (checks or approvals).',
```

`it.ts`:

```ts
  'merge.title': 'Merge di #{number}',
  'merge.method.merge': 'Crea un commit di merge',
  'merge.method.squash': 'Squash e merge',
  'merge.method.rebase': 'Rebase e merge',
  'merge.method.semiLinear': 'Commit di merge con storia semi-lineare',
  'merge.method.fastForward': 'Merge fast-forward',
  'merge.squash': 'Squash dei commit',
  'merge.message': 'Messaggio del commit',
  'merge.deleteBranch': 'Elimina {branch} dal remote dopo il merge',
  'merge.warning': 'Alcuni controlli facoltativi sono falliti.',
  'merge.block.conflicts': 'Ci sono conflitti con il branch di destinazione.',
  'merge.block.checks': 'I controlli obbligatori non sono superati.',
  'merge.block.approvals': 'Mancano le approvazioni.',
  'merge.block.draft': 'È una bozza.',
  'merge.block.discussions': 'Ci sono discussioni ancora aperte.',
  'merge.block.rebase': 'Prima il branch va aggiornato (rebase).',
  'merge.block.notOpen': 'La pull request non è aperta.',
  'merge.block.checking': 'Il server sta ancora verificando se il merge è possibile: aggiorna fra poco.',
  'merge.block.blocked': 'Le regole del branch bloccano il merge (controlli o approvazioni).',
```

- [ ] **Step 3: Store**

In `src/renderer/stores/pull-requests.ts` aggiungi `MergeRequest` ai tipi importati e, dopo `setState`:

```ts
    /** Dialog di merge aperto. */
    const merging = ref(false)

    async function merge(request: MergeRequest): Promise<boolean> {
      const n = selected.value
      if (n === null || !remote.value) return false
      if (!(await act(window.api.pullRequestMerge(root, remote.value, n, request)))) return false
      merging.value = false
      // Il merge è avvenuto sul server: il fetch lo porta nella storia
      await repo.git({ kind: 'fetch' })
      return true
    }

    async function checkout() {
      const d = detail.value
      const account = current.value?.account
      if (!d || !account || !remote.value) return
      await repo.git({
        kind: 'checkoutPullRequest',
        remote: remote.value,
        service: account.service,
        number: d.pr.number,
        head: d.pr.head.branch,
        sha: d.pr.head.sha,
        fork: d.pr.head.fork !== null,
      })
    }
```

Nel `return` aggiungi `merging, merge, checkout`.

- [ ] **Step 4: `src/renderer/components/MergeDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { MessageKey } from '../../shared/i18n'
import type { MergeMethod } from '../../shared/types'
import { t } from '../i18n'
import { usePullRequestStore } from '../stores/pull-requests'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
// Il dialog si apre solo con un dettaglio caricato (vedi RepoView)
const detail = computed(() => prs.detail!)
const settings = detail.value.merge
const fork = detail.value.pr.head.fork !== null
const method = ref<MergeMethod>(settings.methods[0] ?? 'merge')
const squash = ref(settings.squash?.checked ?? false)
const deleteBranch = ref(settings.deleteBranch && !fork)
const squashing = computed(() => method.value === 'squash' || squash.value)
const message = ref(squashing.value ? settings.squashMessage : settings.mergeMessage)
/** Rebase e fast-forward non creano un commit: niente messaggio, salvo lo squash. */
const needsMessage = computed(() => squashing.value || method.value === 'merge' || method.value === 'semiLinear')

watch(squashing, (on) => {
  message.value = on ? settings.squashMessage : settings.mergeMessage
})

const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())

function close() {
  prs.merging = false
}

async function submit() {
  if (detail.value.block || prs.busy) return
  await prs.merge({ method: method.value, squash: squash.value, message: needsMessage.value ? message.value : '', deleteBranch: deleteBranch.value, sha: detail.value.pr.head.sha })
}
</script>

<template>
  <dialog ref="dialog" data-testid="merge-dialog" @cancel.prevent="close">
    <form @submit.prevent="submit">
      <h2>{{ t('merge.title', { number: detail.pr.number }) }}</h2>
      <p v-if="detail.block" class="error" data-testid="merge-block">{{ t(`merge.block.${detail.block}` as MessageKey) }}</p>
      <p v-else-if="detail.warning" class="warning">{{ t('merge.warning') }}</p>
      <div class="methods">
        <label v-for="m in settings.methods" :key="m">
          <input v-model="method" type="radio" name="merge-method" :value="m" />
          {{ t(`merge.method.${m}` as MessageKey) }}
        </label>
        <label v-if="settings.squash">
          <input v-model="squash" type="checkbox" :disabled="settings.squash.locked" data-testid="merge-squash" />
          {{ t('merge.squash') }}
        </label>
      </div>
      <template v-if="needsMessage">
        <label for="merge-message" class="muted">{{ t('merge.message') }}</label>
        <textarea id="merge-message" v-model="message" rows="5" data-testid="merge-message" />
      </template>
      <label v-if="!fork" class="check">
        <input v-model="deleteBranch" type="checkbox" data-testid="merge-delete-branch" />
        {{ t('merge.deleteBranch', { branch: detail.pr.head.branch }) }}
      </label>
      <p v-if="prs.error" class="error">{{ prs.error }}</p>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="merge-confirm" :disabled="!!detail.block || prs.busy">Merge</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(560px, 92vw); }
.methods { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.methods label, .check { display: flex; align-items: center; gap: 6px; }
textarea { width: 100%; margin: 4px 0 10px; font: 12px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; resize: vertical; }
.warning { color: #bf8700; }
p { margin: 0 0 8px; }
</style>
```

- [ ] **Step 5: Pulsanti e dialog**

In `src/renderer/components/PullRequestDetail.vue`:
- importa `useRepoStore` e aggiungi `const repo = useRepoStore(props.root)`;
- in `<footer class="actions">`, prima di `<span class="spacer" />`:

```vue
        <button data-testid="pr-checkout" :disabled="!!repo.busy || pr.state === 'merged'" @click="prs.checkout()">Checkout</button>
        <button class="primary" data-testid="pr-merge" :disabled="pr.state !== 'open' || prs.busy" @click="prs.merging = true">Merge…</button>
```

In `src/renderer/components/RepoView.vue`:
- importa `MergeDialog`;
- dopo `<RebaseDialog …/>` aggiungi:

```vue
    <MergeDialog v-if="prs.merging && prs.detail" :root="root" />
```

Run: `npm run typecheck && npm run lint && npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: tutto verde.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/MergeDialog.vue src/renderer/components/PullRequestDetail.vue src/renderer/components/RepoView.vue src/renderer/stores/pull-requests.ts src/shared/i18n/en.ts src/shared/i18n/it.ts test/e2e/pull-requests.spec.ts
git commit -m "feat: merge e checkout delle pull request"
```

---

### Task 12: Nuova pull request (vista, menu del branch, palette, drag & drop)

**Files:**
- Create: `src/renderer/components/CreatePullRequestDialog.vue`
- Modify:
  - `src/renderer/stores/pull-requests.ts`, `src/renderer/components/PullRequestList.vue`, `src/renderer/components/RepoView.vue`, `src/renderer/components/RepoSidebar.vue`;
  - `src/renderer/actions/branches.ts`, `src/renderer/actions/pull-requests.ts`, `src/renderer/drag/drop-actions.ts`;
  - `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`.
- Test: `test/unit/drop-actions.test.ts`, `test/e2e/pull-requests.spec.ts`

**Interfaces:**
- Consumes: `Api.pullRequestCreate`, `pullRequestDefaultBranch`, `branchSummary` (Task 7); `RepoCommand` `pushBranch`; `select`, `load` (Task 9).
- Produces:
  - nello store:
    - `creating: Ref<{ head: string } | null>`;
    - `openCreate(head?)`;
    - `create(input, push): Promise<string | null>`, che restituisce `null` se la PR è creata e altrimenti il messaggio d'errore;
  - `DropTarget` `{ kind: 'pullRequests' }`;
  - `DropOperation` `{ type: 'createPullRequest'; head: string }`.

- [ ] **Step 1: Test di `dropAction` (fallisce)**

In `test/unit/drop-actions.test.ts`, nel `describe`:

```ts
  it('branch locale sulla voce Pull requests: nuova pull request da quel branch', () => {
    expect(act(branch('feature/a'), { kind: 'pullRequests' })).toEqual({
      label: 'New pull request from feature/a…',
      operation: { type: 'createPullRequest', head: 'feature/a' },
    })
    expect(act(remoteBranch('main'), { kind: 'pullRequests' })).toBeNull()
    expect(act(commit, { kind: 'pullRequests' })).toBeNull()
  })
```

Run: `npx vitest run test/unit/drop-actions.test.ts`
Expected: FAIL (errore di tipo o `null`).

- [ ] **Step 2: Testi**

`en.ts`:

```ts
  'action.pr.create': 'New Pull Request…',
  'ctx.createPullRequest': 'Create Pull Request from {branch}…',
  'drop.createPullRequest': 'New pull request from {branch}…',
  'create.title': 'New pull request',
  'create.remote': 'Repository',
  'create.base': 'Into branch',
  'create.headRemote': 'From repository',
  'create.head': 'From branch',
  'create.titleField': 'Title',
  'create.body': 'Description',
  'create.draft': 'Draft',
  'create.needsPush': '{branch} will be pushed to {remote} first.',
```

`it.ts`:

```ts
  'action.pr.create': 'Nuova pull request…',
  'ctx.createPullRequest': 'Crea pull request da {branch}…',
  'drop.createPullRequest': 'Nuova pull request da {branch}…',
  'create.title': 'Nuova pull request',
  'create.remote': 'Repository',
  'create.base': 'Nel branch',
  'create.headRemote': 'Dal repository',
  'create.head': 'Dal branch',
  'create.titleField': 'Titolo',
  'create.body': 'Descrizione',
  'create.draft': 'Bozza',
  'create.needsPush': 'Prima {branch} viene pubblicato su {remote}.',
```

- [ ] **Step 3: `dropAction`**

In `src/renderer/drag/drop-actions.ts`:
- in `DropTarget` aggiungi `| { kind: 'pullRequests' }`;
- in `DropOperation` aggiungi `| { type: 'createPullRequest'; head: string }`;
- nello `switch` di `dropAction`, prima di `case 'area':`:

```ts
    case 'pullRequests':
      return source.kind === 'branch'
        ? { label: l('drop.createPullRequest', { branch: source.name }), operation: { type: 'createPullRequest', head: source.name } }
        : null
```

In `src/renderer/actions/branches.ts`:
- importa `usePullRequestStore` da `'../stores/pull-requests'`;
- in `performDrop` aggiungi:

```ts
    case 'createPullRequest':
      return usePullRequestStore(repo.root).openCreate(op.head)
```

Run: `npx vitest run test/unit/drop-actions.test.ts`
Expected: PASS.

- [ ] **Step 4: E2E (fallisce)**

In fondo a `test/e2e/pull-requests.spec.ts` (aggiungi `chooseNextMenuItem` da `'./menu'` agli import):

```ts
test('nuova pull request dal menu del branch: titolo dal commit, push e creazione', async () => {
  const { bare, clone } = hostedRepo('github.example.test', 'ada/demo')
  git(clone, 'switch', '-q', '-c', 'feature/new')
  writeFileSync(join(clone, 'new.txt'), 'nuovo\n')
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '-m', 'feat: nuova pagina\n\nCon la descrizione')
  const userData = tempUserData()
  seedAccount(userData, GITHUB_ACCOUNT, 'tok')
  let created = false
  const five = () => ghPull(5, { title: 'feat: nuova pagina', head: { ref: 'feature/new', sha: git(clone, 'rev-parse', 'HEAD').trim(), repo: { full_name: 'ada/demo' } } })
  const server = await fakeHosting([
    { method: 'GET', path: '/github/repos/ada/demo', body: { default_branch: 'main' } },
    { method: 'GET', path: '/github/repos/ada/demo/pulls', body: () => (created ? [five()] : []) },
    {
      method: 'POST',
      path: '/github/repos/ada/demo/pulls',
      body: () => {
        created = true
        return five()
      },
    },
    { method: 'GET', path: '/github/repos/ada/demo/pulls/5', body: () => five() },
    { method: 'GET', path: /\/issues\/\d+\/comments$/, body: [] },
    { method: 'GET', path: /\/pulls\/\d+\/commits$/, body: [] },
    { method: 'GET', path: /\/status$/, body: ok('pending') },
    { method: 'GET', path: /\/check-runs$/, body: { check_runs: [] } },
  ])
  const { app, page } = await launch([clone], userData, { MERLINO_E2E_API: server.url })
  const branch = page.getByTestId('branch-item').filter({ has: page.locator('.name', { hasText: /^new$/ }) })
  await chooseNextMenuItem(app, 'Create Pull Request from feature/new…')
  await branch.click({ button: 'right' })
  const dialog = page.getByTestId('create-pr-dialog')
  await expect(dialog.getByTestId('create-base')).toHaveValue('main')
  await expect(dialog.getByTestId('create-title')).toHaveValue('feat: nuova pagina')
  await expect(dialog.getByTestId('create-body')).toHaveValue('Con la descrizione')
  await expect(dialog.getByTestId('create-push')).toContainText('feature/new will be pushed to origin first.')
  await dialog.getByTestId('create-confirm').click()
  await expect(dialog).toBeHidden()
  expect(git(bare, 'rev-parse', 'feature/new').trim()).toBe(git(clone, 'rev-parse', 'feature/new').trim())
  expect(server.calls.find((c) => c.method === 'POST')?.body).toEqual({
    title: 'feat: nuova pagina',
    body: 'Con la descrizione',
    head: 'feature/new',
    base: 'main',
    draft: false,
  })
  await expect(page.getByTestId('pr-header')).toContainText('#5')
  await app.close()
  await server.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts -g "nuova pull request"`
Expected: FAIL.

- [ ] **Step 5: Store**

In `src/renderer/stores/pull-requests.ts`:
- aggiungi `nextTick` all'import da `'vue'` e `NewPullRequest` ai tipi;
- dopo `checkout` aggiungi:

```ts
    /** Dialog "Nuova pull request" aperto, con il branch proposto. */
    const creating = ref<{ head: string } | null>(null)

    function openCreate(head?: string) {
      creating.value = { head: head ?? repo.info?.branch ?? '' }
    }

    /** null se la PR è creata (e aperta nella vista); altrimenti il messaggio d'errore. push: prima pubblica head su headRemote. */
    async function create(input: NewPullRequest, push: boolean): Promise<string | null> {
      if (push && !(await repo.git({ kind: 'pushBranch', remote: input.headRemote, branch: input.head, remoteBranch: input.head }))) {
        return repo.error ?? ''
      }
      const r = await window.api.pullRequestCreate(root, input)
      if (!r.ok) return r.error.message
      creating.value = null
      visible.value = true
      remote.value = input.remote
      filter.value = 'open'
      // I watcher di remote e filtro azzerano la selezione: la PR nuova si seleziona dopo
      await nextTick()
      await load()
      await select(r.value)
      return null
    }
```

- nel `return` aggiungi `creating, openCreate, create`.

- [ ] **Step 6: `src/renderer/components/CreatePullRequestDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())

const remote = ref(prs.remote ?? '')
const host = computed(() => prs.remotes.find((r) => r.name === remote.value)?.target.host)
/** Remote sullo stesso server, da cui può arrivare il branch: un fork verso upstream. */
const headRemotes = computed(() => prs.remotes.filter((r) => r.target.host === host.value))
/** Remote che contiene il branch: origin se è sullo stesso server, altrimenti la destinazione. */
const headRemote = ref(headRemotes.value.some((r) => r.name === 'origin') ? 'origin' : remote.value)
const head = ref(prs.creating?.head ?? '')
const base = ref('')
const branches = computed(() => (repo.refs?.branches ?? []).map((b) => b.name))
const baseBranches = computed(() => {
  const names = repo.refs?.remotes.find((r) => r.name === remote.value)?.branches.map((b) => b.name) ?? []
  return base.value && !names.includes(base.value) ? [base.value, ...names] : names
})
const title = ref('')
const body = ref('')
const draft = ref(false)
/** Titolo e descrizione scritti dall'utente non si sovrascrivono più. */
const touched = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

/** Da pubblicare: il branch non è su headRemote, o lì ha uno SHA diverso (commit non pushati). */
const needsPush = computed(() => {
  const local = repo.refs?.branches.find((b) => b.name === head.value)
  const published = repo.refs?.remotes.find((r) => r.name === headRemote.value)?.branches.find((b) => b.name === head.value)
  return !!local && local.sha !== published?.sha
})

watch(
  remote,
  async (name) => {
    const r = await window.api.pullRequestDefaultBranch(props.root, name)
    if (r.ok) base.value = r.value
  },
  { immediate: true },
)

// Titolo e descrizione proposti: dal commit se il branch ne ha uno solo in più, altrimenti il nome del branch
watch(
  [remote, base, head],
  async () => {
    if (touched.value || !base.value || !head.value) return
    const r = await window.api.branchSummary(props.root, `${remote.value}/${base.value}`, head.value)
    if (touched.value) return
    const [first = '', ...rest] = r.ok && r.value.count === 1 ? r.value.message.split('\n') : [head.value]
    title.value = first
    body.value = rest.join('\n').trim()
  },
  { immediate: true },
)

function close() {
  prs.creating = null
}

async function submit() {
  if (busy.value || !title.value.trim() || !base.value || !head.value) return
  busy.value = true
  error.value = await prs.create(
    { remote: remote.value, base: base.value, headRemote: headRemote.value, head: head.value, title: title.value, body: body.value, draft: draft.value },
    needsPush.value,
  )
  busy.value = false
}
</script>

<template>
  <dialog ref="dialog" data-testid="create-pr-dialog" @cancel.prevent="close">
    <form @submit.prevent="submit">
      <h2>{{ t('create.title') }}</h2>
      <div class="settings-form">
        <label for="create-remote">{{ t('create.remote') }}</label>
        <select id="create-remote" v-model="remote" data-testid="create-remote">
          <option v-for="r in prs.usable" :key="r.name" :value="r.name">{{ r.name }} ({{ r.target.project }})</option>
        </select>
        <label for="create-base">{{ t('create.base') }}</label>
        <select id="create-base" v-model="base" data-testid="create-base">
          <option v-for="b in baseBranches" :key="b" :value="b">{{ b }}</option>
        </select>
        <template v-if="headRemotes.length > 1">
          <label for="create-head-remote">{{ t('create.headRemote') }}</label>
          <select id="create-head-remote" v-model="headRemote" data-testid="create-head-remote">
            <option v-for="r in headRemotes" :key="r.name" :value="r.name">{{ r.name }} ({{ r.target.project }})</option>
          </select>
        </template>
        <label for="create-head">{{ t('create.head') }}</label>
        <select id="create-head" v-model="head" data-testid="create-head">
          <option v-for="b in branches" :key="b" :value="b">{{ b }}</option>
        </select>
        <label for="create-title">{{ t('create.titleField') }}</label>
        <input id="create-title" v-model="title" data-testid="create-title" @input="touched = true" />
        <label for="create-body">{{ t('create.body') }}</label>
        <textarea id="create-body" v-model="body" rows="6" data-testid="create-body" @input="touched = true" />
        <span />
        <label class="check"><input v-model="draft" type="checkbox" data-testid="create-draft" /> {{ t('create.draft') }}</label>
        <p v-if="needsPush" class="hint" data-testid="create-push">{{ t('create.needsPush', { branch: head, remote: headRemote }) }}</p>
        <p v-if="error" class="hint error" data-testid="create-error">{{ error }}</p>
      </div>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="create-confirm" :disabled="busy || !title.trim() || !base || !head">{{ t('common.create') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(640px, 92vw); }
input:not([type]), select, textarea { width: 100%; }
textarea { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; resize: vertical; }
</style>
```

- [ ] **Step 7: Punti di accesso**

- **`RepoView.vue`**: importa `CreatePullRequestDialog` e, dopo `<MergeDialog …/>`, aggiungi:

  ```vue
      <CreatePullRequestDialog v-if="prs.creating" :root="root" />
  ```

- **`PullRequestList.vue`**: nell'`header`, prima del pulsante ↻, aggiungi:

  ```vue
        <button data-testid="pr-new" :disabled="!prs.ready" @click="prs.openCreate()">{{ t('action.pr.create') }}</button>
  ```

- **`RepoSidebar.vue`**: sul pulsante `nav-pull-requests` aggiungi `v-bind="dnd(undefined, { kind: 'pullRequests' })"`. Così un branch trascinato lì apre il dialog.

- **`actions/branches.ts`**, in `branchMenu`: dopo la voce "Rebase del corrente su questo" aggiungi:

  ```ts
      null,
      { label: t('ctx.createPullRequest', { branch: b.name }), run: () => usePullRequestStore(repo.root).openCreate(b.name) },
  ```

- **`actions/pull-requests.ts`**, in `registry.register`:

  ```ts
      {
        id: 'pr.create',
        get title() {
          return t('action.pr.create')
        },
        when: () => !!prs()?.ready,
        run: () => prs()?.openCreate(),
      },
  ```

Run: `npm run typecheck && npm run lint && npx vitest run && npx electron-vite build && npx playwright test test/e2e/pull-requests.spec.ts`
Expected: tutto verde.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/CreatePullRequestDialog.vue src/renderer/components/PullRequestList.vue src/renderer/components/RepoView.vue src/renderer/components/RepoSidebar.vue src/renderer/stores/pull-requests.ts src/renderer/actions/branches.ts src/renderer/actions/pull-requests.ts src/renderer/drag/drop-actions.ts src/shared/i18n/en.ts src/shared/i18n/it.ts test/unit/drop-actions.test.ts test/e2e/pull-requests.spec.ts
git commit -m "feat: nuova pull request dalla vista, dal menu del branch, dalla palette e col drag & drop"
```

---

### Task 13: README e verifica

**Files:**
- Modify: `README.md`, `docs/superpowers/plans/2026-10-23-merlino-pull-requests.md` (note in fondo)

- [ ] **Step 1: README**

- **Status**: dopo "The interface is available in English and Italian." non cambia niente.
- **Features**: dopo "### Branches, tags and remotes" aggiungi:

```markdown
### Pull and merge requests
- GitHub pull requests and GitLab merge requests, including GitHub Enterprise and self-hosted GitLab.
- Connect an account with a personal access token in Settings → Accounts. The token is encrypted with the system keychain and never leaves the main process.
- A Pull Requests view (<kbd>⌘</kbd><kbd>2</kbd>): open, merged or closed requests of the chosen remote, with CI status and search.
- Details: description and comments (Markdown), commits and the full diff, read with git from the request's own ref.
- Comment, check out (a fork's request goes to a local `pr/<n>` branch), merge (merge commit, squash or rebase, as the repository allows), close and reopen.
- Create a request from the view, from a branch's context menu, from the command palette, or by dragging a branch onto "Pull Requests".
```

- **Tabella delle Impostazioni**: dopo la riga "Integrations" aggiungi:

```markdown
| Accounts | GitHub and GitLab accounts (servers and tokens) for pull and merge requests |
```

- **Scorciatoie**: aggiungi due righe dopo "Command palette":

```markdown
| History | <kbd>⌘</kbd><kbd>1</kbd> | <kbd>Ctrl</kbd>+<kbd>1</kbd> |
| Pull requests | <kbd>⌘</kbd><kbd>2</kbd> | <kbd>Ctrl</kbd>+<kbd>2</kbd> |
```

- **How it works**: sostituisci la voce "No telemetry, no accounts." con:

```markdown
- **No telemetry.** Besides what git itself does (clone, fetch, pull and push), Merlino only talks to the GitHub or GitLab servers of the accounts you connect, over HTTPS. On Linux the token is protected by the system keyring (GNOME Keyring or KWallet); without one, Electron falls back to a weak encryption.
```

- **Roadmap**: la voce "4. Pull/merge requests and team integrations." diventa "4. Reviews and line comments on pull requests; Bitbucket and Azure DevOps."

- [ ] **Step 2: Verifica completa, con la finestra nascosta**

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
```

Expected: tutto verde.

- [ ] **Step 3: Controlli finali**

- Testi: nessun testo italiano fuori da `it.ts` e dai commenti, né in `src/renderer` né in `src/main/hosting`.
- Token: `grep -rn "token" out/renderer` non deve trovare valori di token; il renderer riceve solo `HostingAccount`, che non ha token.
- Screenshot con la finestra nascosta (`MERLINO_E2E=1`), su un repo con nomi fittizi e il server finto: lista, dettaglio, dialog di merge e di creazione, in inglese e in italiano.

- [ ] **Step 4: Note in fondo a questo piano e commit**

```bash
git add README.md docs/superpowers/plans/2026-10-23-merlino-pull-requests.md
git commit -m "docs: pull e merge request nel README; note del piano"
```
