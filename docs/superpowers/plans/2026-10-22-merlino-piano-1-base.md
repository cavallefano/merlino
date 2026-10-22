# Merlino — Piano 1: Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App desktop Merlino che apre repo git in tab (riaperti al riavvio), mostra il branch corrente aggiornato in tempo reale, con command palette, scorciatoie, barra dei menu, pannello di output dei comandi git e controllo della versione di git.

**Architecture:** Electron con tre livelli. Il main (Node) esegue `git` tramite `GitRunner`, che ha una coda per le scritture, e osserva i repo con `@parcel/watcher`. Il preload espone `window.api`, tipizzata da `src/shared/ipc.ts`. Il renderer è in Vue 3 + Pinia, con uno store per tab e un registro unico delle azioni da cui leggono palette, menu e scorciatoie.

**Tech Stack:** Electron 45 (Node 24), electron-vite 6, Vite 8, Vue 3.5, Pinia 4, TypeScript 6.0, Vitest 5, Playwright 1.64, ESLint 10, electron-builder 26, @parcel/watcher 2.6.

Spec: `docs/superpowers/specs/2026-10-22-merlino-v1-design.md` (questo piano copre la parte 1, cioè la base, più le fondamenta usate dalle parti 2–4).

## Global Constraints

- **Clean room**: non si usa né si guarda codice, binario o asset di Sublime Merge.
- **Interfaccia** in italiano.
- **git** ≥ 2.35.0, quello di sistema, mai incluso nell'app.
- **TypeScript 6.0.x** e non 7: `vue-tsc` 3.3 non funziona con TypeScript 7 (verificato).
- **Ambiente di ogni processo git**: `GIT_TERMINAL_PROMPT=0` e `LC_ALL=C`, più `GIT_OPTIONAL_LOCKS=0` perché `status` non riscriva l'index e non scateni un ciclo col watcher.
- **Finestra**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Il preload è CommonJS (package.json **senza** `"type": "module"`), perché un preload in sandbox non può essere ESM.
- **Renderer**: non lancia processi; chiede al main operazioni con nome, mai argomenti git liberi.
- **Niente aggiornamenti ottimistici**: dopo ogni operazione si ricarica lo stato da git.
- **Dipendenze**: l'unica dipendenza runtime è `@parcel/watcher` (in `dependencies`); tutto il resto è in `devDependencies`, perché Vite lo include nel bundle.
- **Commit**: ogni commit finisce con la riga `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Struttura dei file

```
package.json, electron.vite.config.ts, tsconfig.json, eslint.config.mjs,
vitest.config.ts, playwright.config.ts, electron-builder.yml, .gitlab-ci.yml, README.md
src/shared/types.ts          tipi condivisi main ↔ renderer
src/shared/ipc.ts            canali IPC, Result<T>, interfaccia Api (window.api)
src/main/index.ts            ciclo di vita dell'app, finestra, istanza singola, log crash
src/main/argv.ts             cartella passata da riga di comando
src/main/settings.ts         impostazioni JSON nella cartella dati dell'app
src/main/menu.ts             barra dei menu → id delle azioni
src/main/ipc-handlers.ts     handler IPC, sessioni dei repo, log dei comandi
src/main/repo-session.ts     un repo aperto: runner + watcher
src/main/watcher.ts          @parcel/watcher con debounce
src/main/git/runner.ts       spawn di git, GitError, coda delle scritture
src/main/git/check.ts        verifica la versione di git
src/main/git/repo-info.ts    radice, branch e HEAD
src/preload/index.ts         window.api
src/renderer/                index.html, main.ts, App.vue, styles.css, env.d.ts, tsconfig.json
src/renderer/stores/         app.ts (tab, git, log), repo.ts (uno store per tab)
src/renderer/actions/        registry.ts (registro + fuzzy), builtin.ts (azioni di base)
src/renderer/components/     TabBar, WelcomeScreen, GitMissing, RepoView, OutputPanel, CommandPalette
test/helpers/repo.ts         repo git temporanei per i test
test/unit/                   argv, settings, registry
test/integration/            runner, check, repo-info, repo-session (git vero)
test/e2e/                    launch.ts + spec Playwright
```

---

### Task 1: Scaffold e finestra che si avvia

**Files:**
- Create: `package.json`, `.gitignore`, `electron.vite.config.ts`, `tsconfig.json`, `src/renderer/tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.ts`, `src/renderer/App.vue`
- Test: `test/e2e/launch.ts`, `test/e2e/app.spec.ts`

**Interfaces:**
- Produces: `launch(args?: string[], userData?: string): Promise<{ app: ElectronApplication; page: Page; userData: string }>` e `tempUserData(): string` in `test/e2e/launch.ts`. La variabile d'ambiente `MERLINO_USER_DATA` imposta la cartella dati dell'app.

- [ ] **Step 1: Crea `package.json`**

```json
{
  "name": "merlino",
  "productName": "Merlino",
  "version": "0.1.0",
  "description": "Client Git desktop del team",
  "author": { "name": "Stefano Cavallotto", "email": "cavallefano@users.noreply.github.com" },
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit -p tsconfig.json && vue-tsc --noEmit -p src/renderer/tsconfig.json",
    "test": "vitest run",
    "test:e2e": "electron-vite build && playwright test",
    "dist": "electron-vite build && electron-builder"
  }
}
```

- [ ] **Step 2: Installa le dipendenze di sviluppo e scarica Electron**

```bash
npm i -D -E electron@45.0.0 electron-vite@6.0.0 vite@8.3.5 @vitejs/plugin-vue@6.0.10 vue@3.5.44 pinia@4.1.0 typescript@6.0.3 vue-tsc@3.3.13 vitest@5.0.5 @types/node@24 eslint@10.13.0 typescript-eslint@8.72.0 eslint-plugin-vue@10.11.1 @vue/eslint-config-typescript@14.9.0 @playwright/test@1.64.1 electron-builder@26.15.3
npx electron --version
```

Expected: `v45.0.0`. Electron 45 scarica il binario al primo uso.

- [ ] **Step 3: Crea i file di configurazione**

`.gitignore`:
```
node_modules/
out/
dist/
test-results/
playwright-report/
```

`electron.vite.config.ts`:
```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [vue()] },
})
```

`tsconfig.json` (main, preload, shared, test, config):
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "test/**/*", "*.config.ts"]
}
```

`src/renderer/tsconfig.json` (renderer: DOM sì, tipi Node no):
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve"
  },
  "include": ["./**/*.ts", "./**/*.vue", "../shared/**/*.ts"]
}
```

`eslint.config.mjs`:
```js
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
)
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    testTimeout: 20_000,
    passWithNoTests: true,
  },
})
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({ testDir: 'test/e2e', timeout: 60_000, workers: 1, reporter: 'list' })
```

- [ ] **Step 4: Scrivi il test E2E che fallisce**

`test/e2e/launch.ts`:
```ts
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const tempUserData = (): string => mkdtempSync(join(tmpdir(), 'merlino-ud-'))

/** Avvia Merlino con una cartella dati temporanea. Con MERLINO_EXECUTABLE prova l'app impacchettata invece di out/. */
export async function launch(
  args: string[] = [],
  userData = tempUserData(),
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const executablePath = process.env.MERLINO_EXECUTABLE
  const app = await electron.launch({
    executablePath,
    args: executablePath ? args : ['.', ...args],
    env: { ...process.env, MERLINO_USER_DATA: userData } as Record<string, string>,
  })
  return { app, page: await app.firstWindow(), userData }
}
```

`test/e2e/app.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { launch } from './launch'

test('si avvia e mostra Merlino', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('Merlino')
  await expect(page.getByRole('heading', { name: 'Merlino' })).toBeVisible()
  await app.close()
})
```

- [ ] **Step 5: Esegui il test e verifica che fallisca**

Run: `npx playwright test test/e2e/app.spec.ts`
Expected: FAIL, perché non esistono ancora né `out/main/index.js` né `src/main/index.ts`.

- [ ] **Step 6: Crea main, preload e renderer minimi**

`src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

if (process.env.MERLINO_USER_DATA) app.setPath('userData', process.env.MERLINO_USER_DATA)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Merlino',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

void app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

`src/preload/index.ts`:
```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
    <title>Merlino</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/renderer/main.ts`:
```ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

`src/renderer/App.vue`:
```vue
<template>
  <h1>Merlino</h1>
</template>
```

- [ ] **Step 7: Esegui build e test E2E, poi verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, `1 passed`.

- [ ] **Step 8: Esegui lint e typecheck**

Run: `npm run lint && npm run typecheck`
Expected: nessun errore.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + Vue 3 + TypeScript" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tipi condivisi e GitRunner

**Files:**
- Create: `src/shared/types.ts`, `src/main/git/runner.ts`
- Test: `test/helpers/repo.ts`, `test/integration/runner.test.ts`

**Interfaces:**
- Produces (in `src/shared/types.ts`): `GitCheck`, `CommandLogEntry`, `GitErrorInfo`, `RepoInfo`, `AppSettings`, con i campi esatti riportati sotto.
- Produces (in `src/main/git/runner.ts`):
  - `class GitRunner { constructor(gitPath: () => string, cwd: string, log?: (e: CommandLogEntry) => void); run(args: string[], opts?: RunOptions): Promise<RunResult> }`;
  - `RunOptions { write?: boolean; okCodes?: number[]; stdin?: string; env?: Record<string, string> }`;
  - `RunResult { stdout: string; stderr: string; exitCode: number }`;
  - `class GitError extends Error { info: GitErrorInfo }`.
- Produces (in `test/helpers/repo.ts`): `git(cwd: string, ...args: string[]): string` e `makeRepo(commits?: number): string`, che restituisce il percorso reale (realpath) di un repo sul branch `main`.

- [ ] **Step 1: Crea i tipi condivisi**

`src/shared/types.ts`:
```ts
/** Esito del controllo di git all'avvio. */
export interface GitCheck {
  ok: boolean
  /** Eseguibile usato: "git" o un percorso assoluto. */
  path: string
  /** Versione trovata, es. "2.50.1"; null se git non risponde. */
  version: string | null
  /** Messaggio per l'utente quando ok è false. */
  error: string | null
}

