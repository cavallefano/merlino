# Merlino — Barra superiore ed errori visibili — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola toolbar in stile Tower (nella barra del titolo su macOS, icone raggruppate, nome del repo con il branch sotto), la barra delle tab solo con due o più repository, e un dialog per gli errori delle operazioni.

**Architecture:**
- `AppToolbar.vue` vive in `App.vue` sopra a ogni schermata; i pulsanti eseguono azioni del registro e ne leggono titolo, scorciatoia e disponibilità (`registry.get`, `registry.available`).
- Gli errori di ciò che chiede l'utente vanno in `app.error` e aprono `ErrorDialog.vue`; `repo.error` resta per i caricamenti in background e diventa una banda chiudibile in `RepoView.vue`.
- Su macOS la finestra usa `titleBarStyle: 'hidden'` con i semafori dentro la toolbar.

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, Vitest, Playwright.

Spec: `docs/superpowers/specs/2026-10-27-merlino-toolbar-design.md`. Branch: `feature/toolbar`, che parte da `develop` (worktree `.claude/worktrees/toolbar`).

## Global Constraints

- **Nessuna dipendenza nuova.**
- **Icone** da Lucide (`lucide-static` 1.61.0, ISC), nello stesso `AppIcon.vue`, con i tracciati riportati in questo piano.
- **Test id nuovi**: `repo-name`, `pull-badge`, `push-badge`, `stash-button`, `pop-button`, `branch-button`, `search-button`, `error-dialog`, `error-message`, `error-output`, `error-ok`, `repo-error`.
- **Test id che restano**: `palette-button`, `fetch`, `pull`, `push`, `flow-button`, `layout-toggle`, `repo-refresh`, `repo-branch`, `progress`, `tab`.
- **Testi** in inglese e in italiano (`src/shared/i18n/en.ts` e `it.ts`, stesse chiavi).
- **Test e screenshot**: sempre con la finestra nascosta (`MERLINO_E2E=1`, già impostato da `test/e2e/launch.ts`).
- **Repo**: solo nomi fittizi.
- **Commit**: email locale `cavallefano@users.noreply.github.com`; il messaggio termina con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File

| File | Cosa cambia |
|---|---|
| `src/renderer/actions/registry.ts` | `get(id)` e `available(id)` |
| `src/renderer/components/ErrorDialog.vue` | nuovo: dialog degli errori |
| `src/renderer/components/AppToolbar.vue` | nuovo: la toolbar |
| `src/renderer/components/AppIcon.vue` | icone nuove |
| `src/renderer/App.vue` | toolbar in cima, tab solo da due, dialog degli errori al posto della barra rossa |
| `src/renderer/components/RepoView.vue` | via la toolbar; banda per `repo.error` |
| `src/renderer/components/TabBar.vue` | via il pulsante "Comandi" |
| `src/renderer/components/SettingsView.vue` | via la riga d'errore interna |
| `src/renderer/components/CreatePullRequestDialog.vue`, `WorkingView.vue`, `src/renderer/actions/branches.ts`, `src/renderer/stores/repo.ts` | errori delle operazioni in `app.error` |
| `src/main/index.ts` | barra del titolo nascosta su macOS |
| `src/shared/i18n/en.ts`, `it.ts` | `errorDialog.title`, `errorDialog.showOutput`, `common.ok`; via `tabs.commands` |
| `test/unit/registry.test.ts`, `test/e2e/branches.spec.ts`, `repo.spec.ts`, `actions.spec.ts` | test |

---

### Task 1: Registro — una singola azione per i pulsanti

**Files:**
- Modify: `src/renderer/actions/registry.ts` (classe `ActionRegistry`, dopo `enabled()`)
- Test: `test/unit/registry.test.ts`