/** Un comando git eseguito, per il pannello di output. */
export interface CommandLogEntry {
  id: number
  /** Cartella in cui è stato eseguito; null per gli errori dell'interfaccia. */
  repo: string | null
  args: string[]
  startedAt: number
  durationMs: number
  /** null se il processo non è partito o è stato terminato da un segnale. */
  exitCode: number | null
  ok: boolean
  stderr: string
}

export interface GitErrorInfo {
  args: string[]
  exitCode: number | null
  stderr: string
  /** Prima riga utile di stderr, da mostrare all'utente. */
  message: string
}

export interface RepoInfo {
  /** Cartella radice del repo, nel formato di percorso del sistema operativo. */
  root: string
  name: string
  /** Branch corrente; null se HEAD è staccato. */
  branch: string | null
  /** SHA di HEAD; null se il repo non ha ancora commit. */
  headSha: string | null
}

export interface AppSettings {
  gitPath: string
  openRepos: string[]
  activeRepo: string | null
  recentRepos: string[]
}
```

- [ ] **Step 2: Crea l'helper per i repo di test**

`test/helpers/repo.ts`:
```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'

// Config globale e di sistema ignorate, così una firma GPG o un hook dell'utente non rompe i test
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' })
}

/** Repo temporaneo sul branch main con `commits` commit (file1.txt, file2.txt, …). */
export function makeRepo(commits = 1): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-')))
  git(dir, 'init', '-q', '-b', 'main')
  for (let i = 1; i <= commits; i++) {
    writeFileSync(join(dir, `file${i}.txt`), `${i}\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', `commit ${i}`)
  }
  return dir
}
```

- [ ] **Step 3: Scrivi i test che falliscono**

`test/integration/runner.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { GitError, GitRunner } from '../../src/main/git/runner'
import type { CommandLogEntry } from '../../src/shared/types'
import { makeRepo } from '../helpers/repo'

// "git" finto: node, per provare coda e stdin senza dipendere dai tempi di git
const node = () => process.execPath

describe('GitRunner', () => {
  it('esegue git e restituisce stdout', async () => {
    const r = await new GitRunner(() => 'git', makeRepo()).run(['rev-parse', '--abbrev-ref', 'HEAD'])
    expect(r.stdout.trim()).toBe('main')
    expect(r.exitCode).toBe(0)
  })

  it('rifiuta con GitError e registra il comando fallito', async () => {
    const log: CommandLogEntry[] = []
    const runner = new GitRunner(() => 'git', makeRepo(), (e) => log.push(e))
    const err = await runner.run(['rev-parse', '--verify', 'nope']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitError)
    expect((err as GitError).info.exitCode).toBe(128)
    expect((err as GitError).info.message).toMatch(/^fatal:/)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ args: ['rev-parse', '--verify', 'nope'], exitCode: 128, ok: false })
  })

  it('okCodes: un exit code previsto non è un errore', async () => {
    const r = await new GitRunner(() => 'git', makeRepo()).run(['rev-parse', '--verify', '-q', 'nope'], { okCodes: [0, 1] })
    expect(r.exitCode).toBe(1)
  })

  it('passa stdin al processo', async () => {
    const r = await new GitRunner(node, process.cwd()).run(['-e', 'process.stdin.pipe(process.stdout)'], { stdin: 'ciao' })
    expect(r.stdout).toBe('ciao')
  })

  it('esegue le scritture una alla volta, anche dopo un errore', async () => {
    const log: CommandLogEntry[] = []
    const runner = new GitRunner(node, process.cwd(), (e) => log.push(e))
    const script = (ms: number, code: number) => ['-e', `setTimeout(() => process.exit(${code}), ${ms})`]
    await Promise.allSettled([
      runner.run(script(150, 1), { write: true }),
      runner.run(script(10, 0), { write: true }),
    ])
    const [first, second] = log
    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
    expect(second.startedAt).toBeGreaterThanOrEqual(first.startedAt + first.durationMs)
  })

  it('le letture non aspettano le scritture', async () => {
    const log: CommandLogEntry[] = []
    const runner = new GitRunner(node, process.cwd(), (e) => log.push(e))
    await Promise.all([
      runner.run(['-e', 'setTimeout(() => {}, 300)'], { write: true }),
      runner.run(['-e', '0']),
    ])
    expect(log[0].args).toEqual(['-e', '0'])
  })

  it('eseguibile mancante: GitError con exitCode null', async () => {
    const err = await new GitRunner(() => '/percorso/inesistente/git', process.cwd()).run(['--version']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitError)
    expect((err as GitError).info.exitCode).toBeNull()
  })
})
```

- [ ] **Step 4: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/integration/runner.test.ts`
Expected: FAIL, perché `src/main/git/runner` non esiste.

- [ ] **Step 5: Implementa GitRunner**

`src/main/git/runner.ts`:
```ts
import { spawn } from 'node:child_process'
import type { CommandLogEntry, GitErrorInfo } from '../../shared/types'

export interface RunOptions {
  /** L'operazione scrive nel repo: va in coda, una sola alla volta per repo. */
  write?: boolean
  /** Exit code considerati successo; default [0]. */
  okCodes?: number[]
  stdin?: string
  env?: Record<string, string>
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class GitError extends Error {
  constructor(readonly info: GitErrorInfo) {
    super(info.message)
    this.name = 'GitError'
  }
}

let nextLogId = 1

/** Esegue git in una cartella. Le letture vanno in parallelo, le scritture in coda (niente conflitti su index.lock). */
export class GitRunner {
  private writes: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly gitPath: () => string,
    readonly cwd: string,
    private readonly log: (entry: CommandLogEntry) => void = () => {},
  ) {}

  run(args: string[], opts: RunOptions = {}): Promise<RunResult> {
    if (!opts.write) return this.exec(args, opts)
    const result = this.writes.then(() => this.exec(args, opts))
    this.writes = result.catch(() => undefined)
    return result
  }

  private exec(args: string[], opts: RunOptions): Promise<RunResult> {
    const okCodes = opts.okCodes ?? [0]
    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
      const child = spawn(this.gitPath(), args, {
        cwd: this.cwd,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // senza credenziali fallisce subito invece di restare in attesa
          LC_ALL: 'C', // messaggi sempre in inglese, quindi riconoscibili
          GIT_OPTIONAL_LOCKS: '0', // status non riscrive l'index: niente ciclo col watcher
          ...opts.env,
        },
      })
      const out: Buffer[] = []
      const err: Buffer[] = []
      let done = false
      const finish = (exitCode: number | null, spawnError?: Error) => {
        if (done) return
        done = true
        const stderr = spawnError ? spawnError.message : Buffer.concat(err).toString('utf8')
        const ok = exitCode !== null && okCodes.includes(exitCode)
        this.log({ id: nextLogId++, repo: this.cwd, args, startedAt, durationMs: Date.now() - startedAt, exitCode, ok, stderr })
        if (exitCode !== null && ok) {
          resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr, exitCode })
        } else {
          const message = firstLine(stderr) ?? `git ${args[0] ?? ''} è fallito (exit ${exitCode})`
          reject(new GitError({ args, exitCode, stderr, message }))
        }
      }
      child.stdout.on('data', (d: Buffer) => out.push(d))
      child.stderr.on('data', (d: Buffer) => err.push(d))
      child.stdin.on('error', () => {}) // EPIPE se il processo esce prima di leggere stdin
      child.on('error', (e) => finish(null, e))
      child.on('close', (code) => finish(code))
      child.stdin.end(opts.stdin ?? '')
    })
  }
}

function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
}
```

- [ ] **Step 6: Esegui i test e verifica che passino**

Run: `npx vitest run test/integration/runner.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 7: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: GitRunner con coda delle scritture e log dei comandi" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Controllo della versione di git

**Files:**
- Create: `src/main/git/check.ts`
- Test: `test/integration/check.test.ts`

**Interfaces:**
- Consumes: `GitCheck` da `src/shared/types.ts`.
- Produces:
  - `checkGit(gitPath: string): Promise<GitCheck>`, che non rifiuta mai e in caso di problemi restituisce `ok: false`;
  - `parseGitVersion(out: string): [number, number, number] | null`;
  - `isAtLeast(v: readonly number[], min: readonly number[]): boolean`;
  - `MIN_GIT = [2, 35, 0]`.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/integration/check.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkGit, isAtLeast, parseGitVersion } from '../../src/main/git/check'

describe('parseGitVersion', () => {
  it('legge le versioni di macOS, Windows e Linux', () => {
    expect(parseGitVersion('git version 2.50.1 (Apple Git-155)\n')).toEqual([2, 50, 1])
    expect(parseGitVersion('git version 2.45.1.windows.1\n')).toEqual([2, 45, 1])
    expect(parseGitVersion('git version 2.39\n')).toEqual([2, 39, 0])
    expect(parseGitVersion('boh')).toBeNull()
  })
})

describe('isAtLeast', () => {
  it('confronta major, minor e patch', () => {
    expect(isAtLeast([2, 35, 0], [2, 35, 0])).toBe(true)
    expect(isAtLeast([2, 34, 9], [2, 35, 0])).toBe(false)
    expect(isAtLeast([2, 100, 0], [2, 35, 0])).toBe(true)
    expect(isAtLeast([3, 0, 0], [2, 35, 0])).toBe(true)
  })
})

describe('checkGit', () => {
  it('git di sistema: ok', async () => {
    const r = await checkGit('git')
    expect(r.ok).toBe(true)
    expect(r.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('eseguibile inesistente', async () => {
    const r = await checkGit('/percorso/inesistente/git')
    expect(r).toMatchObject({ ok: false, version: null })
    expect(r.error).toContain('non trovato')
  })

  it.skipIf(process.platform === 'win32')('versione troppo vecchia', async () => {
    const fake = join(mkdtempSync(join(tmpdir(), 'fakegit-')), 'git')
    writeFileSync(fake, '#!/bin/sh\necho "git version 2.20.1"\n', { mode: 0o755 })
    const r = await checkGit(fake)
    expect(r).toMatchObject({ ok: false, version: '2.20.1' })
    expect(r.error).toContain('2.35.0')
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/integration/check.test.ts`
Expected: FAIL, perché `src/main/git/check` non esiste.

- [ ] **Step 3: Implementa**

`src/main/git/check.ts`:
```ts
import { execFile } from 'node:child_process'
import type { GitCheck } from '../../shared/types'

export const MIN_GIT = [2, 35, 0] as const

export function parseGitVersion(out: string): [number, number, number] | null {
  const m = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(out)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

export function isAtLeast(v: readonly number[], min: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (v[i] !== min[i]) return (v[i] ?? 0) > (min[i] ?? 0)
  }
  return true
}

export function checkGit(gitPath: string): Promise<GitCheck> {
  return new Promise((resolve) => {
    execFile(gitPath, ['--version'], { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, path: gitPath, version: null, error: `Git non trovato (${gitPath}): ${err.message}` })
        return
      }
      const v = parseGitVersion(stdout)
      if (!v) {
        resolve({ ok: false, path: gitPath, version: null, error: `Risposta inattesa da "${gitPath} --version": ${stdout.trim()}` })
        return
      }
      const version = v.join('.')
      if (!isAtLeast(v, MIN_GIT)) {
        resolve({ ok: false, path: gitPath, version, error: `Serve git ${MIN_GIT.join('.')} o successivo, trovato ${version}` })
        return
      }
      resolve({ ok: true, path: gitPath, version, error: null })
    })
  })
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/integration/check.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: controllo della versione di git (>= 2.35)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Informazioni sul repo (radice, branch, HEAD)

**Files:**
- Create: `src/main/git/repo-info.ts`
- Test: `test/integration/repo-info.test.ts`

**Interfaces:**
- Consumes: `GitRunner`, `RunOptions.okCodes` (Task 2), `RepoInfo` (Task 2).
- Produces: `readRepoInfo(runner: GitRunner): Promise<RepoInfo>`. Rifiuta con `GitError` se la cartella non è un repo; funziona anche quando il runner parte da una sottocartella.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/integration/repo-info.test.ts`:
```ts
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readRepoInfo } from '../../src/main/git/repo-info'
import { GitRunner } from '../../src/main/git/runner'
import type { CommandLogEntry } from '../../src/shared/types'
import { git, makeRepo } from '../helpers/repo'

const info = (cwd: string) => readRepoInfo(new GitRunner(() => 'git', cwd))

describe('readRepoInfo', () => {
  it('repo con commit', async () => {
    const repo = makeRepo(1)
    expect(await info(repo)).toEqual({
      root: repo,
      name: basename(repo),
      branch: 'main',
      headSha: git(repo, 'rev-parse', 'HEAD').trim(),
    })
  })

  it('da una sottocartella trova la radice', async () => {
    const repo = makeRepo(1)
    mkdirSync(join(repo, 'a', 'b'), { recursive: true })
    expect((await info(join(repo, 'a', 'b'))).root).toBe(repo)
  })

  it('HEAD staccato', async () => {
    const repo = makeRepo(2)
    git(repo, 'checkout', '-q', '--detach', 'HEAD~1')
    const r = await info(repo)
    expect(r.branch).toBeNull()
    expect(r.headSha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('repo senza commit, senza errori nel log', async () => {
    const repo = makeRepo(0)
    const log: CommandLogEntry[] = []
    const r = await readRepoInfo(new GitRunner(() => 'git', repo, (e) => log.push(e)))
    expect(r).toMatchObject({ branch: 'main', headSha: null })
    expect(log.every((e) => e.ok)).toBe(true)
  })

  it('cartella che non è un repo', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-norepo-')))
    await expect(info(dir)).rejects.toThrow(/not a git repository/)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/integration/repo-info.test.ts`
Expected: FAIL, perché `src/main/git/repo-info` non esiste.

- [ ] **Step 3: Implementa**

`src/main/git/repo-info.ts`:
```ts
import { basename, resolve } from 'node:path'
import type { RepoInfo } from '../../shared/types'
import type { GitRunner } from './runner'

export async function readRepoInfo(runner: GitRunner): Promise<RepoInfo> {
  // resolve(): su Windows git restituisce C:/x/y, noi usiamo C:\x\y
  const root = resolve((await runner.run(['rev-parse', '--show-toplevel'])).stdout.trim())
  // exit 1 = HEAD staccato / repo senza commit: casi normali, non errori
  const [branch, sha] = await Promise.all([
    runner.run(['symbolic-ref', '--short', '-q', 'HEAD'], { okCodes: [0, 1] }),
    runner.run(['rev-parse', '--verify', '-q', 'HEAD'], { okCodes: [0, 1] }),
  ])
  return {
    root,
    name: basename(root),
    branch: branch.stdout.trim() || null,
    headSha: sha.stdout.trim() || null,
  }
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/integration/repo-info.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: lettura di radice, branch e HEAD del repo" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Watcher e RepoSession

**Files:**
- Create: `src/main/watcher.ts`, `src/main/repo-session.ts`
- Modify: `package.json`, per aggiungere `@parcel/watcher` alle `dependencies`
- Test: `test/integration/repo-session.test.ts`

**Interfaces:**
- Consumes: `GitRunner` (Task 2), `CommandLogEntry` (Task 2).
- Produces:
  - `watchRepo(root: string, onChange: () => void, debounceMs?: number): Promise<() => Promise<void>>`, dove `debounceMs` vale 300 se non indicato;
  - `class RepoSession { readonly root: string; readonly runner: GitRunner; constructor(root: string, gitPath: () => string, log: (e: CommandLogEntry) => void); start(onChanged: () => void): Promise<void>; dispose(): Promise<void> }`.

- [ ] **Step 1: Installa @parcel/watcher come dipendenza runtime**

```bash
npm i -E @parcel/watcher@2.6.0
```

Expected: in `package.json` compare `"dependencies": { "@parcel/watcher": "2.6.0" }`. L'avviso `allow-scripts` di npm si può ignorare: lo script serve solo a compilare dai sorgenti quando manca il binario precompilato, che invece c'è per macOS, Windows e Linux.

- [ ] **Step 2: Scrivi i test che falliscono**

`test/integration/repo-session.test.ts`:
```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RepoSession } from '../../src/main/repo-session'
import { watchRepo } from '../../src/main/watcher'
import { git, makeRepo } from '../helpers/repo'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('RepoSession', () => {
  it('segnala modifiche ai file e ai ref, e smette dopo dispose', async () => {
    const repo = makeRepo(1)
    const session = new RepoSession(repo, () => 'git', () => {})
    let calls = 0
    await session.start(() => calls++)

    writeFileSync(join(repo, 'nuovo.txt'), 'x')
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 5000 })

    calls = 0
    git(repo, 'switch', '-q', '-c', 'altro')
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 5000 })

    await session.dispose()
    calls = 0
    writeFileSync(join(repo, 'dopo.txt'), 'x')
    await sleep(1000)
    expect(calls).toBe(0)
  })
})

describe('watchRepo', () => {
  it('raggruppa le modifiche ravvicinate (debounce)', async () => {
    const repo = makeRepo(1)
    let calls = 0
    const stop = await watchRepo(repo, () => calls++)
    for (let i = 0; i < 20; i++) writeFileSync(join(repo, `f${i}.txt`), 'x')
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0), { timeout: 5000 })
    await sleep(600)
    expect(calls).toBeLessThan(20)
    await stop()
  })
})
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/integration/repo-session.test.ts`
Expected: FAIL, perché `src/main/repo-session` non esiste.

- [ ] **Step 4: Implementa**

`src/main/watcher.ts`:
```ts
import { subscribe } from '@parcel/watcher'

/** Chiama onChange (con debounce) a ogni modifica sotto root. Restituisce la funzione per smettere. */
export async function watchRepo(root: string, onChange: () => void, debounceMs = 300): Promise<() => Promise<void>> {
  let timer: NodeJS.Timeout | undefined
  const subscription = await subscribe(
    root,
    (err) => {
      if (err) return
      clearTimeout(timer)
      timer = setTimeout(onChange, debounceMs)
    },
    { ignore: ['.git/objects', 'node_modules'] },
  )
  return async () => {
    clearTimeout(timer)
    await subscription.unsubscribe()
  }
}
```

`src/main/repo-session.ts`:
```ts
import type { CommandLogEntry } from '../shared/types'
import { GitRunner } from './git/runner'
import { watchRepo } from './watcher'

/** Un repo aperto: esegue git nella sua cartella e segnala quando cambia sul disco. */
export class RepoSession {
  readonly runner: GitRunner
  private stopWatching: (() => Promise<void>) | null = null

  constructor(
    readonly root: string,
    gitPath: () => string,
    log: (entry: CommandLogEntry) => void,
  ) {
    this.runner = new GitRunner(gitPath, root, log)
  }

  async start(onChanged: () => void): Promise<void> {
    this.stopWatching = await watchRepo(this.root, onChanged)
  }

  async dispose(): Promise<void> {
    await this.stopWatching?.()
    this.stopWatching = null
  }
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run test/integration/repo-session.test.ts`
Expected: PASS, 2 test.

- [ ] **Step 6: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: RepoSession con watcher dei file e debounce" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Impostazioni e argomenti da riga di comando

**Files:**
- Create: `src/main/settings.ts`, `src/main/argv.ts`
- Test: `test/unit/settings.test.ts`, `test/unit/argv.test.ts`

**Interfaces:**
- Consumes: `AppSettings` (Task 2).
- Produces:
  - `class SettingsStore { constructor(file: string); get(): AppSettings; update(patch: Partial<AppSettings>): AppSettings }`;
  - `addRecent(list: string[], path: string): string[]`, che tiene al massimo 10 percorsi;
  - `pathFromArgv(argv: string[], cwd: string, appPath: string, isDir: (p: string) => boolean): string | null`.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/unit/settings.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addRecent, SettingsStore } from '../../src/main/settings'

const file = () => join(mkdtempSync(join(tmpdir(), 'merlino-settings-')), 'sub', 'settings.json')

describe('SettingsStore', () => {
  it('senza file usa i default', () => {
    expect(new SettingsStore(file()).get()).toEqual({ gitPath: 'git', openRepos: [], activeRepo: null, recentRepos: [] })
  })

  it('update salva su disco e una nuova istanza rilegge', () => {
    const f = file()
    new SettingsStore(f).update({ gitPath: '/usr/bin/git', openRepos: ['/a'] })
    expect(new SettingsStore(f).get()).toEqual({ gitPath: '/usr/bin/git', openRepos: ['/a'], activeRepo: null, recentRepos: [] })
  })

  it('file corrotto: si riparte dai default', () => {
    const f = file()
    new SettingsStore(f).update({})
    writeFileSync(f, '{rotto')
    expect(new SettingsStore(f).get().gitPath).toBe('git')
  })

  it('get restituisce una copia', () => {
    const s = new SettingsStore(file())
    s.get().openRepos.push('/x')
    expect(s.get().openRepos).toEqual([])
  })
})

describe('addRecent', () => {
  it('mette in cima, senza doppioni, al massimo 10', () => {
    expect(addRecent(['/a', '/b'], '/b')).toEqual(['/b', '/a'])
    const full = Array.from({ length: 10 }, (_, i) => `/r${i}`)
    expect(addRecent(full, '/nuovo')).toHaveLength(10)
    expect(addRecent(full, '/nuovo')[0]).toBe('/nuovo')
  })
})
```

`test/unit/argv.test.ts`:
```ts
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pathFromArgv } from '../../src/main/argv'

describe('pathFromArgv', () => {
  const app = resolve('/app')
  const dirs = new Set([resolve('/repo'), app, resolve('/work/sub')])
  const isDir = (p: string) => dirs.has(p)

  it('prende la cartella passata', () => {
    expect(pathFromArgv(['merlino', '/repo'], '/x', app, isDir)).toBe(resolve('/repo'))
  })

  it("ignora i flag e il percorso dell'app", () => {
    expect(pathFromArgv(['electron', '--inspect=0', '.', '/repo'], app, app, isDir)).toBe(resolve('/repo'))
  })

  it('risolve i percorsi relativi rispetto a cwd', () => {
    expect(pathFromArgv(['merlino', 'sub'], '/work', app, isDir)).toBe(resolve('/work/sub'))
  })

  it('null se non ci sono cartelle', () => {
    expect(pathFromArgv(['merlino', '.', 'file.txt'], app, app, isDir)).toBeNull()
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit`
Expected: FAIL, perché i moduli `settings` e `argv` non esistono.

- [ ] **Step 3: Implementa**

`src/main/settings.ts`:
```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AppSettings } from '../shared/types'

const DEFAULTS: AppSettings = { gitPath: 'git', openRepos: [], activeRepo: null, recentRepos: [] }
const MAX_RECENT = 10

/** Impostazioni dell'app in un file JSON. */
export class SettingsStore {
  private data: AppSettings

  constructor(private readonly file: string) {
    try {
      this.data = { ...structuredClone(DEFAULTS), ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>) }
    } catch {
      this.data = structuredClone(DEFAULTS)
    }
  }

  get(): AppSettings {
    return structuredClone(this.data)
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch }
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file) // scrittura atomica: un crash non lascia il file a metà
    return this.get()
  }
}

export function addRecent(list: string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT)
}
```

`src/main/argv.ts`:
```ts
import { resolve } from 'node:path'

/** Cartella passata da riga di comando (`merlino <cartella>`), ignorando i flag e il percorso dell'app stessa. */
export function pathFromArgv(
  argv: string[],
  cwd: string,
  appPath: string,
  isDir: (p: string) => boolean,
): string | null {
  for (const arg of argv.slice(1).reverse()) {
    if (arg.startsWith('-')) continue
    const path = resolve(cwd, arg)
    if (path !== resolve(appPath) && isDir(path)) return path
  }
  return null
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit`
Expected: PASS, 9 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: impostazioni su file e cartella da riga di comando" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Contratto IPC, handler nel main, preload

**Files:**
- Create: `src/shared/ipc.ts`, `src/main/ipc-handlers.ts`, `src/renderer/env.d.ts`
- Modify: `src/main/index.ts` (sostituito interamente), `src/preload/index.ts` (sostituito interamente)
- Test: `test/e2e/api.spec.ts`

**Interfaces:**
- Consumes: `GitRunner`, `GitError` (Task 2), `checkGit` (Task 3), `readRepoInfo` (Task 4), `RepoSession` (Task 5), `SettingsStore`, `addRecent`, `pathFromArgv` (Task 6).
- Produces:
  - `Result<T>`, `Channels` e `interface Api` in `src/shared/ipc.ts` (vedi sotto);
  - `window.api: Api` nel renderer;
  - `registerIpc(win, settings, initialPath): { disposeAll(): Promise<void> }`.

- [ ] **Step 1: Scrivi il test E2E che fallisce**

`test/e2e/api.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import type { Api } from '../../src/shared/ipc'
import { makeRepo } from '../helpers/repo'
import { launch } from './launch'

type Win = { api: Api }

test('window.api: controllo git, apertura repo e log dei comandi', async () => {
  const repo = makeRepo(1)
  const { app, page } = await launch()

  const check = await page.evaluate(() => (globalThis as unknown as Win).api.checkGit())
  expect(check.ok).toBe(true)

  const opened = await page.evaluate((p) => (globalThis as unknown as Win).api.openRepo(p), repo)
  expect(opened).toMatchObject({ ok: true, value: { root: repo, branch: 'main' } })

  const missing = await page.evaluate(() => (globalThis as unknown as Win).api.openRepo('/percorso/inesistente'))
  expect(missing.ok).toBe(false)

  const log = await page.evaluate(() => (globalThis as unknown as Win).api.getCommandLog())
  expect(log.some((e) => e.args.join(' ') === 'rev-parse --show-toplevel')).toBe(true)

  const settings = await page.evaluate(() => (globalThis as unknown as Win).api.getSettings())
  expect(settings.openRepos).toEqual([repo])
  expect(settings.recentRepos).toEqual([repo])

  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: FAIL, `Cannot find module '../../src/shared/ipc'`.

- [ ] **Step 3: Crea il contratto IPC**

`src/shared/ipc.ts`:
```ts
import type { AppSettings, CommandLogEntry, GitCheck, GitErrorInfo, RepoInfo } from './types'

export type Result<T> = { ok: true; value: T } | { ok: false; error: GitErrorInfo }

export const Channels = {
  getSettings: 'settings:get',
  checkGit: 'git:check',
  setGitPath: 'git:set-path',
  pickRepoFolder: 'repo:pick-folder',
  takeInitialPath: 'app:take-initial-path',
  openRepo: 'repo:open',
  initRepo: 'repo:init',
  closeRepo: 'repo:close',
  setActiveRepo: 'repo:set-active',
  repoInfo: 'repo:info',
  getCommandLog: 'log:get',
  // eventi dal main al renderer
  repoChanged: 'repo:changed',
  commandLogged: 'log:entry',
  menuAction: 'menu:action',
  openPath: 'app:open-path',
} as const

/** API esposta al renderer come window.api: solo operazioni con nome, mai argomenti git liberi. */
export interface Api {
  platform: string
  getSettings(): Promise<AppSettings>
  checkGit(): Promise<GitCheck>
  setGitPath(path: string): Promise<GitCheck>
  /** Dialog di scelta cartella; null se annullato. */
  pickRepoFolder(): Promise<string | null>
  /** Cartella passata da riga di comando all'avvio; la restituisce una volta sola. */
  takeInitialPath(): Promise<string | null>
  openRepo(path: string): Promise<Result<RepoInfo>>
  initRepo(path: string): Promise<Result<RepoInfo>>
  closeRepo(root: string): Promise<void>
  setActiveRepo(root: string | null): Promise<void>
  repoInfo(root: string): Promise<Result<RepoInfo>>
  getCommandLog(): Promise<CommandLogEntry[]>
  /** Percorso sul disco di un file o di una cartella trascinati nella finestra. */
  pathForFile(file: File): string
  onRepoChanged(cb: (root: string) => void): () => void
  onCommandLogged(cb: (entry: CommandLogEntry) => void): () => void
  onMenuAction(cb: (actionId: string) => void): () => void
  onOpenPath(cb: (path: string) => void): () => void
}
```

- [ ] **Step 4: Crea gli handler IPC**

`src/main/ipc-handlers.ts`:
```ts
import { type BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { Channels, type Result } from '../shared/ipc'
import type { CommandLogEntry, GitErrorInfo, RepoInfo } from '../shared/types'
import { checkGit } from './git/check'
import { readRepoInfo } from './git/repo-info'
import { GitError, GitRunner } from './git/runner'
import { RepoSession } from './repo-session'
import { addRecent, type SettingsStore } from './settings'

const MAX_LOG = 500

/** Gli argomenti arrivano dal renderer: si validano qui. */
function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${name} deve essere una stringa non vuota`)
  return value
}

function fail(e: unknown): { ok: false; error: GitErrorInfo } {
  if (e instanceof GitError) return { ok: false, error: e.info }
  const message = e instanceof Error ? e.message : String(e)
  return { ok: false, error: { args: [], exitCode: null, stderr: message, message } }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function registerIpc(win: () => BrowserWindow | null, settings: SettingsStore, initialPath: string | null) {
  const sessions = new Map<string, RepoSession>()
  const log: CommandLogEntry[] = []
  let pendingPath = initialPath
  const gitPath = () => settings.get().gitPath
  const send = (channel: string, payload: unknown) => win()?.webContents.send(channel, payload)
  const onLog = (entry: CommandLogEntry) => {
    log.push(entry)
    if (log.length > MAX_LOG) log.shift()
    send(Channels.commandLogged, entry)
  }

  async function open(path: string): Promise<Result<RepoInfo>> {
    try {
      if (!isDirectory(path)) throw new Error(`Cartella non trovata: ${path}`)
      const info = await readRepoInfo(new GitRunner(gitPath, path, onLog))
      if (!sessions.has(info.root)) {
        const session = new RepoSession(info.root, gitPath, onLog)
        sessions.set(info.root, session)
        // Senza watcher il repo funziona lo stesso: si aggiorna al ritorno del focus
        await session.start(() => send(Channels.repoChanged, info.root)).catch((e) => console.error('watcher', info.root, e))
      }
      const s = settings.get()
      settings.update({
        openRepos: s.openRepos.includes(info.root) ? s.openRepos : [...s.openRepos, info.root],
        recentRepos: addRecent(s.recentRepos, info.root),
      })
      return { ok: true, value: info }
    } catch (e) {
      return fail(e)
    }
  }

  ipcMain.handle(Channels.getSettings, () => settings.get())
  ipcMain.handle(Channels.checkGit, () => checkGit(gitPath()))
  ipcMain.handle(Channels.setGitPath, (_e, path: unknown) => {
    settings.update({ gitPath: str(path, 'path') })
    return checkGit(gitPath())
  })
  ipcMain.handle(Channels.pickRepoFolder, async () => {
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle(Channels.takeInitialPath, () => {
    const path = pendingPath
    pendingPath = null
    return path
  })
  ipcMain.handle(Channels.openRepo, (_e, path: unknown) => open(str(path, 'path')))
  ipcMain.handle(Channels.initRepo, async (_e, p: unknown) => {
    const path = str(p, 'path')
    try {
      await new GitRunner(gitPath, path, onLog).run(['init'], { write: true })
    } catch (e) {
      return fail(e)
    }
    return open(path)
  })
  ipcMain.handle(Channels.closeRepo, async (_e, r: unknown) => {
    const root = str(r, 'root')
    await sessions.get(root)?.dispose()
    sessions.delete(root)
    const s = settings.get()
    settings.update({
      openRepos: s.openRepos.filter((x) => x !== root),
      activeRepo: s.activeRepo === root ? null : s.activeRepo,
    })
  })
  ipcMain.handle(Channels.setActiveRepo, (_e, r: unknown) => {
    settings.update({ activeRepo: r === null ? null : str(r, 'root') })
  })
  ipcMain.handle(Channels.repoInfo, async (_e, r: unknown) => {
    const session = sessions.get(str(r, 'root'))
    if (!session) return fail(new Error('Repository non aperto'))
    try {
      return { ok: true, value: await readRepoInfo(session.runner) }
    } catch (e) {
      return fail(e)
    }
  })
  ipcMain.handle(Channels.getCommandLog, () => log)

  return {
    async disposeAll(): Promise<void> {
      await Promise.all([...sessions.values()].map((s) => s.dispose()))
      sessions.clear()
    },
  }
}
```

- [ ] **Step 5: Sostituisci il main**

`src/main/index.ts` (contenuto completo):
```ts
import { app, BrowserWindow, shell } from 'electron'
import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Channels } from '../shared/ipc'
import { pathFromArgv } from './argv'
import { registerIpc } from './ipc-handlers'
import { SettingsStore } from './settings'

if (process.env.MERLINO_USER_DATA) app.setPath('userData', process.env.MERLINO_USER_DATA)

// Gli errori non gestiti finiscono in un file di log e l'app resta aperta
const logFile = join(app.getPath('userData'), 'logs', 'main.log')
function logError(err: unknown): void {
  mkdirSync(dirname(logFile), { recursive: true })
  appendFileSync(logFile, `${new Date().toISOString()} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
}
process.on('uncaughtException', logError)
process.on('unhandledRejection', logError)

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
const argvPath = (argv: string[], cwd: string) => pathFromArgv(argv, cwd, app.getAppPath(), isDir)

let win: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Merlino',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  w.once('ready-to-show', () => w.show())
  w.on('closed', () => {
    win = null
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Una cartella trascinata fuori dalla zona di drop farebbe navigare la finestra verso file://
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
  return w
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
    const path = argvPath(argv, cwd)
    if (path) win.webContents.send(Channels.openPath, path)
  })

  void app.whenReady().then(() => {
    const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
    const ipc = registerIpc(() => win, settings, argvPath(process.argv, process.cwd()))
    win = createWindow()
    app.on('before-quit', () => void ipc.disposeAll())
  })

  app.on('window-all-closed', () => app.quit())
}
```

- [ ] **Step 6: Sostituisci il preload e tipizza window.api**

`src/preload/index.ts` (contenuto completo):
```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from 'electron'
import { type Api, Channels } from '../shared/ipc'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: Api = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke(Channels.getSettings),
  checkGit: () => ipcRenderer.invoke(Channels.checkGit),
  setGitPath: (path) => ipcRenderer.invoke(Channels.setGitPath, path),
  pickRepoFolder: () => ipcRenderer.invoke(Channels.pickRepoFolder),
  takeInitialPath: () => ipcRenderer.invoke(Channels.takeInitialPath),
  openRepo: (path) => ipcRenderer.invoke(Channels.openRepo, path),
  initRepo: (path) => ipcRenderer.invoke(Channels.initRepo, path),
  closeRepo: (root) => ipcRenderer.invoke(Channels.closeRepo, root),
  setActiveRepo: (root) => ipcRenderer.invoke(Channels.setActiveRepo, root),
  repoInfo: (root) => ipcRenderer.invoke(Channels.repoInfo, root),
  getCommandLog: () => ipcRenderer.invoke(Channels.getCommandLog),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onRepoChanged: (cb) => on(Channels.repoChanged, cb),
  onCommandLogged: (cb) => on(Channels.commandLogged, cb),
  onMenuAction: (cb) => on(Channels.menuAction, cb),
  onOpenPath: (cb) => on(Channels.openPath, cb),
}

contextBridge.exposeInMainWorld('api', api)
```

`src/renderer/env.d.ts`:
```ts
import type { Api } from '../shared/ipc'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

- [ ] **Step 7: Esegui i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 2 test (`app.spec.ts` e `api.spec.ts`).

- [ ] **Step 8: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: contratto IPC, handler nel main e preload in sandbox" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Registro delle azioni

**Files:**
- Create: `src/renderer/actions/registry.ts`
- Test: `test/unit/registry.test.ts`

**Interfaces:**
- Produces:
  - `interface Keys { key: string; mod?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean }`;
  - `interface Action { id: string; title: string; keys?: Keys; when?: () => boolean; run: () => unknown }`;
  - `interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }`;
  - `class ActionRegistry { constructor(isMac: boolean); register(...a: Action[]): void; enabled(): Action[]; run(id: string): boolean; match(e: KeyLike): Action | undefined; keyLabel(k: Keys): string }`;
  - `fuzzy(query: string, text: string): boolean`.
- Il registro non usa il DOM, così si testa con Vitest in Node.

- [ ] **Step 1: Scrivi i test che falliscono**

`test/unit/registry.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { ActionRegistry, fuzzy, type KeyLike } from '../../src/renderer/actions/registry'

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
})
const noop = () => {}

describe('ActionRegistry', () => {
  it('mod = Cmd su macOS, Ctrl su Windows e Linux', () => {
    const mac = new ActionRegistry(true)
    const pc = new ActionRegistry(false)
    const action = { id: 'x', title: 'X', keys: { key: 'o', mod: true }, run: noop }
    mac.register(action)
    pc.register(action)
    expect(mac.match(key('o', { metaKey: true }))?.id).toBe('x')
    expect(mac.match(key('o', { ctrlKey: true }))).toBeUndefined()
    expect(pc.match(key('o', { ctrlKey: true }))?.id).toBe('x')
    expect(pc.match(key('o', { metaKey: true }))).toBeUndefined()
  })

  it('i modificatori devono coincidere esattamente', () => {
    const r = new ActionRegistry(true)
    r.register(
      { id: 'open', title: 'Apri', keys: { key: 'o', mod: true }, run: noop },
      { id: 'out', title: 'Output', keys: { key: 'o', mod: true, shift: true }, run: noop },
    )
    expect(r.match(key('O', { metaKey: true, shiftKey: true }))?.id).toBe('out')
    expect(r.match(key('o', { metaKey: true }))?.id).toBe('open')
  })

  it('ctrl esplicito resta Ctrl anche su macOS', () => {
    const r = new ActionRegistry(true)
    r.register({ id: 'next', title: 'Tab successiva', keys: { key: 'Tab', ctrl: true }, run: noop })
    expect(r.match(key('Tab', { ctrlKey: true }))?.id).toBe('next')
  })

  it('when falso: nessun match e run non esegue', () => {
    const r = new ActionRegistry(false)
    const run = vi.fn()
    r.register({ id: 'x', title: 'X', keys: { key: 'w', mod: true }, when: () => false, run })
    expect(r.match(key('w', { ctrlKey: true }))).toBeUndefined()
    expect(r.enabled()).toEqual([])
    expect(r.run('x')).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it("run esegue un'azione abilitata", () => {
    const r = new ActionRegistry(false)
    const run = vi.fn()
    r.register({ id: 'x', title: 'X', run })
    expect(r.run('x')).toBe(true)
    expect(r.run('inesistente')).toBe(false)
    expect(run).toHaveBeenCalledOnce()
  })

  it('keyLabel nel formato di ogni sistema', () => {
    expect(new ActionRegistry(true).keyLabel({ key: 'p', mod: true, shift: true })).toBe('⇧⌘P')
    expect(new ActionRegistry(false).keyLabel({ key: 'p', mod: true, shift: true })).toBe('Ctrl+Shift+P')
    expect(new ActionRegistry(true).keyLabel({ key: 'Tab', ctrl: true })).toBe('⌃Tab')
  })
})

describe('fuzzy', () => {
  it('lettere nello stesso ordine, maiuscole e spazi ignorati', () => {
    expect(fuzzy('apr', 'Apri repository…')).toBe(true)
    expect(fuzzy('ar', 'Apri repository…')).toBe(true)
    expect(fuzzy('nuovo rep', 'Nuovo repository…')).toBe(true)
    expect(fuzzy('ra', 'Apri')).toBe(false)
    expect(fuzzy('', 'Qualsiasi')).toBe(true)
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run test/unit/registry.test.ts`
Expected: FAIL, perché `src/renderer/actions/registry` non esiste.

- [ ] **Step 3: Implementa**

`src/renderer/actions/registry.ts`:
```ts
/** Combinazione di tasti. mod = Cmd su macOS, Ctrl su Windows e Linux; ctrl = sempre Ctrl. */
export interface Keys {
  key: string
  mod?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface Action {
  id: string
  title: string
  keys?: Keys
  /** Se restituisce false, l'azione non compare nella palette e la scorciatoia è ignorata. */
  when?: () => boolean
  run: () => unknown
}

/** La parte di KeyboardEvent che serve, così il registro si testa senza DOM. */
export interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const isEnabled = (a: Action): boolean => a.when?.() ?? true

/** Unica fonte di azioni per command palette, menu e scorciatoie. */
export class ActionRegistry {
  private readonly actions = new Map<string, Action>()

  constructor(private readonly isMac: boolean) {}

  register(...list: Action[]): void {
    for (const a of list) this.actions.set(a.id, a)
  }

  enabled(): Action[] {
    return [...this.actions.values()].filter(isEnabled)
  }

  run(id: string): boolean {
    const action = this.actions.get(id)
    if (!action || !isEnabled(action)) return false
    void action.run()
    return true
  }

  match(e: KeyLike): Action | undefined {
    return this.enabled().find((a) => a.keys !== undefined && this.matches(a.keys, e))
  }

  keyLabel(k: Keys): string {
    const key = k.key.length === 1 ? k.key.toUpperCase() : k.key
    if (this.isMac) return `${k.ctrl ? '⌃' : ''}${k.alt ? '⌥' : ''}${k.shift ? '⇧' : ''}${k.mod ? '⌘' : ''}${key}`
    return [k.mod || k.ctrl ? 'Ctrl' : '', k.alt ? 'Alt' : '', k.shift ? 'Shift' : '', key].filter(Boolean).join('+')
  }

  private matches(k: Keys, e: KeyLike): boolean {
    const meta = this.isMac && !!k.mod
    const ctrl = this.isMac ? !!k.ctrl : !!(k.mod || k.ctrl)
    return (
      e.key.toLowerCase() === k.key.toLowerCase() &&
      e.metaKey === meta &&
      e.ctrlKey === ctrl &&
      e.shiftKey === !!k.shift &&
      e.altKey === !!k.alt
    )
  }
}

/** true se le lettere della ricerca compaiono in text nello stesso ordine (spazi e maiuscole ignorati). */
export function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, '')
  const t = text.toLowerCase()
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i >= q.length
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run test/unit/registry.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Lint, typecheck e commit**

```bash
npm run lint && npm run typecheck
git add -A
git commit -m "feat: registro delle azioni con scorciatoie e ricerca fuzzy" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Store e interfaccia (tab, benvenuto, repo, git mancante)

**Files:**
- Create: `src/renderer/styles.css`, `src/renderer/stores/app.ts`, `src/renderer/stores/repo.ts`
- Create: `src/renderer/components/TabBar.vue`, `WelcomeScreen.vue`, `GitMissing.vue`, `RepoView.vue`
- Modify: `src/renderer/main.ts`, `src/renderer/App.vue` (entrambi sostituiti interamente)
- Test: `test/e2e/repo.spec.ts`

**Interfaces:**
- Consumes: `window.api` (Task 7), `Result`, `RepoInfo`, `GitCheck`, `CommandLogEntry`.
- Produces:
  - `useAppStore()` con stato `git`, `tabs: string[]`, `active: string | null`, `recent`, `error`, `log`, `outputOpen`, `paletteOpen`;
  - sempre in `useAppStore()`, i metodi `init()`, `setGitPath(p)`, `open(p, focus?)`, `initRepo(p)`, `pickAndOpen()`, `pickAndInit()`, `activate(root)`, `close(root)`, `cycle(1 | -1)` e `pushUiError(err)`;
  - `useRepoStore(root)` con `info`, `error` e `refresh()`;
  - `disposeRepoStore(root)`;
  - i `data-testid` `repo-branch`, `tab` e `git-path`.

- [ ] **Step 1: Scrivi il test E2E che fallisce**

`test/e2e/repo.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch, tempUserData } from './launch'

test('apre il repo passato da riga di comando e segue il branch', async () => {
  const repo = makeRepo(1)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('repo-branch')).toHaveText('main')
  await expect(page.getByTestId('tab')).toHaveText(/merlino-/)
  git(repo, 'switch', '-q', '-c', 'feature/prova')
  await expect(page.getByTestId('repo-branch')).toHaveText('feature/prova')
  await app.close()
})

test('riapre le tab al riavvio', async () => {
  const repo = makeRepo(1)
  const first = await launch([repo])
  await expect(first.page.getByTestId('repo-branch')).toHaveText('main')
  await first.app.close()

  const second = await launch([], first.userData)
  await expect(second.page.getByTestId('repo-branch')).toHaveText('main')
  await second.app.close()
})

test('git non trovato: si può indicare il percorso', async () => {
  const userData = tempUserData()
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ gitPath: '/percorso/inesistente/git' }))
  const { app, page } = await launch([], userData)
  await expect(page.getByRole('heading', { name: 'Git non disponibile' })).toBeVisible()
  await page.getByTestId('git-path').fill('git')
  await page.getByRole('button', { name: 'Riprova' }).click()
  await expect(page.getByRole('button', { name: 'Apri repository…' })).toBeVisible()
  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:e2e -- test/e2e/repo.spec.ts`
Expected: FAIL, perché `repo-branch` non esiste.

- [ ] **Step 3: Crea gli stili globali (tema chiaro/scuro dal sistema)**

`src/renderer/styles.css`:
```css
:root {
  color-scheme: light dark;
  --bg: #fbfbfc;
  --bg-alt: #f0f1f3;
  --bg-hover: #e6e8eb;
  --fg: #24272b;
  --fg-muted: #6b7280;
  --border: #dcdfe4;
  --accent: hsl(170 70% 32%);
  --accent-fg: #fff;
  --danger: #b3261e;
  --danger-bg: #fdecea;
  font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1d21;
    --bg-alt: #24272c;
    --bg-hover: #2e3238;
    --fg: #e3e5e8;
    --fg-muted: #9aa0a8;
    --border: #33373e;
    --accent: hsl(170 55% 50%);
    --accent-fg: #0d1f1c;
    --danger: #f28b82;
    --danger-bg: #3b1f1d;
  }
}

* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; background: var(--bg); color: var(--fg); }
button { font: inherit; color: inherit; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 5px; padding: 4px 10px; cursor: pointer; }
button:hover { background: var(--bg-hover); }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
button:disabled { opacity: 0.5; cursor: default; }
input { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; }
input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
a { color: var(--accent); }
code, pre, kbd { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.muted { color: var(--fg-muted); }
.error { color: var(--danger); }
.center { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; }
.spacer { flex: 1; }
```

- [ ] **Step 4: Crea gli store**

`src/renderer/stores/repo.ts`:
```ts
import { defineStore, getActivePinia } from 'pinia'
import { ref } from 'vue'
import type { RepoInfo } from '../../shared/types'

const storeId = (root: string) => `repo:${root}`

function define(root: string) {
  return defineStore(storeId(root), () => {
    const info = ref<RepoInfo | null>(null)
    const error = ref<string | null>(null)

    async function refresh() {
      const r = await window.api.repoInfo(root)
      if (r.ok) {
        info.value = r.value
        error.value = null
      } else {
        error.value = r.error.message
      }
    }

    return { root, info, error, refresh }
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

`src/renderer/stores/app.ts`:
```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Result } from '../../shared/ipc'
import type { CommandLogEntry, GitCheck, RepoInfo } from '../../shared/types'
import { disposeRepoStore, useRepoStore } from './repo'

const MAX_LOG = 500
let uiErrorId = -1

export const useAppStore = defineStore('app', () => {
  const git = ref<GitCheck | null>(null)
  const tabs = ref<string[]>([])
  const active = ref<string | null>(null)
  const recent = ref<string[]>([])
  const error = ref<string | null>(null)
  const log = ref<CommandLogEntry[]>([])
  const outputOpen = ref(false)
  const paletteOpen = ref(false)

  function addLog(entry: CommandLogEntry) {
    log.value.push(entry)
    if (log.value.length > MAX_LOG) log.value.shift()
  }

  /** Errori del renderer: finiscono nel pannello di output. */
  function pushUiError(err: unknown) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    addLog({ id: uiErrorId--, repo: null, args: [], startedAt: Date.now(), durationMs: 0, exitCode: null, ok: false, stderr: message })
    outputOpen.value = true
  }

  /** Da chiamare una volta, all'avvio. */
  async function init() {
    window.api.onCommandLogged(addLog)
    window.api.onRepoChanged((root) => {
      if (tabs.value.includes(root)) void useRepoStore(root).refresh()
    })
    window.api.onOpenPath((path) => void open(path))
    window.addEventListener('focus', () => {
      if (active.value) void useRepoStore(active.value).refresh()
    })
    log.value = await window.api.getCommandLog()
    git.value = await window.api.checkGit()
    if (git.value.ok) await restore()
  }

  async function restore() {
    const settings = await window.api.getSettings()
    recent.value = settings.recentRepos
    for (const path of settings.openRepos) {
      if (!(await open(path, false))) await window.api.closeRepo(path)
    }
    const initial = await window.api.takeInitialPath()
    if (initial) await open(initial)
    else activate(settings.activeRepo && tabs.value.includes(settings.activeRepo) ? settings.activeRepo : (tabs.value[0] ?? null))
  }

  async function setGitPath(path: string) {
    git.value = await window.api.setGitPath(path)
    if (git.value.ok) await restore()
  }

  async function addTab(result: Result<RepoInfo>, focus: boolean): Promise<boolean> {
    if (!result.ok) {
      error.value = result.error.message
      return false
    }
    error.value = null
    const { root } = result.value
    useRepoStore(root).info = result.value
    if (!tabs.value.includes(root)) tabs.value.push(root)
    recent.value = (await window.api.getSettings()).recentRepos
    if (focus) activate(root)
    return true
  }

  const open = async (path: string, focus = true) => addTab(await window.api.openRepo(path), focus)
  const initRepo = async (path: string) => addTab(await window.api.initRepo(path), true)

  async function pickAndOpen() {
    const path = await window.api.pickRepoFolder()
    if (path) await open(path)
  }

  async function pickAndInit() {
    const path = await window.api.pickRepoFolder()
    if (path) await initRepo(path)
  }

  function activate(root: string | null) {
    active.value = root
    void window.api.setActiveRepo(root)
  }

  async function close(root: string) {
    const i = tabs.value.indexOf(root)
    if (i === -1) return
    tabs.value.splice(i, 1)
    if (active.value === root) activate(tabs.value[Math.min(i, tabs.value.length - 1)] ?? null)
    await window.api.closeRepo(root)
    disposeRepoStore(root)
  }

  function cycle(step: 1 | -1) {
    if (tabs.value.length < 2 || !active.value) return
    const i = tabs.value.indexOf(active.value)
    activate(tabs.value[(i + step + tabs.value.length) % tabs.value.length] ?? null)
  }

  return {
    git, tabs, active, recent, error, log, outputOpen, paletteOpen,
    init, setGitPath, open, initRepo, pickAndOpen, pickAndInit, activate, close, cycle, pushUiError,
  }
})
```

- [ ] **Step 5: Crea i componenti**

`src/renderer/components/TabBar.vue`:
```vue
<script setup lang="ts">
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'

const app = useAppStore()
const name = (root: string) => useRepoStore(root).info?.name ?? root
</script>

<template>
  <nav class="tabs">
    <div
      v-for="root in app.tabs"
      :key="root"
      class="tab"
      :class="{ active: root === app.active }"
      :title="root"
      data-testid="tab"
      @click="app.activate(root)"
    >
      <span>{{ name(root) }}</span>
      <button class="close" aria-label="Chiudi tab" @click.stop="app.close(root)">×</button>
    </div>
    <button class="add" aria-label="Apri repository" @click="app.pickAndOpen()">+</button>
  </nav>
</template>

<style scoped>
.tabs { display: flex; align-items: stretch; min-height: 34px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.tab { display: flex; align-items: center; gap: 6px; max-width: 220px; padding: 0 6px 0 12px; border-right: 1px solid var(--border); cursor: default; }
.tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab.active { background: var(--bg); box-shadow: inset 0 -2px var(--accent); }
.close, .add { border: 0; background: transparent; padding: 2px 6px; }
</style>
```

`src/renderer/components/WelcomeScreen.vue`:
```vue
<script setup lang="ts">
import { useAppStore } from '../stores/app'

const app = useAppStore()
</script>

<template>
  <section class="welcome">
    <h1>Merlino</h1>
    <div class="actions">
      <button class="primary" @click="app.pickAndOpen()">Apri repository…</button>
      <button @click="app.pickAndInit()">Nuovo repository…</button>
    </div>
    <p class="muted">Oppure trascina qui la cartella di un repository.</p>
    <template v-if="app.recent.length">
      <h2>Recenti</h2>
      <ul class="recent">
        <li v-for="path in app.recent" :key="path">
          <a href="#" @click.prevent="app.open(path)">{{ path }}</a>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.welcome { max-width: 640px; margin: 10vh auto 0; padding: 0 24px; }
h1 { margin: 0 0 16px; font-size: 28px; }
h2 { margin: 32px 0 8px; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fg-muted); }
.actions { display: flex; gap: 8px; }
.recent { margin: 0; padding: 0; list-style: none; }
.recent li { padding: 3px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
```

`src/renderer/components/GitMissing.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const path = ref(app.git?.path ?? 'git')
const busy = ref(false)

async function retry() {
  busy.value = true
  try {
    await app.setGitPath(path.value.trim() || 'git')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="center">
    <h1>Git non disponibile</h1>
    <p class="error">{{ app.git?.error }}</p>
    <p>
      Installa git 2.35 o successivo da
      <a href="https://git-scm.com/downloads" target="_blank">git-scm.com/downloads</a>
      oppure indica il percorso dell'eseguibile.
    </p>
    <form @submit.prevent="retry">
      <input v-model="path" data-testid="git-path" placeholder="/usr/bin/git" />
      <button class="primary" :disabled="busy">Riprova</button>
    </form>
  </section>
</template>

<style scoped>
form { display: flex; gap: 8px; }
input { width: 320px; }
</style>
```

`src/renderer/components/RepoView.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

const head = computed(() => {
  const info = repo.info
  if (!info) return ''
  if (info.branch) return info.branch
  return info.headSha ? `HEAD staccato (${info.headSha.slice(0, 7)})` : 'nessun commit'
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
    <div class="body">
      <p v-if="repo.error" class="error">{{ repo.error }}</p>
      <p class="muted">{{ root }}</p>
    </div>
  </section>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.branch { padding: 1px 8px; border-radius: 10px; background: var(--bg-hover); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.body { padding: 12px; }
</style>
```

- [ ] **Step 6: Collega main.ts e App.vue**

`src/renderer/main.ts` (contenuto completo):
```ts
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useAppStore } from './stores/app'
import './styles.css'

const app = createApp(App).use(createPinia())
const store = useAppStore()
app.config.errorHandler = (err) => store.pushUiError(err)
window.addEventListener('error', (e) => store.pushUiError(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => store.pushUiError(e.reason))
app.mount('#app')
void store.init()
```

`src/renderer/App.vue` (contenuto completo):
```vue
<script setup lang="ts">
import GitMissing from './components/GitMissing.vue'
import RepoView from './components/RepoView.vue'
import TabBar from './components/TabBar.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { useAppStore } from './stores/app'

const app = useAppStore()

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0]
  if (file) void app.open(window.api.pathForFile(file))
}
</script>

<template>
  <div class="app" @dragover.prevent @drop.prevent="onDrop">
    <div v-if="!app.git" class="center muted">Avvio…</div>
    <GitMissing v-else-if="!app.git.ok" />
    <template v-else>
      <TabBar />
      <div v-if="app.error" class="error-bar">
        <span>{{ app.error }}</span>
        <button aria-label="Chiudi errore" @click="app.error = null">×</button>
      </div>
      <main class="main">
        <RepoView v-if="app.active" :key="app.active" :root="app.active" />
        <WelcomeScreen v-else />
      </main>
    </template>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.main { flex: 1; min-height: 0; overflow: auto; }
.error-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.error-bar span { flex: 1; }
</style>
```

- [ ] **Step 7: Esegui tutti i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 5 test (`app`, `api`, e i 3 di `repo`).

- [ ] **Step 8: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: tab dei repo, schermata di benvenuto, branch corrente e git mancante" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Command palette, scorciatoie, menu e pannello di output

**Files:**
- Create: `src/renderer/actions/builtin.ts`, `src/renderer/components/OutputPanel.vue`, `src/renderer/components/CommandPalette.vue`, `src/main/menu.ts`
- Modify: `src/renderer/App.vue` (sostituito interamente), `src/main/index.ts` (import e chiamata a `buildMenu`)
- Test: `test/e2e/actions.spec.ts`

**Interfaces:**
- Consumes: `ActionRegistry`, `fuzzy` (Task 8), `useAppStore`, `useRepoStore` (Task 9), `Channels.menuAction` (Task 7).
- Produces:
  - l'istanza unica `registry` e la funzione `registerBuiltinActions()` in `actions/builtin.ts`, con gli id di azione `palette.open`, `repo.open`, `repo.init`, `repo.refresh`, `tab.close`, `tab.next`, `tab.prev` e `output.toggle`;
  - `buildMenu(run: (actionId: string) => void): void`, dove ogni voce del menu ha `id` uguale all'id dell'azione;
  - i `data-testid` `palette-input` e `output-panel`.
- Le scorciatoie si gestiscono solo nel renderer, dal registro. Le voci del menu non hanno acceleratori, così nessuna azione parte due volte.

- [ ] **Step 1: Scrivi il test E2E che fallisce**

`test/e2e/actions.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { makeRepo } from '../helpers/repo'
import { launch, tempUserData } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('palette, output, menu e scorciatoie delle tab', async () => {
  const a = makeRepo(1)
  const b = makeRepo(1)
  const userData = tempUserData()
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ openRepos: [a, b], activeRepo: a }))
  const { app, page } = await launch([], userData)

  await expect(page.getByTestId('tab')).toHaveCount(2)
  await expect(page.locator('.tab.active')).toContainText(basename(a))
  await page.keyboard.press('Control+Tab')
  await expect(page.locator('.tab.active')).toContainText(basename(b))

  await page.keyboard.press(`${mod}+Shift+P`)
  await page.getByTestId('palette-input').fill('output')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('output-panel')).toContainText('git rev-parse --show-toplevel')

  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('output.toggle')?.click())
  await expect(page.getByTestId('output-panel')).toBeHidden()

  await page.keyboard.press(`${mod}+W`)
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await app.close()
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:e2e -- test/e2e/actions.spec.ts`
Expected: FAIL, perché `Control+Tab` non cambia tab.

- [ ] **Step 3: Crea le azioni di base**

`src/renderer/actions/builtin.ts`:
```ts
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { ActionRegistry } from './registry'

export const registry = new ActionRegistry(window.api.platform === 'darwin')

/** Azioni di base. Le parti successive aggiungono le proprie con registry.register(). */
export function registerBuiltinActions(): void {
  const app = useAppStore()
  const gitOk = () => app.git?.ok === true
  const hasRepo = () => app.active !== null
  const manyTabs = () => app.tabs.length > 1

  registry.register(
    { id: 'palette.open', title: 'Command palette', keys: { key: 'p', mod: true, shift: true }, run: () => { app.paletteOpen = true } },
    { id: 'repo.open', title: 'Apri repository…', keys: { key: 'o', mod: true }, when: gitOk, run: () => app.pickAndOpen() },
    { id: 'repo.init', title: 'Nuovo repository…', when: gitOk, run: () => app.pickAndInit() },
    { id: 'repo.refresh', title: 'Aggiorna', keys: { key: 'r', mod: true }, when: hasRepo, run: () => app.active && useRepoStore(app.active).refresh() },
    { id: 'tab.close', title: 'Chiudi tab', keys: { key: 'w', mod: true }, when: hasRepo, run: () => app.active && app.close(app.active) },
    { id: 'tab.next', title: 'Tab successiva', keys: { key: 'Tab', ctrl: true }, when: manyTabs, run: () => app.cycle(1) },
    { id: 'tab.prev', title: 'Tab precedente', keys: { key: 'Tab', ctrl: true, shift: true }, when: manyTabs, run: () => app.cycle(-1) },
    { id: 'output.toggle', title: 'Mostra/nascondi output', keys: { key: 'o', mod: true, shift: true }, run: () => { app.outputOpen = !app.outputOpen } },
  )
}
```

- [ ] **Step 4: Crea il pannello di output e la command palette**

`src/renderer/components/OutputPanel.vue`:
```vue
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const list = ref<HTMLElement | null>(null)
const time = (t: number) => new Date(t).toLocaleTimeString()

watch(
  () => app.log.length,
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
  { immediate: true },
)
</script>

<template>
  <section class="output" data-testid="output-panel">
    <header>
      <strong>Output</strong>
      <span class="spacer" />
      <button aria-label="Chiudi output" @click="app.outputOpen = false">×</button>
    </header>
    <ol ref="list">
      <li v-for="e in app.log" :key="e.id" :class="{ failed: !e.ok }">
        <span class="muted">{{ time(e.startedAt) }}</span>
        <code>{{ e.args.length ? `git ${e.args.join(' ')}` : 'errore interfaccia' }}</code>
        <span class="muted">{{ e.durationMs }} ms</span>
        <span v-if="!e.ok && e.exitCode !== null" class="error">exit {{ e.exitCode }}</span>
        <pre v-if="!e.ok && e.stderr">{{ e.stderr }}</pre>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.output { display: flex; flex-direction: column; height: 220px; background: var(--bg-alt); border-top: 1px solid var(--border); }
header { display: flex; align-items: center; padding: 4px 12px; border-bottom: 1px solid var(--border); }
header button { border: 0; background: transparent; }
ol { flex: 1; margin: 0; padding: 4px 12px; overflow: auto; list-style: none; }
li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; padding: 2px 0; }
li.failed code { color: var(--danger); }
pre { flex-basis: 100%; margin: 2px 0 4px; white-space: pre-wrap; color: var(--danger); }
</style>
```

`src/renderer/components/CommandPalette.vue`:
```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { registry } from '../actions/builtin'
import { fuzzy } from '../actions/registry'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)

const items = computed(() => registry.enabled().filter((a) => a.id !== 'palette.open' && fuzzy(query.value, a.title)))

watch(query, () => {
  index.value = 0
})
onMounted(() => input.value?.focus())

function close() {
  app.paletteOpen = false
}

function runAt(i: number) {
  const action = items.value[i]
  if (!action) return
  close()
  registry.run(action.id)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') index.value = Math.min(index.value + 1, items.value.length - 1)
  else if (e.key === 'ArrowUp') index.value = Math.max(index.value - 1, 0)
  else if (e.key === 'Enter') runAt(index.value)
  else if (e.key === 'Escape') close()
  else return
  e.preventDefault()
}
</script>

<template>
  <div class="backdrop" @mousedown.self="close">
    <div class="palette">
      <input ref="input" v-model="query" data-testid="palette-input" placeholder="Cerca un comando…" @keydown="onKey" />
      <ul>
        <li
          v-for="(a, i) in items"
          :key="a.id"
          :class="{ selected: i === index }"
          @mousedown.prevent="runAt(i)"
          @mousemove="index = i"
        >
          <span>{{ a.title }}</span>
          <kbd v-if="a.keys">{{ registry.keyLabel(a.keys) }}</kbd>
        </li>
        <li v-if="!items.length" class="muted">Nessun comando</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 10; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; background: rgb(0 0 0 / 0.25); }
.palette { width: min(560px, 90vw); overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 12px 40px rgb(0 0 0 / 0.3); }
input { width: 100%; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; font-size: 14px; }
input:focus { outline: none; }
ul { max-height: 50vh; margin: 0; padding: 4px; overflow: auto; list-style: none; }
li { display: flex; justify-content: space-between; padding: 6px 8px; border-radius: 5px; cursor: default; }
li.selected { background: var(--accent); color: var(--accent-fg); }
kbd { opacity: 0.8; }
</style>
```

- [ ] **Step 5: Collega le scorciatoie e il menu in App.vue**

`src/renderer/App.vue` (contenuto completo):
```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { registerBuiltinActions, registry } from './actions/builtin'
import CommandPalette from './components/CommandPalette.vue'
import GitMissing from './components/GitMissing.vue'
import OutputPanel from './components/OutputPanel.vue'
import RepoView from './components/RepoView.vue'
import TabBar from './components/TabBar.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { useAppStore } from './stores/app'

const app = useAppStore()
registerBuiltinActions()

function onKey(e: KeyboardEvent) {
  const action = registry.match(e)
  if (!action) return
  e.preventDefault()
  registry.run(action.id)
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0]
  if (file) void app.open(window.api.pathForFile(file))
}

let offMenu: () => void = () => {}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  offMenu = window.api.onMenuAction((id) => registry.run(id))
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  offMenu()
})
</script>

<template>
  <div class="app" @dragover.prevent @drop.prevent="onDrop">
    <div v-if="!app.git" class="center muted">Avvio…</div>
    <GitMissing v-else-if="!app.git.ok" />
    <template v-else>
      <TabBar />
      <div v-if="app.error" class="error-bar">
        <span>{{ app.error }}</span>
        <button aria-label="Chiudi errore" @click="app.error = null">×</button>
      </div>
      <main class="main">
        <RepoView v-if="app.active" :key="app.active" :root="app.active" />
        <WelcomeScreen v-else />
      </main>
    </template>
    <OutputPanel v-if="app.outputOpen" />
    <CommandPalette v-if="app.paletteOpen" />
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.main { flex: 1; min-height: 0; overflow: auto; }
.error-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.error-bar span { flex: 1; }
</style>
```

- [ ] **Step 6: Crea il menu e collegalo nel main**

`src/main/menu.ts`:
```ts
import { Menu, type MenuItemConstructorOptions } from 'electron'

/** Barra dei menu: ogni voce manda al renderer l'id di un'azione del registro. Le scorciatoie le gestisce il renderer. */
export function buildMenu(run: (actionId: string) => void): void {
  const isMac = process.platform === 'darwin'
  const action = (label: string, id: string): MenuItemConstructorOptions => ({ id, label, click: () => run(id) })
  const quit: MenuItemConstructorOptions[] = isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Esci' }]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        action('Apri repository…', 'repo.open'),
        action('Nuovo repository…', 'repo.init'),
        { type: 'separator' },
        action('Chiudi tab', 'tab.close'),
        ...quit,
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Vista',
      submenu: [
        action('Command palette', 'palette.open'),
        action('Output', 'output.toggle'),
        action('Aggiorna', 'repo.refresh'),
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    { label: 'Finestra', role: 'window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
```

In `src/main/index.ts` aggiungi l'import dopo `import { registerIpc } from './ipc-handlers'`:
```ts
import { buildMenu } from './menu'
```
e dentro `app.whenReady().then(...)`, subito prima di `win = createWindow()`:
```ts
    buildMenu((id) => win?.webContents.send(Channels.menuAction, id))
```

- [ ] **Step 7: Esegui tutti i test E2E e verifica che passino**

Run: `npm run test:e2e`
Expected: PASS, 6 test.

- [ ] **Step 8: Lint, typecheck, test e commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat: command palette, scorciatoie, barra dei menu e pannello di output" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Pacchetti, CI e README

**Files:**
- Create: `electron-builder.yml`, `.gitlab-ci.yml`, `README.md`

**Interfaces:**
- Consumes: gli script `dist` e `test:e2e` (Task 1) e `MERLINO_EXECUTABLE` in `test/e2e/launch.ts` (Task 1).

- [ ] **Step 1: Configura electron-builder**

`electron-builder.yml`:
```yaml
appId: dev.merlino.app
productName: Merlino
directories:
  output: dist
files:
  - out/**/*
# Il modulo nativo del watcher non può stare dentro l'asar
asarUnpack:
  - node_modules/@parcel/watcher*/**
mac:
  target:
    - target: dmg
      arch: [arm64, x64]
  category: public.app-category.developer-tools
  # Build non firmate (vedi spec, sezione Distribuzione)
  identity: null
win:
  target:
    - target: nsis
      arch: [x64]
linux:
  target: [AppImage, deb]
  category: Development
publish: null
```

- [ ] **Step 2: Crea il pacchetto per il sistema corrente e provalo con i test E2E**

```bash
npx electron-vite build && npx electron-builder --dir
ls dist
```
Expected: una cartella `dist/mac-arm64/` (o `dist/mac/` su Intel) con `Merlino.app`.

```bash
MERLINO_EXECUTABLE="$(ls -d dist/mac*/Merlino.app)/Contents/MacOS/Merlino" npx playwright test test/e2e/repo.spec.ts
```
Expected: PASS, 3 test. L'app impacchettata carica il watcher (il branch si aggiorna) e trova git.

- [ ] **Step 3: Crea il dmg**

Run: `npm run dist -- --mac`
Expected: in `dist/` compaiono `Merlino-0.1.0-arm64.dmg` e `Merlino-0.1.0.dmg`.

Controlla che anche la build x64 contenga il binario del watcher per la sua architettura:
```bash
ls dist/mac/Merlino.app/Contents/Resources/app.asar.unpacked/node_modules/@parcel/
```
Expected: `watcher` e `watcher-darwin-x64`. Se `watcher-darwin-x64` manca, il binario nativo non è stato incluso: su Mac Intel l'app funzionerebbe senza aggiornamento automatico. In quel caso si tiene solo `arm64` nel target mac e la build x64 si fa su una macchina x64.

- [ ] **Step 4: Crea la CI di GitLab**

`.gitlab-ci.yml`:
```yaml
# Lint, typecheck, test unit e di integrazione su Linux.
# macOS e Windows si provano a mano prima di ogni release (vedi spec).
test:
  image: node:24
  cache:
    key:
      files: [package-lock.json]
    paths: [.npm/]
  before_script:
    - npm ci --cache .npm --prefer-offline
  script:
    - npm run lint
    - npm run typecheck
    - npm test
```

- [ ] **Step 5: Scrivi il README**

`README.md`:
````markdown
# Merlino

Client Git desktop del team, per macOS, Windows e Linux. Electron + Vue 3 + TypeScript.

Richiede git 2.35 o successivo installato sul sistema.

## Sviluppo

```bash
npm install
npm run dev          # app in sviluppo con ricarica automatica
npm test             # test unit e di integrazione (usano git vero)
npm run test:e2e     # build + test Playwright sull'app
npm run lint && npm run typecheck
```

## Pacchetti

```bash
npm run dist         # dmg / installer NSIS / AppImage+deb in dist/, per il sistema corrente
```

Le build non sono firmate: su macOS la prima volta si apre con click destro → Apri.

## Documentazione

- Design: `docs/superpowers/specs/`
- Piani di implementazione: `docs/superpowers/plans/`
````

- [ ] **Step 6: Verifica finale completa**

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e
```
Expected: tutto verde; unit e integrazione 35 test, E2E 6 test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "build: pacchetti electron-builder, CI GitLab e README" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