**Interfaces:**
- Produces: `registry.get(id: string): Action | undefined` e `registry.available(id: string): boolean` (false se l'azione non esiste o il suo `when` dice false).

- [ ] **Step 1: Write the failing test**

In `test/unit/registry.test.ts`, dentro `describe('ActionRegistry', …)`, dopo l'ultimo `it` del blocco:

```ts
  it('get e available leggono una singola azione, col suo when', () => {
    const r = new ActionRegistry(true)
    let on = false
    r.register({ id: 'x', title: 'X', when: () => on, run: noop })
    expect(r.get('x')?.title).toBe('X')
    expect(r.available('x')).toBe(false)
    on = true
    expect(r.available('x')).toBe(true)
    expect(r.get('manca')).toBeUndefined()
    expect(r.available('manca')).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/registry.test.ts`
Expected: FAIL con `r.get is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/actions/registry.ts`, dopo il metodo `enabled()`:

```ts
  get(id: string): Action | undefined {
    return this.actions.get(id)
  }

  /** true se l'azione esiste e il suo when lo permette: così i pulsanti della toolbar si disattivano come la palette. */
  available(id: string): boolean {
    const action = this.actions.get(id)
    return action !== undefined && isEnabled(action)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/actions/registry.ts test/unit/registry.test.ts
git commit -m "feat: il registro delle azioni espone una singola azione e se è disponibile

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dialog degli errori e banda per i caricamenti

**Files:**
- Create: `src/renderer/components/ErrorDialog.vue`
- Modify: `src/renderer/components/AppIcon.vue` (icona `warning`)
- Modify: `src/renderer/App.vue` (via `.error-bar`, aggiunto `ErrorDialog`)
- Modify: `src/renderer/components/SettingsView.vue:49-52` e la regola `.message` (righe 69-71)
- Modify: `src/renderer/stores/repo.ts:429-436` (`run`)
- Modify: `src/renderer/actions/branches.ts:101` (push senza remote)
- Modify: `src/renderer/components/WorkingView.vue:78` (apri nell'editor)
- Modify: `src/renderer/components/CreatePullRequestDialog.vue:69`
- Modify: `src/renderer/components/RepoView.vue:93` (banda di `repo.error`)
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/e2e/branches.spec.ts`

**Interfaces:**
- Consumes: niente dai task precedenti.
- Produces: `app.error` (già esistente, `string | null`) è l'unico canale degli errori delle operazioni; `ErrorDialog.vue` senza props, montato da `App.vue` con `v-if="app.error"`; icona `warning` in `AppIcon`.

- [ ] **Step 1: Write the failing e2e test**

In `test/e2e/branches.spec.ts`, subito dopo il test `'push su un remote bare e pull dei commit pushati da un secondo clone'`:

```ts
test("un push rifiutato apre il dialog degli errori, che porta all'output", async () => {
  const { bare, clone } = makeRemotePair()
  const other = cloneOf(bare)
  commitFile(other, 'remoto.txt', 'y\n', 'dal collega')
  git(other, 'push', '-q')
  commitFile(clone, 'locale.txt', 'x\n', 'da pushare')
  const { app, page } = await launch([clone])
  // Stato e remote caricati: il push sa dove andare
  await expect(page.getByTestId('push')).toContainText('↑1')
  await page.getByTestId('push').click()
  await expect(page.getByTestId('error-message')).toContainText('Push rejected')
  await page.getByTestId('error-output').click()
  await expect(page.getByTestId('error-dialog')).toBeHidden()
  await expect(page.getByTestId('output-panel')).toContainText('git push')
  await app.close()
})
```

(`↑1` diventa il badge nel Task 3, che aggiorna anche questa riga.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx electron-vite build && npx playwright test test/e2e/branches.spec.ts -g "push rifiutato"`
Expected: FAIL, `error-message` non trovato.

- [ ] **Step 3: Testi**

In `src/shared/i18n/en.ts`, dopo `'common.closeError': 'Close error',`:

```ts
  'common.ok': 'OK',
  'errorDialog.title': 'Operation failed',
  'errorDialog.showOutput': 'Show Output',
```

In `src/shared/i18n/it.ts`, dopo `'common.closeError': 'Chiudi errore',`:

```ts
  'common.ok': 'OK',
  'errorDialog.title': 'Operazione non riuscita',
  'errorDialog.showOutput': 'Mostra output',
```

- [ ] **Step 4: Icona `warning`**

In `src/renderer/components/AppIcon.vue`, nell'oggetto `ICONS`, dopo `chevron`:

```ts
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
```

- [ ] **Step 5: `ErrorDialog.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import AppIcon from './AppIcon.vue'

const app = useAppStore()
const dialog = ref<HTMLDialogElement | null>(null)
// showModal: sopra a tutto, anche a un altro dialog aperto; il focus va su OK (autofocus), Esc chiude
onMounted(() => dialog.value?.showModal())

function showOutput() {
  app.outputOpen = true
  app.error = null
}
</script>

<template>
  <dialog ref="dialog" data-testid="error-dialog" @cancel.prevent="app.error = null">
    <form @submit.prevent="app.error = null">
      <h2><AppIcon name="warning" /> {{ t('errorDialog.title') }}</h2>
      <pre data-testid="error-message">{{ app.error }}</pre>
      <footer>
        <button type="button" data-testid="error-output" @click="showOutput">{{ t('errorDialog.showOutput') }}</button>
        <button class="primary" data-testid="error-ok" autofocus>{{ t('common.ok') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(520px, 90vw); }
h2 { display: flex; align-items: center; gap: 8px; }
h2 .icon { width: 18px; height: 18px; color: var(--danger); }
pre { max-height: 40vh; margin: 0; padding: 8px 10px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 5px; }
</style>
```

- [ ] **Step 6: `App.vue` — il dialog al posto della barra rossa**

Togli dal template:

```html
      <div v-if="app.error" class="error-bar">
        <span>{{ app.error }}</span>
        <button :aria-label="t('common.closeError')" @click="app.error = null">×</button>
      </div>
```

e dallo stile le due righe `.error-bar …` e `.error-bar span …`. Dopo `<PromptDialog … />` aggiungi:

```html
    <ErrorDialog v-if="app.error" />
```

e fra gli import, in ordine alfabetico dopo `DropHint`:

```ts
import ErrorDialog from './components/ErrorDialog.vue'
```

- [ ] **Step 7: `SettingsView.vue` — via la riga d'errore interna**

Togli dal template:

```html
      <p v-if="app.error" class="error message">
        <span>{{ app.error }}</span>
        <button :aria-label="t('common.closeError')" @click="app.error = null">×</button>
      </p>
```

e dallo stile le tre regole `.message { … }`, `.message span { … }`, `.message button { … }`. `app` resta (sezione e chiusura). Il dialog degli errori si apre anche qui, perché `App.vue` lo monta fuori dalla schermata; Esc non chiude le impostazioni mentre è aperto (`SettingsView` ignora Esc se c'è un `dialog[open]`).

- [ ] **Step 8: Errori delle operazioni in `app.error`**

`src/renderer/stores/repo.ts`, la funzione `run`:

```ts
    /** Esegue un'operazione chiesta dall'utente: l'eventuale errore apre il dialog degli errori; poi ricarica lo stato da git. */
    async function run(op: Promise<Result<unknown>>): Promise<boolean> {
      error.value = null
      const r = await op
      if (!r.ok) useAppStore().error = r.error.message
      await refresh()
      return r.ok
    }
```

`src/renderer/actions/branches.ts`, in `push`:

```ts
  if (!remote) {
    useAppStore().error = t('push.noRemote')
    return
  }
```

`src/renderer/components/WorkingView.vue`, in `openFile`:

```ts
  if (!r.ok) app.error = r.error.message
```

`src/renderer/components/CreatePullRequestDialog.vue`, in `submit` (il push fallito ha già aperto il dialog degli errori, sopra a questo):

```ts
  else failed.value = prs.error?.message ?? null
```

`repo` resta usato nel dialog (branch e remote).

- [ ] **Step 9: `RepoView.vue` — banda per i caricamenti in background**

Sostituisci `<p v-if="repo.error" class="error message">{{ repo.error }}</p>` con:

```html
    <p v-if="repo.error" class="band" data-testid="repo-error">
      <AppIcon name="warning" />
      <span>{{ repo.error }}</span>
      <button :aria-label="t('common.closeError')" @click="repo.error = null">×</button>
    </p>
```

Import, in ordine alfabetico prima di `BlameDialog`:

```ts
import AppIcon from './AppIcon.vue'
```

Nello stile sostituisci `.message { … }` con:

```css
.band { display: flex; align-items: center; gap: 8px; margin: 0; padding: 6px 12px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.band span { flex: 1; }
.band button { padding: 0 6px; border: 0; background: transparent; color: inherit; }
```

- [ ] **Step 10: Run the e2e test and the checks**

Run: `npm run typecheck && npm run lint && npx electron-vite build && npx playwright test test/e2e/branches.spec.ts test/e2e/settings.spec.ts test/e2e/pull-requests.spec.ts`
Expected: PASS, compreso `push rifiutato`.

- [ ] **Step 11: Commit**

```bash
git add -A src test
git commit -m "feat: dialog per gli errori delle operazioni, banda chiudibile per quelli dei caricamenti

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Toolbar in stile Tower e tab solo da due repository

**Files:**
- Create: `src/renderer/components/AppToolbar.vue`
- Modify: `src/renderer/components/AppIcon.vue` (icone della toolbar)
- Modify: `src/renderer/App.vue` (toolbar in cima, `.screen`, `TabBar` solo da due)
- Modify: `src/renderer/components/RepoView.vue` (via `<header class="toolbar">` e quello che serviva solo a lei)
- Modify: `src/renderer/components/TabBar.vue` (via il pulsante "Comandi")
- Modify: `src/main/index.ts` (barra del titolo su macOS)
- Modify: `src/shared/i18n/en.ts`, `it.ts` (via `tabs.commands`)
- Test: `test/e2e/repo.spec.ts`, `test/e2e/actions.spec.ts`, `test/e2e/branches.spec.ts`

**Interfaces:**
- Consumes: `registry.get(id)`, `registry.available(id)` (Task 1); `flowMenu(repo: Repo)` da `src/renderer/actions/flow.ts`; `ErrorDialog` già in `App.vue` (Task 2).
- Produces: `AppToolbar.vue` senza props; test id della toolbar come in Global Constraints.

- [ ] **Step 1: Aggiorna i test e2e (falliscono finché la toolbar non c'è)**

`test/e2e/repo.spec.ts`, primo test, al posto di `await expect(page.getByTestId('tab')).toHaveText(/merlino-/)`:

```ts
  await expect(page.getByTestId('repo-name')).toHaveText(/merlino-/)
  // Con un solo repository la barra delle tab non c'è
  await expect(page.getByTestId('tab')).toHaveCount(0)
```

`test/e2e/actions.spec.ts`, in fondo al primo test, al posto di `await expect(page.getByTestId('tab')).toHaveCount(1)`:

```ts
  // Resta un repository: la barra delle tab sparisce e il nome è nella toolbar
  await expect(page.getByTestId('tab')).toHaveCount(0)
  await expect(page.getByTestId('repo-name')).toHaveText(basename(a))
```

`test/e2e/branches.spec.ts`:
- test `'push su un remote bare…'`: `await expect(push).toContainText('↑1')` → `await expect(page.getByTestId('push-badge')).toHaveText('1')`; `await expect(push).not.toContainText('↑')` → `await expect(page.getByTestId('push-badge')).toBeHidden()`; `await expect(page.getByTestId('pull')).toContainText('↓1')` → `await expect(page.getByTestId('pull-badge')).toHaveText('1')`; `await expect(page.getByTestId('pull')).not.toContainText('↓')` → `await expect(page.getByTestId('pull-badge')).toBeHidden()`.
- test `"un push rifiutato…"` (Task 2): `await expect(page.getByTestId('push')).toContainText('↑1')` → `await expect(page.getByTestId('push-badge')).toHaveText('1')`.
- test `'clona dalla schermata iniziale…'`: `await expect(page.getByTestId('tab')).toHaveCount(1)` → `await expect(page.getByTestId('repo-name')).toHaveText(basename(bare))`.

Run: `npx electron-vite build && npx playwright test test/e2e/repo.spec.ts test/e2e/actions.spec.ts`
Expected: FAIL (`repo-name` non trovato).

- [ ] **Step 2: Icone della toolbar**

In `src/renderer/components/AppIcon.vue`, nell'oggetto `ICONS`, prima di `warning`:

```ts
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  fetch: '<path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/>',
  pull: '<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>',
  push: '<path d="m18 9-6-6-6 6"/><path d="M12 3v14"/><path d="M5 21h14"/>',
  pop: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
  branchAdd: '<path d="M6 3v12"/><path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M15 6a9 9 0 0 0-9 9"/><path d="M18 15v6"/><path d="M21 18h-6"/>',
  flow: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  columns: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
  rows: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h18"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
```

(Lucide: `wand-sparkles`, `cloud-download`, `arrow-down-to-line`, `arrow-up-from-line`, `archive-restore`, `git-branch-plus`, `git-fork`, `search`, `columns-2`, `rows-2`, `rotate-cw`; `warning` è `triangle-alert`.) Lo stash usa l'icona `stash` che c'è già.

- [ ] **Step 3: `AppToolbar.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../i18n'
import { registry } from '../actions/builtin'
import { flowMenu } from '../actions/flow'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import AppIcon from './AppIcon.vue'

const app = useAppStore()
/** Su macOS la toolbar è la barra del titolo: lascia spazio ai semafori e trascina la finestra. */
const mac = window.api.platform === 'darwin'
/** Il repository della tab attiva; nelle impostazioni nessuno, così restano solo il titolo e la bacchetta. */
const repo = computed(() => (app.active && !app.settingsSection ? useRepoStore(app.active) : null))

const head = computed(() => {
  const info = repo.value?.info
  if (!info) return ''
  if (info.branch) return info.branch
  return info.headSha ? t('repo.detachedHead', { sha: info.headSha.slice(0, 7) }) : t('repo.noCommits')
})

/** Pulsante di un'azione del registro: nome e scorciatoia nel tooltip, disattivo quando l'azione non si può eseguire. */
function tool(id: string) {
  const action = registry.get(id)
  const name = action?.title ?? id
  return {
    title: action?.keys ? `${name} (${registry.keyLabel(action.keys)})` : name,
    'aria-label': name,
    disabled: !registry.available(id),
    onClick: () => registry.run(id),
  }
}
</script>

<template>
  <header class="toolbar" :class="{ mac }">
    <div class="title">
      <strong data-testid="repo-name">{{ repo?.info?.name ?? 'Merlino' }}</strong>
      <span v-if="repo" class="subtitle">
        <span data-testid="repo-branch">{{ head }}</span>
        <span v-if="repo.busy && repo.progress" class="progress" data-testid="progress">{{ repo.progress }}</span>
      </span>
    </div>
    <span class="spacer" />
    <div class="group">
      <button data-testid="palette-button" v-bind="tool('palette.open')"><AppIcon name="wand" /></button>
    </div>
    <template v-if="repo">
      <div class="group">
        <button data-testid="fetch" v-bind="tool('remote.fetch')"><AppIcon name="fetch" /></button>
        <button data-testid="pull" v-bind="tool('remote.pull')">
          <AppIcon name="pull" />
          <span v-if="repo.status?.behind" class="badge" data-testid="pull-badge">{{ repo.status.behind }}</span>
        </button>
        <button data-testid="push" v-bind="tool('remote.push')">
          <AppIcon name="push" />
          <span v-if="repo.status?.ahead" class="badge" data-testid="push-badge">{{ repo.status.ahead }}</span>
        </button>
      </div>
      <div class="group">
        <button data-testid="stash-button" v-bind="tool('stash.push')"><AppIcon name="stash" /></button>
        <button data-testid="pop-button" v-bind="tool('stash.pop')"><AppIcon name="pop" /></button>
      </div>
      <div class="group">
        <button data-testid="branch-button" v-bind="tool('branch.create')"><AppIcon name="branchAdd" /></button>
        <button
          data-testid="flow-button"
          :title="t('flow.button')"
          :aria-label="t('flow.button')"
          :disabled="!!repo.busy"
          @click="flowMenu(repo)"
        ><AppIcon name="flow" /></button>
      </div>
      <div class="group">
        <button data-testid="search-button" v-bind="tool('history.search')"><AppIcon name="search" /></button>
        <button data-testid="layout-toggle" v-bind="tool('layout.toggle')">
          <AppIcon :name="app.preferences.panelLayout === 'vertical' ? 'columns' : 'rows'" />
        </button>
        <button data-testid="repo-refresh" v-bind="tool('repo.refresh')"><AppIcon name="refresh" /></button>
      </div>
    </template>
  </header>
</template>

<style scoped>
.toolbar { display: flex; flex: none; align-items: center; gap: 8px; height: 52px; padding: 0 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); user-select: none; }
/* I semafori stanno nei primi 80px (trafficLightPosition in src/main/index.ts) */
.toolbar.mac { padding-left: 84px; -webkit-app-region: drag; }
.toolbar.mac button { -webkit-app-region: no-drag; }
.title { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subtitle { display: flex; gap: 8px; min-width: 0; font-size: 11px; color: var(--fg-muted); white-space: nowrap; }
.progress { overflow: hidden; text-overflow: ellipsis; }
.group { display: flex; flex: none; overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: 7px; }
.group button { position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 28px; padding: 0; border: 0; border-radius: 0; background: transparent; }
.group button + button { border-left: 1px solid var(--border); }
.group button:hover:not(:disabled) { background: var(--bg-hover); }
.group .icon { width: 16px; height: 16px; }
.badge { position: absolute; top: 1px; right: 1px; min-width: 14px; padding: 0 3px; border-radius: 7px; background: var(--accent); color: var(--accent-fg); font-size: 9px; font-weight: 600; line-height: 14px; font-variant-numeric: tabular-nums; }
</style>
```

- [ ] **Step 4: `App.vue` — toolbar in cima e tab solo da due**

Import, in ordine alfabetico prima di `CommandPalette`:

```ts
import AppToolbar from './components/AppToolbar.vue'
```

Template completo:

```html
<template>
  <div class="app" @dragover="onDragOver" @drop.prevent="onDrop">
    <AppToolbar />
    <div class="screen">
      <div v-if="!app.git" class="center muted">{{ t('app.starting') }}</div>
      <SettingsView v-else-if="app.settingsSection" />
      <GitMissing v-else-if="!app.git.ok" />
      <template v-else>
        <TabBar v-if="app.tabs.length > 1" />
        <div v-if="app.cloneProgress" class="clone-bar muted" data-testid="clone-progress">{{ app.cloneProgress }}</div>
        <main class="main">
          <RepoView v-if="app.active" :key="app.active" :root="app.active" />
          <WelcomeScreen v-else />
        </main>
      </template>
    </div>
    <OutputPanel v-if="app.outputOpen" />
    <CommandPalette v-if="app.paletteOpen" />
    <PromptDialog v-if="app.promptRequest" :request="app.promptRequest" />
    <ErrorDialog v-if="app.error" />
    <DropHint />
  </div>
</template>
```

Stile completo:

```css
.app { display: flex; flex-direction: column; height: 100%; }
/* Sotto la toolbar, la schermata attiva prende lo spazio che resta */
.screen { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.main { flex: 1; min-height: 0; overflow: hidden; }
.clone-bar { padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 5: `RepoView.vue` — via la vecchia toolbar**

- Togli dal template tutto `<header class="toolbar"> … </header>`.
- Togli dallo script: `import { push } from '../actions/branches'`, `import { registry } from '../actions/builtin'`, `import { flowMenu } from '../actions/flow'` e il `computed` `head`.
- Togli dallo stile: `.toolbar { … }`, `.toolbar button { … }`, `.branch { … }`, `.progress { … }`, `.count { … }`.
- `app`, `vertical`, `t`, `tn` restano (layout e banner delle operazioni).

- [ ] **Step 6: `TabBar.vue` — via il pulsante "Comandi"**

Script completo:

```ts
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'

const app = useAppStore()
const name = (root: string) => useRepoStore(root).info?.name ?? root
```

Nel template togli `<span class="spacer" />` e il `<button class="palette" …>…</button>`; nello stile togli `.palette { … }` e `.palette kbd { … }`.

In `src/shared/i18n/en.ts` e `it.ts` togli la riga `'tabs.commands': …`.

- [ ] **Step 7: `src/main/index.ts` — la toolbar fa da barra del titolo su macOS**

In `createWindow`, dopo `title: 'Merlino',`:

```ts
    // macOS: la toolbar fa da barra del titolo e i semafori stanno dentro, come in Tower.
    // y centra i semafori nella toolbar alta 52px (AppToolbar.vue): se cambia l'altezza va ritoccata
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 18, y: 19 } } : {}),
```

- [ ] **Step 8: Run the checks**

Run: `npm run typecheck && npm run lint && npm test && npx electron-vite build && npx playwright test test/e2e/repo.spec.ts test/e2e/actions.spec.ts test/e2e/branches.spec.ts test/e2e/flow.spec.ts test/e2e/layout.spec.ts test/e2e/settings.spec.ts`
Expected: PASS.

- [ ] **Step 9: Guarda la toolbar**

Script in una cartella temporanea (non nel repo), con la finestra nascosta come gli e2e: avvia Merlino su un repo di prova (`makeRepo(3)` da `test/helpers/repo.ts`) con `launch` da `test/e2e/launch.ts`, aspetta `repo-branch`, salva `page.screenshot()` in tema chiaro e scuro (`app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })`). Controlla: gruppi allineati, badge leggibili, titolo e branch non tagliati, nessun pulsante oltre il bordo a 800px di larghezza (`page.setViewportSize({ width: 800, height: 600 })`). La posizione dei semafori non compare negli screenshot della pagina: la si controlla con `npm run dev`.

- [ ] **Step 10: Commit**

```bash
git add -A src test
git commit -m "feat: toolbar in stile Tower nella barra del titolo, tab solo con due o più repository

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Screenshot del README e verifica completa

**Files:**
- Modify: `docs/assets/screenshots/*.jpg` (rigenerati)

- [ ] **Step 1: Rigenera gli screenshot**

Run: `npx electron-vite build && MERLINO_SCREENSHOTS=1 npx playwright test test/e2e/readme-screenshots.spec.ts`
Expected: PASS; i file in `docs/assets/screenshots/` cambiano. Aprili e controlla che la toolbar nuova si veda bene.

- [ ] **Step 2: Verifica completa**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: tutto PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/assets/screenshots
git commit -m "docs: screenshot del README con la toolbar nuova

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
