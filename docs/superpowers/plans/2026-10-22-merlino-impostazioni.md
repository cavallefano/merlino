# Merlino — Impostazioni e commit template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La schermata Impostazioni (Generale, Commit, Diff, Integrazioni, Git), che anticipa le preferenze e i temi della parte 7, e i commit template alla Tower: libreria, predefinito per repo, `commit.template` di git, variabili `{branch}` e `{ticket}`, scorciatoia `/`.

**Architecture:**
- **Preferenze**: stanno nel JSON delle impostazioni (`settings.ts`), validate nel main sul risultato dell'unione con le preferenze correnti. Gli effetti nel main (tema, fetch automatico) si applicano a ogni salvataggio.
- **Config globale di git**: sette chiavi, lette e scritte con `git config --global`, senza copiarle in Merlino.
- **Template**: le funzioni pure stanno in `src/shared/commit-template.ts`. Il renderer gestisce il selettore e la precompilazione; il main valida e salva la libreria e legge `commit.template`.

**Tech Stack:** Electron 45 (`nativeTheme`, `dialog`, `shell`), Vue 3 (`<script setup>`), Pinia, TypeScript, Vitest (anche con i timer finti), Playwright; git ≥ 2.35.

Spec: `docs/superpowers/specs/2026-10-22-merlino-impostazioni-design.md`. Branch: `feature/impostazioni`, che parte da `feature/storia-stile`.

## Global Constraints

- **Valori predefiniti** delle preferenze:
  - generali: `theme: 'system'`, `autoFetchMinutes: 10`, `fetchPrune: true`, `restoreTabs: true`;
  - commit: `subjectWarn: 50`, `subjectLimit: 72`, `bodyGuide: 72`;
  - diff: `diffSplit: false`, `diffIgnoreWhitespace: false`, `diffContext: 3`, `diffAlgorithm: 'default'`, `codeFontSize: 12`, `tabSize: 4`;
  - percorsi: `editorApp: null`, `terminalApp: null`, `cloneFolder: null`.
- **Intervalli**:
  - `autoFetchMinutes` 0–60;
  - `subjectWarn` 20–200, `subjectLimit` da `subjectWarn` a 200;
  - `bodyGuide` 0 oppure 40–200;
  - `diffContext` 1–20, `codeFontSize` 10–20, `tabSize` 1–8;
  - i percorsi sono assoluti, al massimo 1024 caratteri, oppure `null`.
- **Config globale di git**: solo `user.name`, `user.email`, `commit.gpgsign`, `gpg.format`, `user.signingkey`, `pull.rebase`, `init.defaultBranch`. Il valore `''` toglie la chiave. I valori non hanno a capo, non superano 200 caratteri e non iniziano con `-`.
- **Template**:
  - `id` corrisponde a `/^[\w-]{1,64}$/` ed è unico; `name` da 1 a 100 caratteri dopo il trim;
  - `subject` al massimo 500 caratteri, `body` al massimo 20.000; al massimo 200 template.
- **Sicurezza dei test**: nessun test scrive mai nel `~/.gitconfig` dell'utente.
  - Integrazione: `process.env.GIT_CONFIG_GLOBAL` su un file temporaneo, rimesso a `devNull` dopo il test.
  - E2E: `launch(args, userData, env)` con `GIT_CONFIG_GLOBAL` temporaneo.
- **Testi**: tutta l'interfaccia è in italiano. I `data-testid` sono quelli indicati nei task.
- **Dipendenze**: nessuna nuova.

---

### Task 1: Preferenze (dati, validazione, IPC), schermata Impostazioni e sezione Generale con il tema

**Files:**
- Create: `src/shared/preferences.ts`
- Create: `src/renderer/components/SettingsView.vue`
- Create: `src/renderer/components/settings/GeneralSettings.vue`, `src/renderer/components/settings/PrefNumber.vue`
- Modify: `src/shared/types.ts`, `src/shared/ipc.ts`, `src/shared/shortcuts.ts`, `src/preload/index.ts`
- Modify: `src/main/settings.ts`, `src/main/validate.ts`, `src/main/ipc-handlers.ts`, `src/main/menu.ts`
- Modify: `src/renderer/stores/app.ts`, `src/renderer/actions/builtin.ts`, `src/renderer/App.vue`, `src/renderer/styles.css`
- Modify: `test/e2e/launch.ts`
- Test: `test/unit/settings.test.ts`, `test/unit/validate.test.ts`, `test/e2e/settings.spec.ts`

**Interfaces:**
- Produces:
  - tipi `Preferences`, `ThemePreference`, `DiffAlgorithm`, `CommitTemplate`, `GitConfigKey`; `AppSettings` con `preferences`, `commitTemplates` e `defaultTemplates`;
  - `DEFAULT_PREFERENCES` e `DIFF_ALGORITHMS` da `src/shared/preferences.ts`;
  - in `validate.ts`: `intIn(value, name, min, max): number`, `preferences(current, patch): Preferences`;
  - nel main: `attempt(fn)` in `ipc-handlers.ts`;
  - `Api.updatePreferences(patch: Partial<Preferences>): Promise<Result<AppSettings>>`;
  - nello store dell'app: `settings: AppSettings | null`, `preferences` (computed), `updatePreferences(patch): Promise<boolean>`, `settingsSection: SettingsSection | null`, con `SettingsSection = 'general' | 'commit' | 'diff' | 'integrations' | 'git'`;
  - `SettingsView.vue` con l'array `SECTIONS: { id: SettingsSection; title: string; component: Component }[]`;
  - `PrefNumber.vue` con le props `field` (una chiave numerica di `Preferences`), `min` e `max`;
  - `launch(args, userData, env)` nei test E2E.

- [ ] **Step 1: Tipi**

In `src/shared/types.ts`, sostituisci `AppSettings` e aggiungi i tipi nuovi:

```ts
export type ThemePreference = 'system' | 'light' | 'dark'
export type DiffAlgorithm = 'default' | 'myers' | 'minimal' | 'patience' | 'histogram'

/** Preferenze dell'app, dalla schermata Impostazioni. */
export interface Preferences {
  theme: ThemePreference
  /** 0 = fetch automatico spento. */
  autoFetchMinutes: number
  fetchPrune: boolean
  restoreTabs: boolean
  subjectWarn: number
  subjectLimit: number
  /** Colonna della guida nella descrizione; 0 = nessuna. */
  bodyGuide: number
  diffSplit: boolean
  diffIgnoreWhitespace: boolean
  diffContext: number
  diffAlgorithm: DiffAlgorithm
  codeFontSize: number
  tabSize: number
  /** null = app predefinita del sistema. */
  editorApp: string | null
  /** null = terminale predefinito. */
  terminalApp: string | null
  /** null = il dialog del clone non parte da una cartella precisa. */
  cloneFolder: string | null
}

export interface CommitTemplate {
  id: string
  name: string
  subject: string
  body: string
}

/** Chiavi della config globale di git gestite dalla sezione Git delle Impostazioni. */
export type GitConfigKey = 'user.name' | 'user.email' | 'commit.gpgsign' | 'gpg.format' | 'user.signingkey' | 'pull.rebase' | 'init.defaultBranch'

export interface AppSettings {
  gitPath: string
  openRepos: string[]
  activeRepo: string | null
  recentRepos: string[]
  preferences: Preferences
  commitTemplates: CommitTemplate[]
  /** Radice del repo → id del template predefinito. */
  defaultTemplates: Record<string, string>
}
```

Crea `src/shared/preferences.ts`:

```ts
import type { DiffAlgorithm, Preferences } from './types'

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  autoFetchMinutes: 10,
  fetchPrune: true,
  restoreTabs: true,
  subjectWarn: 50,
  subjectLimit: 72,
  bodyGuide: 72,
  diffSplit: false,
  diffIgnoreWhitespace: false,
  diffContext: 3,
  diffAlgorithm: 'default',
  codeFontSize: 12,
  tabSize: 4,
  editorApp: null,
  terminalApp: null,
  cloneFolder: null,
}

export const DIFF_ALGORITHMS = ['default', 'myers', 'minimal', 'patience', 'histogram'] as const satisfies readonly DiffAlgorithm[]
```

- [ ] **Step 2: Test unit delle impostazioni e della validazione**

In `test/unit/settings.test.ts`:
- importa `DEFAULT_PREFERENCES` da `../../src/shared/preferences`;
- definisci in cima al file
  ```ts
  const base = { gitPath: 'git', openRepos: [], activeRepo: null, recentRepos: [], preferences: DEFAULT_PREFERENCES, commitTemplates: [], defaultTemplates: {} }
  ```
- sostituisci i due `toEqual({ gitPath: … recentRepos: [] })` con `toEqual(base)` e `toEqual({ ...base, gitPath: '/usr/bin/git', openRepos: ['/a'] })`;
- aggiungi:

```ts
  it('file senza preferenze o con preferenze parziali: i campi mancanti prendono i default', () => {
    const f = file()
    new SettingsStore(f).update({})
    writeFileSync(f, JSON.stringify({ gitPath: 'git', preferences: { theme: 'dark' } }))
    expect(new SettingsStore(f).get().preferences).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark' })
    expect(new SettingsStore(f).get().commitTemplates).toEqual([])
  })
```

In `test/unit/validate.test.ts`, importa `preferences` da `../../src/main/validate` e `DEFAULT_PREFERENCES` da `../../src/shared/preferences`, poi aggiungi:

```ts
describe('preferenze', () => {
  it('valida il risultato della modifica e scarta i campi sconosciuti', () => {
    expect(preferences(DEFAULT_PREFERENCES, { theme: 'dark', extra: 1 })).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark' })
    expect(preferences(DEFAULT_PREFERENCES, { bodyGuide: 0 }).bodyGuide).toBe(0)
    expect(preferences(DEFAULT_PREFERENCES, { editorApp: '/Applications/Code.app' }).editorApp).toBe('/Applications/Code.app')
  })

  it('rifiuta valori fuori intervallo, tipi sbagliati e vincoli fra campi violati', () => {
    for (const bad of [
      { theme: 'blu' },
      { autoFetchMinutes: 61 },
      { autoFetchMinutes: 1.5 },
      { diffContext: 0 },
      { bodyGuide: 20 },
      { fetchPrune: 'sì' },
      { diffAlgorithm: 'git' },
      { editorApp: 'Code.app' },
      { subjectLimit: 40 }, // sotto subjectWarn (50)
    ]) expect(() => preferences(DEFAULT_PREFERENCES, bad)).toThrow()
    expect(() => preferences({ ...DEFAULT_PREFERENCES, subjectLimit: 60 }, { subjectWarn: 70 })).toThrow()
  })
})
```

Run: `npx vitest run test/unit/settings.test.ts test/unit/validate.test.ts`
Expected: FAIL, perché mancano le preferenze in `SettingsStore` e la funzione `preferences`.

- [ ] **Step 3: `SettingsStore` con i default delle preferenze**

In `src/main/settings.ts`:

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_PREFERENCES } from '../shared/preferences'
import type { AppSettings } from '../shared/types'

const DEFAULTS: AppSettings = {
  gitPath: 'git',
  openRepos: [],
  activeRepo: null,
  recentRepos: [],
  preferences: DEFAULT_PREFERENCES,
  commitTemplates: [],
  defaultTemplates: {},
}
```

e nel costruttore:

```ts
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
      // Le preferenze si uniscono campo per campo: un file di una versione precedente prende i default di quelle nuove
      this.data = { ...structuredClone(DEFAULTS), ...saved, preferences: { ...DEFAULT_PREFERENCES, ...saved.preferences } }
    } catch {
      this.data = structuredClone(DEFAULTS)
    }
```

- [ ] **Step 4: Validazione delle preferenze**

In `src/main/validate.ts`:
- aggiungi all'import dei tipi `Preferences`;
- importa `DIFF_ALGORITHMS` da `../shared/preferences`;
- aggiungi:

```ts
export function intIn(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${name}: serve un numero intero da ${min} a ${max}`)
  }
  return value
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${name} non valido`)
  return value
}

function absolutePath(value: unknown, name: string): string | null {
  if (value === null) return null
  const s = str(value, name)
  if (!isAbsolute(s) || s.length > 1024) throw new TypeError(`${name}: serve un percorso assoluto`)
  return s
}

/** Preferenze dopo una modifica parziale: si valida il risultato, così i vincoli fra campi valgono sempre. */
export function preferences(current: Preferences, patch: unknown): Preferences {
  const p = { ...current, ...(typeof patch === 'object' && patch !== null ? patch : {}) } as Record<string, unknown>
  const subjectWarn = intIn(p.subjectWarn, "Avviso sull'oggetto", 20, 200)
  return {
    theme: oneOf(p.theme, ['system', 'light', 'dark'] as const, 'Tema'),
    autoFetchMinutes: intIn(p.autoFetchMinutes, 'Fetch automatico', 0, 60),
    fetchPrune: bool(p.fetchPrune, 'Prune'),
    restoreTabs: bool(p.restoreTabs, 'Riapri le tab'),
    subjectWarn,
    subjectLimit: intIn(p.subjectLimit, "Limite dell'oggetto", subjectWarn, 200),
    bodyGuide: p.bodyGuide === 0 ? 0 : intIn(p.bodyGuide, 'Guida della descrizione', 40, 200),
    diffSplit: bool(p.diffSplit, 'Vista del diff'),
    diffIgnoreWhitespace: bool(p.diffIgnoreWhitespace, 'Ignora spazi'),
    diffContext: intIn(p.diffContext, 'Righe di contesto', 1, 20),
    diffAlgorithm: oneOf(p.diffAlgorithm, DIFF_ALGORITHMS, 'Algoritmo del diff'),
    codeFontSize: intIn(p.codeFontSize, 'Dimensione del carattere', 10, 20),
    tabSize: intIn(p.tabSize, 'Larghezza del tab', 1, 8),
    editorApp: absolutePath(p.editorApp, 'Editor'),
    terminalApp: absolutePath(p.terminalApp, 'Terminale'),
    cloneFolder: absolutePath(p.cloneFolder, 'Cartella dei clone'),
  }
}
```

Run: `npx vitest run test/unit/settings.test.ts test/unit/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: IPC `updatePreferences` e tema nel main**

In `src/shared/ipc.ts`:
- importa `Preferences`;
- in `Channels` aggiungi `updatePreferences: 'settings:update-preferences',`;
- in `Api`, dopo `getSettings`:

```ts
  /** Salva le preferenze (validate nel main) e ne applica gli effetti; restituisce le impostazioni aggiornate. */
  updatePreferences(patch: Partial<Preferences>): Promise<Result<AppSettings>>
```

In `src/preload/index.ts`, dopo `getSettings`:

```ts
  updatePreferences: (patch) => ipcRenderer.invoke(Channels.updatePreferences, patch),
```

In `src/main/ipc-handlers.ts`:
- aggiungi `nativeTheme` all'import da `electron`, `Preferences` all'import dei tipi e `preferences as validatePreferences` all'import da `./validate`;
- subito dopo `withSession`:

```ts
  async function attempt<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
    try {
      return { ok: true, value: await fn() }
    } catch (e) {
      return fail(e)
    }
  }

  /** Effetti delle preferenze nel main: il tema (che segue anche il CSS con prefers-color-scheme). */
  function applyPreferences(p: Preferences): void {
    nativeTheme.themeSource = p.theme
  }
  applyPreferences(settings.get().preferences)
```

- dopo l'handler di `getSettings`:

```ts
  ipcMain.handle(Channels.updatePreferences, (_e, patch: unknown) =>
    attempt(() => {
      const updated = settings.update({ preferences: validatePreferences(settings.get().preferences, patch) })
      applyPreferences(updated.preferences)
      return updated
    }),
  )
```

`registerIpc` viene eseguita prima di `createWindow`, quindi il tema è applicato prima che la finestra compaia.

- [ ] **Step 6: Scorciatoia, azione e barra dei menu**

In `src/shared/shortcuts.ts`, dentro `shortcuts`:

```ts
  'settings.open': { key: ',', mod: true },
```

In `src/renderer/actions/builtin.ts`, dentro `registry.register(…)`:

```ts
    { id: 'settings.open', title: 'Impostazioni…', keys: shortcuts['settings.open'], run: () => { app.settingsSection ??= 'general' } },
```

In `src/main/menu.ts`:
- sostituisci `...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),` con il menu dell'app esplicito:

```ts
    ...(isMac
      ? [
          {
            label: 'Merlino',
            submenu: [
              { role: 'about', label: 'Informazioni su Merlino' },
              { type: 'separator' },
              action('Impostazioni…', 'settings.open'),
              { type: 'separator' },
              { role: 'services', label: 'Servizi' },
              { type: 'separator' },
              { role: 'hide', label: 'Nascondi Merlino' },
              { role: 'hideOthers', label: 'Nascondi altre' },
              { role: 'unhide', label: 'Mostra tutte' },
              { type: 'separator' },
              { role: 'quit', label: 'Esci da Merlino' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
```

- nel `submenu` di File, sostituisci `...quit,` con:

```ts
        ...(isMac ? [] : [{ type: 'separator' } as MenuItemConstructorOptions, action('Impostazioni…', 'settings.open')]),
        ...quit,
```

- [ ] **Step 7: Store dell'app**

In `src/renderer/stores/app.ts`:
- importa `computed` da `vue`, `DEFAULT_PREFERENCES` da `../../shared/preferences`, e `AppSettings` e `Preferences` da `../../shared/types`;
- dopo `PromptValues` aggiungi:

```ts
export type SettingsSection = 'general' | 'commit' | 'diff' | 'integrations' | 'git'
```

- dentro lo store, dopo `cloneProgress`:

```ts
  const settings = ref<AppSettings | null>(null)
  const preferences = computed(() => settings.value?.preferences ?? DEFAULT_PREFERENCES)
  /** Sezione della schermata Impostazioni aperta; null = chiusa. */
  const settingsSection = ref<SettingsSection | null>(null)

  async function updatePreferences(patch: Partial<Preferences>): Promise<boolean> {
    const r = await window.api.updatePreferences(patch)
    if (r.ok) settings.value = r.value
    else error.value = r.error.message
    return r.ok
  }
```

- in `init`, prima di `git.value = await window.api.checkGit()`:

```ts
    settings.value = await window.api.getSettings()
```

- in `restore`, sostituisci le prime righe fino al ciclo compreso:

```ts
  async function restore() {
    const s = await window.api.getSettings()
    settings.value = s
    recent.value = s.recentRepos
    for (const path of s.openRepos) {
      // Senza "Riapri le tab" si dimenticano anche le tab della sessione precedente
      if (!s.preferences.restoreTabs || !(await open(path, false))) await window.api.closeRepo(path)
    }
```

- aggiungi `settings, preferences, settingsSection` e `updatePreferences` al `return`.

- [ ] **Step 8: Stili comuni dei moduli**

In `src/renderer/styles.css`, dopo le regole di `dialog`:

```css
/* Moduli delle Impostazioni */
select { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 4px 6px; }
.settings-form { display: grid; grid-template-columns: minmax(170px, max-content) minmax(0, 1fr); gap: 10px 16px; align-items: center; max-width: 760px; }
.settings-form h2 { grid-column: 1 / -1; margin: 18px 0 2px; font-size: 13px; }
.settings-form h2:first-child { margin-top: 0; }
.settings-form > label:not(.check) { color: var(--fg-muted); }
.settings-form .check { display: flex; align-items: center; gap: 6px; }
.settings-form .row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.settings-form .hint { grid-column: 2; margin: -4px 0 0; font-size: 12px; color: var(--fg-muted); }
.settings-form input[type='number'] { width: 80px; }
```

- [ ] **Step 9: `PrefNumber.vue`, `GeneralSettings.vue`, `SettingsView.vue`**

Crea `src/renderer/components/settings/PrefNumber.vue`:

```vue
<script setup lang="ts">
import type { Preferences } from '../../../shared/types'
import { useAppStore } from '../../stores/app'

type NumberField = { [K in keyof Preferences]: Preferences[K] extends number ? K : never }[keyof Preferences]
const props = defineProps<{ field: NumberField; min: number; max: number }>()
const app = useAppStore()

async function save(e: Event) {
  const input = e.target as HTMLInputElement
  const saved = app.preferences[props.field]
  const n = Number(input.value)
  // Valore non valido o rifiutato dal main: il campo torna a quello salvato
  if (!Number.isInteger(n) || n < props.min || n > props.max) input.value = String(saved)
  else if (n !== saved && !(await app.updatePreferences({ [props.field]: n } as Partial<Preferences>))) input.value = String(saved)
}
</script>

<template>
  <input type="number" :min="min" :max="max" step="1" :value="app.preferences[field]" :data-testid="`pref-${field}`" @change="save" />
</template>
```

Crea `src/renderer/components/settings/GeneralSettings.vue`:

```vue
<script setup lang="ts">
import type { ThemePreference } from '../../../shared/types'
import { useAppStore } from '../../stores/app'

const app = useAppStore()
const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Come il sistema' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
]
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>Aspetto</h2>
    <label for="pref-theme">Tema</label>
    <select
      id="pref-theme"
      data-testid="pref-theme"
      :value="app.preferences.theme"
      @change="app.updatePreferences({ theme: ($event.target as HTMLSelectElement).value as ThemePreference })"
    >
      <option v-for="t in THEMES" :key="t.value" :value="t.value">{{ t.label }}</option>
    </select>

    <h2>Avvio</h2>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-restoreTabs"
        :checked="app.preferences.restoreTabs"
        @change="app.updatePreferences({ restoreTabs: checked($event) })"
      />
      Riapri le tab all'avvio
    </label>
  </form>
</template>
```

Crea `src/renderer/components/SettingsView.vue`:

```vue
<script setup lang="ts">
import { type Component, computed, onMounted, onUnmounted } from 'vue'
import { type SettingsSection, useAppStore } from '../stores/app'
import GeneralSettings from './settings/GeneralSettings.vue'

const app = useAppStore()
const SECTIONS: { id: SettingsSection; title: string; component: Component }[] = [
  { id: 'general', title: 'Generale', component: GeneralSettings },
]
const current = computed(() => SECTIONS.find((s) => s.id === app.settingsSection) ?? SECTIONS[0])

// Esc chiude, a meno che sia aperto un dialog (che usa Esc per sé)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) app.settingsSection = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="settings" data-testid="settings">
    <nav>
      <h1>Impostazioni</h1>
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        :class="{ active: current?.id === s.id }"
        :data-testid="`settings-${s.id}`"
        @click="app.settingsSection = s.id"
      >{{ s.title }}</button>
    </nav>
    <div class="content">
      <header>
        <h2>{{ current?.title }}</h2>
        <button class="close" aria-label="Chiudi le impostazioni" data-testid="settings-close" @click="app.settingsSection = null">×</button>
      </header>
      <p v-if="app.error" class="error message">
        <span>{{ app.error }}</span>
        <button aria-label="Chiudi errore" @click="app.error = null">×</button>
      </p>
      <component :is="current?.component" />
    </div>
  </section>
</template>

<style scoped>
.settings { display: grid; grid-template-columns: 200px minmax(0, 1fr); height: 100%; }
nav { display: flex; flex-direction: column; gap: 2px; padding: 16px 10px; background: var(--bg-alt); border-right: 1px solid var(--border); }
nav h1 { margin: 0 8px 12px; font-size: 15px; }
nav button { text-align: left; border: 0; background: transparent; padding: 6px 10px; }
nav button:hover { background: var(--bg-hover); }
nav button.active { background: var(--selected-bg); font-weight: 600; }
.content { min-height: 0; overflow: auto; padding: 16px 24px 32px; }
header { display: flex; align-items: center; margin-bottom: 16px; }
header h2 { flex: 1; margin: 0; font-size: 18px; }
.close { border: 0; background: transparent; font-size: 18px; padding: 2px 8px; }
.message { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 6px 10px; background: var(--danger-bg); border-radius: 5px; }
.message span { flex: 1; }
.message button { border: 0; background: transparent; }
</style>
```

In `src/renderer/App.vue`:
- importa `SettingsView`;
- nel template sostituisci `<GitMissing v-else-if="!app.git.ok" />` con:

```html
    <SettingsView v-else-if="app.settingsSection" />
    <GitMissing v-else-if="!app.git.ok" />
```

- [ ] **Step 10: `launch` con variabili d'ambiente e test E2E**

In `test/e2e/launch.ts`, aggiungi alla firma il parametro `env: Record<string, string> = {}` e unisci le variabili:

```ts
export async function launch(
  args: string[] = [],
  userData = tempUserData(),
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const executablePath = process.env.MERLINO_EXECUTABLE
  const app = await electron.launch({
    executablePath,
    args: executablePath ? args : ['.', ...args],
    env: { ...process.env, MERLINO_USER_DATA: userData, ...env } as Record<string, string>,
  })
  return { app, page: await app.firstWindow(), userData }
}
```

Crea `test/e2e/settings.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Impostazioni: ⌘, apre, il tema arriva a nativeTheme, Esc chiude; senza "Riapri le tab" il riavvio parte vuoto', async () => {
  const repo = makeRepo(1)
  const { app, page, userData } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(1)

  await page.keyboard.press(`${mod}+Comma`)
  await expect(page.getByTestId('settings')).toBeVisible()
  await page.getByTestId('pref-theme').selectOption('dark')
  await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await page.getByTestId('pref-restoreTabs').uncheck()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings')).toBeHidden()
  await expect(page.getByTestId('commit-row')).toHaveCount(1)
  await app.close()

  const again = await launch([], userData)
  await expect(again.page.getByRole('button', { name: 'Apri repository…' })).toBeVisible()
  await expect(again.page.getByTestId('tab')).toHaveCount(0)
  expect(await again.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await again.app.close()
})
```

- [ ] **Step 11: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde; `settings.spec.ts` passa.

```bash
git add src test
git commit -m "feat: schermata Impostazioni con preferenze validate nel main e tema Sistema/Chiaro/Scuro"
```

---

### Task 2: Fetch automatico e `--prune` facoltativo

**Files:**
- Create: `src/main/auto-fetch.ts`
- Modify: `src/main/git/branches.ts`, `src/main/ipc-handlers.ts`, `src/renderer/components/settings/GeneralSettings.vue`
- Test: `test/unit/auto-fetch.test.ts`, `test/integration/branches.test.ts`

**Interfaces:**
- Consumes: `attempt` e `applyPreferences` (Task 1); `PrefNumber.vue` (Task 1).
- Produces:
  - `class AutoFetch { constructor(tick: () => void); schedule(minutes: number): void; stop(): void }`;
  - `fetch(r, onProgress, prune = true)`;
  - `runCommand(r, c, onProgress, prune = true)`.

- [ ] **Step 1: Test unit di `AutoFetch` con i timer finti**

Crea `test/unit/auto-fetch.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutoFetch } from '../../src/main/auto-fetch'

describe('AutoFetch', () => {
  afterEach(() => vi.useRealTimers())

  it('ogni N minuti; lo stesso intervallo non fa ripartire il timer; 0 lo ferma', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    const auto = new AutoFetch(tick)
    auto.schedule(10)
    vi.advanceTimersByTime(9 * 60_000)
    expect(tick).toHaveBeenCalledTimes(0)
    auto.schedule(10)
    vi.advanceTimersByTime(60_000)
    expect(tick).toHaveBeenCalledTimes(1)
    auto.schedule(2)
    vi.advanceTimersByTime(4 * 60_000)
    expect(tick).toHaveBeenCalledTimes(3)
    auto.schedule(0)
    vi.advanceTimersByTime(60 * 60_000)
    expect(tick).toHaveBeenCalledTimes(3)
  })
})
```

Run: `npx vitest run test/unit/auto-fetch.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/main/auto-fetch.ts`**

```ts
/** Fetch automatico ogni N minuti; 0 lo ferma. Lo stesso intervallo non fa ripartire il conto. */
export class AutoFetch {
  private timer: ReturnType<typeof setInterval> | null = null
  private minutes = 0

  constructor(private readonly tick: () => void) {}

  schedule(minutes: number): void {
    if (minutes === this.minutes) return
    this.stop()
    this.minutes = minutes
    if (minutes > 0) this.timer = setInterval(this.tick, minutes * 60_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.minutes = 0
  }
}
```

Run: `npx vitest run test/unit/auto-fetch.test.ts`
Expected: PASS.

- [ ] **Step 3: Test di integrazione del fetch senza `--prune`**

In fondo a `test/integration/branches.test.ts`, in un nuovo `describe('fetch', () => { … })` (il file importa già `fetch`, `git`, `makeRemotePair` e `runnerFor`):

```ts
  it('fetch senza --prune lascia i branch remoti cancellati sul server; con --prune li toglie', async () => {
    const { bare, clone: repo } = makeRemotePair()
    git(repo, 'push', '-q', 'origin', 'main:da-cancellare')
    git(bare, 'branch', '-D', 'da-cancellare')
    await fetch(runnerFor(repo), () => {}, false)
    expect(git(repo, 'branch', '-r')).toContain('origin/da-cancellare')
    await fetch(runnerFor(repo), () => {})
    expect(git(repo, 'branch', '-r')).not.toContain('origin/da-cancellare')
  })
```

Run: `npx vitest run test/integration/branches.test.ts`
Expected: FAIL, perché oggi il fetch usa sempre `--prune` e il branch sparisce già al primo fetch.

- [ ] **Step 4: `prune` in `fetch` e `runCommand`**

In `src/main/git/branches.ts`:

```ts
export const fetch = (r: GitRunner, onProgress: Progress, prune = true) =>
  run(r, ['fetch', '--all', ...(prune ? ['--prune'] : []), '--progress'], onProgress)
```

e:

```ts
/** Esegue un'operazione già validata (vedi validate.ts); prune vale per i fetch. */
export function runCommand(r: GitRunner, c: RepoCommand, onProgress: Progress, prune = true): Promise<void> {
```

con `case 'fetch': return fetch(r, onProgress, prune)`.

Run: `npx vitest run test/integration/branches.test.ts`
Expected: PASS.

- [ ] **Step 5: Timer nel main e prune dal fetch manuale**

In `src/main/ipc-handlers.ts`:
- importa `AutoFetch` da `./auto-fetch` e `fetch as gitFetch` dall'import di `./git/branches`;
- prima di `applyPreferences`:

```ts
  // In silenzio: nessun avanzamento al renderer, gli errori (es. credenziali) restano nel log dei comandi
  const autoFetch = new AutoFetch(() => {
    const prune = settings.get().preferences.fetchPrune
    for (const s of sessions.values()) gitFetch(s.runner, () => {}, prune).catch(() => {})
  })
```

- in `applyPreferences` aggiungi `autoFetch.schedule(p.autoFetchMinutes)`;
- nell'handler di `Channels.command`:

```ts
    withSession(root, (s) => runCommand(s.runner, repoCommand(command), progress(s.root), settings.get().preferences.fetchPrune)),
```

- in `disposeAll` aggiungi `autoFetch.stop()` come prima istruzione.

- [ ] **Step 6: Campi nella sezione Generale**

In `GeneralSettings.vue`, importa `PrefNumber from './PrefNumber.vue'` e aggiungi prima di `<h2>Avvio</h2>`:

```html
    <h2>Fetch</h2>
    <label for="pref-autoFetchMinutes">Fetch automatico</label>
    <div class="row">
      <PrefNumber id="pref-autoFetchMinutes" field="autoFetchMinutes" :min="0" :max="60" />
      <span class="muted">minuti (0 = spento)</span>
    </div>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-fetchPrune"
        :checked="app.preferences.fetchPrune"
        @change="app.updatePreferences({ fetchPrune: checked($event) })"
      />
      Togli i branch remoti cancellati sul server (--prune)
    </label>
```

- [ ] **Step 7: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: fetch automatico dei repo aperti e --prune facoltativo"
```

---

### Task 3: Preferenze del diff

**Files:**
- Create: `src/renderer/components/settings/DiffSettings.vue`
- Modify: `src/shared/types.ts` (`DiffOptions`), `src/main/validate.ts` (`diffOptions`)
- Modify: `src/main/git/diff.ts`, `src/main/git/working.ts`
- Modify: `src/renderer/stores/repo.ts`, `src/renderer/App.vue`
- Modify: `src/renderer/components/DiffView.vue`, `src/renderer/components/StageDiff.vue`, `src/renderer/components/SettingsView.vue`
- Test: `test/unit/validate.test.ts`, `test/integration/working.test.ts`

**Interfaces:**
- Consumes: `intIn`, `DIFF_ALGORITHMS`, `PrefNumber`, `useAppStore().preferences` (Task 1).
- Produces:
  - `DiffOptions { ignoreWhitespace; force; context?: number; algorithm?: DiffAlgorithm }`;
  - `diffFlags(options: DiffOptions): string[]` in `src/main/git/diff.ts`.

- [ ] **Step 1: Test**

In `test/unit/validate.test.ts`, importa `diffOptions` da `validate` e `diffFlags` da `../../src/main/git/diff`:

```ts
describe('opzioni del diff', () => {
  it('default 3 righe e algoritmo di git; valori fuori intervallo rifiutati', () => {
    expect(diffOptions({ ignoreWhitespace: true })).toEqual({ ignoreWhitespace: true, force: false, context: 3, algorithm: 'default' })
    expect(() => diffOptions({ context: 0 })).toThrow()
    expect(() => diffOptions({ algorithm: '--output=x' })).toThrow()
  })

  it('argomenti per git', () => {
    expect(diffFlags({ ignoreWhitespace: false, force: false })).toEqual(['-U3'])
    expect(diffFlags({ ignoreWhitespace: true, force: false, context: 1, algorithm: 'patience' })).toEqual(['-U1', '--diff-algorithm=patience', '-w'])
  })
})
```

In `test/integration/working.test.ts`, dentro `describe('modifiche locali', …)`:

```ts
  it('diff con 1 riga di contesto e algoritmo patience', async () => {
    const calls: string[][] = []
    const repo = makeRepo(0)
    writeFileSync(join(repo, 'f.txt'), '1\n2\n3\n4\n5\n6\n7\n8\n9\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'base')
    writeFileSync(join(repo, 'f.txt'), '1\n2\n3\n4\ncinque\n6\n7\n8\n9\n')
    const runner = new GitRunner(() => 'git', repo, (e) => calls.push(e.args))
    const diff = await readWorkingDiff(runner, { path: 'f.txt' }, 'unstaged', { ...options, context: 1, algorithm: 'patience' })
    expect(diff.hunks[0].lines.map((l) => l.text)).toEqual(['4', '5', 'cinque', '6'])
    expect(calls.at(-1)).toContain('--diff-algorithm=patience')
  })
```

Run: `npx vitest run test/unit/validate.test.ts test/integration/working.test.ts`
Expected: FAIL, perché `diffFlags` non esiste e il contesto resta 3.

- [ ] **Step 2: Tipi, validazione, argomenti**

In `src/shared/types.ts`:

```ts
export interface DiffOptions {
  ignoreWhitespace: boolean
  /** Mostra anche se supera i limiti. */
  force: boolean
  /** Righe di contesto (-U); default 3. */
  context?: number
  /** 'default' o assente: diff.algorithm della config di git. */
  algorithm?: DiffAlgorithm
}
```

In `src/main/validate.ts`:

```ts
export function diffOptions(value: unknown): DiffOptions {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    ignoreWhitespace: v.ignoreWhitespace === true,
    force: v.force === true,
    context: v.context === undefined ? 3 : intIn(v.context, 'Righe di contesto', 1, 20),
    algorithm: v.algorithm === undefined ? 'default' : oneOf(v.algorithm, DIFF_ALGORITHMS, 'Algoritmo del diff'),
  }
}
```

In `src/main/git/diff.ts`, sopra `readCommitFileDiff`:

```ts
/** Opzioni comuni a tutti i diff: righe di contesto, algoritmo, spazi. */
export function diffFlags(options: DiffOptions): string[] {
  return [
    `-U${options.context ?? 3}`,
    ...(options.algorithm && options.algorithm !== 'default' ? [`--diff-algorithm=${options.algorithm}`] : []),
    ...(options.ignoreWhitespace ? ['-w'] : []),
  ]
}
```

e in `readCommitFileDiff` sostituisci le prime due righe con:

```ts
  const args = ['show', '--format=', '--no-color', '--no-ext-diff', '--diff-merges=first-parent', '-M', ...diffFlags(options)]
```

In `src/main/git/working.ts`, importa `diffFlags` da `./diff` e scrivi:

```ts
  const base = ['--no-color', '--no-ext-diff', ...diffFlags(options)]
```

Run: `npx vitest run test/unit/validate.test.ts test/integration/working.test.ts`
Expected: PASS.

- [ ] **Step 3: Store, variabili CSS e sezione Diff**

In `src/renderer/stores/repo.ts`:
- importa `useAppStore` da `./app` e `DiffOptions` dai tipi;
- sostituisci `const diffOptions = reactive({ split: false, ignoreWhitespace: false })` con:

```ts
    const prefs = () => useAppStore().preferences
    const diffOptions = reactive({ split: prefs().diffSplit, ignoreWhitespace: prefs().diffIgnoreWhitespace })
    const diffRequest = (force: boolean): DiffOptions => ({
      ignoreWhitespace: diffOptions.ignoreWhitespace,
      force,
      context: prefs().diffContext,
      algorithm: prefs().diffAlgorithm,
    })
```

- in `loadDiff` passa `diffRequest(force)` e in `loadWorkingDiff` passa `diffRequest(false)`, al posto degli oggetti scritti a mano.

In `src/renderer/App.vue`, importa `watchEffect` e aggiungi dopo `registerBranchActions()`:

```ts
// Carattere e tab del codice nei diff, dalle preferenze
watchEffect(() => {
  const root = document.documentElement.style
  root.setProperty('--code-size', `${app.preferences.codeFontSize}px`)
  root.setProperty('--tab-size', String(app.preferences.tabSize))
})
```

In `DiffView.vue`, nella regola `.diff`, e in `StageDiff.vue`, nella regola `.hunks`, sostituisci `font-size: 12px;` con `font-size: var(--code-size, 12px); tab-size: var(--tab-size, 4);`.

Crea `src/renderer/components/settings/DiffSettings.vue`:

```vue
<script setup lang="ts">
import type { DiffAlgorithm } from '../../../shared/types'
import { useAppStore } from '../../stores/app'
import PrefNumber from './PrefNumber.vue'

const app = useAppStore()
const ALGORITHMS: { value: DiffAlgorithm; label: string }[] = [
  { value: 'default', label: 'Quello di git (diff.algorithm)' },
  { value: 'myers', label: 'Myers' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'patience', label: 'Patience' },
  { value: 'histogram', label: 'Histogram' },
]
const value = (e: Event) => (e.target as HTMLSelectElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>All'apertura di un repo</h2>
    <label for="pref-diffSplit">Vista</label>
    <select
      id="pref-diffSplit"
      data-testid="pref-diffSplit"
      :value="app.preferences.diffSplit ? 'split' : 'unified'"
      @change="app.updatePreferences({ diffSplit: value($event) === 'split' })"
    >
      <option value="unified">Unificata</option>
      <option value="split">Affiancata</option>
    </select>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-diffIgnoreWhitespace"
        :checked="app.preferences.diffIgnoreWhitespace"
        @change="app.updatePreferences({ diffIgnoreWhitespace: checked($event) })"
      />
      Ignora gli spazi
    </label>

    <h2>Calcolo</h2>
    <label for="pref-diffContext">Righe di contesto</label>
    <PrefNumber id="pref-diffContext" field="diffContext" :min="1" :max="20" />
    <label for="pref-diffAlgorithm">Algoritmo</label>
    <select
      id="pref-diffAlgorithm"
      data-testid="pref-diffAlgorithm"
      :value="app.preferences.diffAlgorithm"
      @change="app.updatePreferences({ diffAlgorithm: value($event) as DiffAlgorithm })"
    >
      <option v-for="a in ALGORITHMS" :key="a.value" :value="a.value">{{ a.label }}</option>
    </select>
    <p class="hint">Patience e histogram allineano meglio i blocchi spostati; valgono dal prossimo diff aperto.</p>

    <h2>Testo</h2>
    <label for="pref-codeFontSize">Dimensione del carattere</label>
    <div class="row"><PrefNumber id="pref-codeFontSize" field="codeFontSize" :min="10" :max="20" /> <span class="muted">px</span></div>
    <label for="pref-tabSize">Larghezza del tab</label>
    <div class="row"><PrefNumber id="pref-tabSize" field="tabSize" :min="1" :max="8" /> <span class="muted">spazi</span></div>
  </form>
</template>
```

In `SettingsView.vue`, importa `DiffSettings` e aggiungi a `SECTIONS`, dopo Generale:

```ts
  { id: 'diff', title: 'Diff', component: DiffSettings },
```

- [ ] **Step 4: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde. Gli E2E che passano `{ ignoreWhitespace, force }` all'API funzionano ancora, perché contesto e algoritmo sono facoltativi.

```bash
git add src test
git commit -m "feat: preferenze del diff (vista, spazi, contesto, algoritmo, carattere e tab)"
```

---

### Task 4: Sezione Git (config globale, eseguibile, cartella dei clone)

**Files:**
- Create: `src/main/git/global-config.ts`
- Create: `src/renderer/components/settings/GitSettings.vue`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`
- Modify: `src/main/validate.ts`, `src/main/ipc-handlers.ts`
- Modify: `src/renderer/stores/app.ts` (`cloneRepo`), `src/renderer/components/SettingsView.vue`
- Test: `test/integration/global-config.test.ts`, `test/unit/validate.test.ts`, `test/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `attempt` (Task 1); `launch(args, userData, env)` (Task 1).
- Produces:
  - `GIT_CONFIG_KEYS`, `readGlobalConfig(runner): Promise<Record<GitConfigKey, string>>`, `setGlobalConfig(runner, key, value): Promise<void>`;
  - `gitConfigEntry(key, value): [GitConfigKey, string]` in `validate.ts`;
  - nell'API: `gitGlobalConfig()`, `setGitGlobalConfig(key, value)`, `pickRepoFolder(defaultPath?)`.

- [ ] **Step 1: Test**

Crea `test/integration/global-config.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readGlobalConfig, setGlobalConfig } from '../../src/main/git/global-config'
import { GitRunner } from '../../src/main/git/runner'

// Mai la config vera dell'utente: un file temporaneo al posto di ~/.gitconfig
const useTempGlobal = () => {
  const file = join(mkdtempSync(join(tmpdir(), 'merlino-gc-')), 'gitconfig')
  process.env.GIT_CONFIG_GLOBAL = file
  return file
}
afterEach(() => {
  process.env.GIT_CONFIG_GLOBAL = devNull
})
const runner = () => new GitRunner(() => 'git', tmpdir())

describe('config globale di git', () => {
  it('file mancante: tutte le chiavi vuote', async () => {
    useTempGlobal()
    expect(Object.values(await readGlobalConfig(runner())).every((v) => v === '')).toBe(true)
  })

  it('scrive, rilegge (anche init.defaultBranch, che git restituisce in minuscolo) e toglie', async () => {
    const file = useTempGlobal()
    writeFileSync(file, '[core]\n\teditor = vim\n')
    const r = runner()
    await setGlobalConfig(r, 'user.name', 'Ada Lovelace')
    await setGlobalConfig(r, 'init.defaultBranch', 'main')
    await setGlobalConfig(r, 'commit.gpgsign', 'true')
    expect(await readGlobalConfig(r)).toMatchObject({ 'user.name': 'Ada Lovelace', 'init.defaultBranch': 'main', 'commit.gpgsign': 'true', 'user.email': '' })
    await setGlobalConfig(r, 'user.name', '')
    await setGlobalConfig(r, 'user.email', '') // già assente: nessun errore
    expect((await readGlobalConfig(r))['user.name']).toBe('')
    expect(readFileSync(file, 'utf8')).toContain('editor = vim')
  })
})
```

In `test/unit/validate.test.ts`, importa `gitConfigEntry`:

```ts
describe('config globale di git', () => {
  it('solo le chiavi gestite, con i valori ammessi', () => {
    expect(gitConfigEntry('user.name', '  Ada  ')).toEqual(['user.name', 'Ada'])
    expect(gitConfigEntry('pull.rebase', '')).toEqual(['pull.rebase', ''])
    expect(gitConfigEntry('gpg.format', 'ssh')).toEqual(['gpg.format', 'ssh'])
    for (const [k, v] of [
      ['core.editor', 'vim'],
      ['user.name', '--global'],
      ['user.name', 'a\nb'],
      ['gpg.format', 'pgp'],
      ['commit.gpgsign', 'yes'],
      ['init.defaultBranch', 'a b'],
    ]) expect(() => gitConfigEntry(k, v)).toThrow()
  })
})
```

Run: `npx vitest run test/integration/global-config.test.ts test/unit/validate.test.ts`
Expected: FAIL, perché i moduli non esistono.

- [ ] **Step 2: `src/main/git/global-config.ts`**

```ts
import type { GitConfigKey } from '../../shared/types'
import type { GitRunner } from './runner'

export const GIT_CONFIG_KEYS = [
  'user.name',
  'user.email',
  'commit.gpgsign',
  'gpg.format',
  'user.signingkey',
  'pull.rebase',
  'init.defaultBranch',
] as const satisfies readonly GitConfigKey[]

const PATTERN = `^(${GIT_CONFIG_KEYS.map((k) => k.replace('.', '\\.')).join('|')})$`

/** Le chiavi gestite dalla sezione Git; '' se non impostate. */
export async function readGlobalConfig(runner: GitRunner): Promise<Record<GitConfigKey, string>> {
  // exit 1: nessuna chiave trovata (anche se il file globale non esiste)
  const out = await runner.run(['config', '--global', '-z', '--get-regexp', PATTERN], { okCodes: [0, 1] })
  const found = new Map<string, string>()
  for (const entry of out.stdout.split('\0')) {
    const nl = entry.indexOf('\n')
    if (nl > 0) found.set(entry.slice(0, nl).toLowerCase(), entry.slice(nl + 1))
  }
  // git restituisce i nomi delle chiavi in minuscolo (init.defaultbranch)
  return Object.fromEntries(GIT_CONFIG_KEYS.map((k) => [k, found.get(k.toLowerCase()) ?? ''])) as Record<GitConfigKey, string>
}

/** '' toglie la chiave; exit 5 = era già assente. */
export async function setGlobalConfig(runner: GitRunner, key: GitConfigKey, value: string): Promise<void> {
  if (value === '') await runner.run(['config', '--global', '--unset-all', key], { write: true, okCodes: [0, 5] })
  else await runner.run(['config', '--global', key, value], { write: true })
}
```

In `src/main/validate.ts`:
- importa `GIT_CONFIG_KEYS` da `./git/global-config` e il tipo `GitConfigKey`;
- aggiungi:

```ts
/** Una chiave della sezione Git e il suo valore; '' = togli la chiave. */
export function gitConfigEntry(key: unknown, value: unknown): [GitConfigKey, string] {
  const k = oneOf(key, GIT_CONFIG_KEYS, 'chiave')
  if (typeof value !== 'string' || /[\r\n\0]/.test(value) || value.length > 200) throw new TypeError(`${k}: valore non valido`)
  const v = value.trim()
  if (v === '') return [k, '']
  if (v.startsWith('-')) throw new TypeError(`${k}: il valore non può iniziare con "-"`)
  switch (k) {
    case 'commit.gpgsign':
    case 'pull.rebase':
      return [k, oneOf(v, ['true', 'false'] as const, k)]
    case 'gpg.format':
      return [k, oneOf(v, ['openpgp', 'ssh', 'x509'] as const, k)]
    case 'init.defaultBranch':
      return [k, refName(v)]
    default:
      return [k, v]
  }
}
```

Run: `npx vitest run test/integration/global-config.test.ts test/unit/validate.test.ts`
Expected: PASS.

- [ ] **Step 3: IPC**

In `src/shared/ipc.ts`:
- importa `GitConfigKey`;
- in `Channels` aggiungi `gitGlobalConfig: 'git:global-config'` e `setGitGlobalConfig: 'git:set-global-config'`;
- nell'`Api` sostituisci `pickRepoFolder(): Promise<string | null>` con `pickRepoFolder(defaultPath?: string): Promise<string | null>` e aggiungi:

```ts
  /** Chiavi della config globale di git gestite dalle Impostazioni; '' = non impostata. */
  gitGlobalConfig(): Promise<Result<Record<GitConfigKey, string>>>
  /** '' toglie la chiave. */
  setGitGlobalConfig(key: GitConfigKey, value: string): Promise<Result<void>>
```

In `src/preload/index.ts`:

```ts
  pickRepoFolder: (defaultPath) => ipcRenderer.invoke(Channels.pickRepoFolder, defaultPath),
  gitGlobalConfig: () => ipcRenderer.invoke(Channels.gitGlobalConfig),
  setGitGlobalConfig: (key, value) => ipcRenderer.invoke(Channels.setGitGlobalConfig, key, value),
```

In `src/main/ipc-handlers.ts`:
- importa `homedir` da `node:os`, `readGlobalConfig` e `setGlobalConfig` da `./git/global-config`, e `gitConfigEntry` da `./validate`;
- dopo `const onLog = …`:

```ts
  // Per la config globale: una cartella qualsiasi va bene, e le scritture vanno in coda fra loro
  const globalRunner = new GitRunner(gitPath, homedir(), onLog)
```

- nell'handler di `pickRepoFolder`, prendi `defaultPath`:

```ts
  ipcMain.handle(Channels.pickRepoFolder, async (_e, defaultPath: unknown) => {
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      ...(typeof defaultPath === 'string' && isAbsolute(defaultPath) ? { defaultPath } : {}),
    }
```

- aggiungi:

```ts
  ipcMain.handle(Channels.gitGlobalConfig, () => attempt(() => readGlobalConfig(globalRunner)))
  ipcMain.handle(Channels.setGitGlobalConfig, (_e, key: unknown, value: unknown) =>
    attempt(() => {
      const [k, v] = gitConfigEntry(key, value)
      return setGlobalConfig(globalRunner, k, v)
    }),
  )
```

- [ ] **Step 4: Cartella del clone nello store**

In `src/renderer/stores/app.ts`, in `cloneRepo`:

```ts
    const parent = await window.api.pickRepoFolder(preferences.value.cloneFolder ?? undefined)
```

- [ ] **Step 5: `GitSettings.vue`**

```vue
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { GitConfigKey } from '../../../shared/types'
import { useAppStore } from '../../stores/app'

const app = useAppStore()
const gitPath = ref(app.git?.path ?? 'git')
const config = reactive<Record<string, string>>({})
const loaded = ref(false)

onMounted(async () => {
  const r = await window.api.gitGlobalConfig()
  if (r.ok) Object.assign(config, r.value)
  else app.error = r.error.message
  loaded.value = r.ok
})

async function save(key: GitConfigKey, value: string) {
  const r = await window.api.setGitGlobalConfig(key, value)
  if (r.ok) config[key] = value.trim()
  else app.error = r.error.message
}

async function pickCloneFolder() {
  const path = await window.api.pickRepoFolder(app.preferences.cloneFolder ?? undefined)
  if (path) await app.updatePreferences({ cloneFolder: path })
}

const text = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>Eseguibile</h2>
    <label for="git-path">Percorso di git</label>
    <div class="row">
      <input id="git-path" v-model="gitPath" data-testid="settings-git-path" placeholder="git" />
      <button type="button" data-testid="settings-git-path-apply" @click="app.setGitPath(gitPath.trim() || 'git')">Usa</button>
    </div>
    <p class="hint" :class="{ error: app.git && !app.git.ok }">{{ app.git?.ok ? `git ${app.git.version}` : app.git?.error }}</p>

    <template v-if="loaded">
      <h2>Identità</h2>
      <p class="hint full">Config globale di git (~/.gitconfig): vale per tutti i repo, anche da riga di comando.</p>
      <label for="git-user-name">Nome</label>
      <input id="git-user-name" data-testid="git-user.name" :value="config['user.name']" @change="save('user.name', text($event))" />
      <label for="git-user-email">Email</label>
      <input id="git-user-email" data-testid="git-user.email" type="email" :value="config['user.email']" @change="save('user.email', text($event))" />

      <h2>Firma dei commit</h2>
      <span />
      <label class="check">
        <input
          type="checkbox"
          data-testid="git-commit.gpgsign"
          :checked="config['commit.gpgsign'] === 'true'"
          @change="save('commit.gpgsign', checked($event) ? 'true' : '')"
        />
        Firma tutti i commit
      </label>
      <label for="git-gpg-format">Formato</label>
      <select id="git-gpg-format" data-testid="git-gpg.format" :value="config['gpg.format'] ?? ''" @change="save('gpg.format', text($event))">
        <option value="">GPG (predefinito di git)</option>
        <option value="openpgp">GPG</option>
        <option value="ssh">SSH</option>
      </select>
      <label for="git-signingkey">Chiave</label>
      <input
        id="git-signingkey"
        data-testid="git-user.signingkey"
        placeholder="ID della chiave GPG o percorso della chiave SSH pubblica"
        :value="config['user.signingkey']"
        @change="save('user.signingkey', text($event))"
      />

      <h2>Pull e nuovi repository</h2>
      <label for="git-pull-rebase">Pull</label>
      <select id="git-pull-rebase" data-testid="git-pull.rebase" :value="config['pull.rebase'] ?? ''" @change="save('pull.rebase', text($event))">
        <option value="">Non impostato</option>
        <option value="false">Merge</option>
        <option value="true">Rebase</option>
      </select>
      <label for="git-default-branch">Branch iniziale</label>
      <input
        id="git-default-branch"
        data-testid="git-init.defaultBranch"
        placeholder="master"
        :value="config['init.defaultBranch']"
        @change="save('init.defaultBranch', text($event))"
      />
    </template>

    <h2>Clone</h2>
    <label>Cartella predefinita</label>
    <div class="row">
      <span class="path" data-testid="pref-cloneFolder">{{ app.preferences.cloneFolder ?? 'Nessuna: si sceglie ogni volta' }}</span>
      <button type="button" data-testid="pref-cloneFolder-pick" @click="pickCloneFolder">Scegli…</button>
      <button v-if="app.preferences.cloneFolder" type="button" @click="app.updatePreferences({ cloneFolder: null })">Togli</button>
    </div>
  </form>
</template>

<style scoped>
.hint.full { grid-column: 1 / -1; margin: -2px 0 2px; }
.path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
input:not([type]), input[type='email'] { width: min(100%, 420px); }
</style>
```

In `SettingsView.vue`, importa `GitSettings` e aggiungi in fondo a `SECTIONS`:

```ts
  { id: 'git', title: 'Git', component: GitSettings },
```

- [ ] **Step 6: E2E della sezione Git**

In `test/e2e/settings.spec.ts`, aggiungi gli import `mkdtempSync`, `readFileSync`, `writeFileSync` (`node:fs`), `tmpdir` (`node:os`), `join` (`node:path`) e `tempUserData` da `./launch`:

```ts
test('sezione Git: nome ed email finiscono nella config globale (temporanea)', async () => {
  const global = join(mkdtempSync(join(tmpdir(), 'merlino-gc-')), 'gitconfig')
  writeFileSync(global, '')
  const { app, page } = await launch([], tempUserData(), { GIT_CONFIG_GLOBAL: global })
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-git').click()
  await page.getByTestId('git-user.name').fill('Ada Lovelace')
  await page.getByTestId('git-user.name').press('Tab')
  await page.getByTestId('git-user.email').fill('ada@example.com')
  await page.getByTestId('git-user.email').press('Tab')
  await expect.poll(() => readFileSync(global, 'utf8')).toContain('name = Ada Lovelace')
  await expect.poll(() => readFileSync(global, 'utf8')).toContain('email = ada@example.com')
  await app.close()
})
```

- [ ] **Step 7: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: sezione Git delle Impostazioni (eseguibile, identità, firma, pull, branch iniziale, cartella dei clone)"
```

---

### Task 5: Integrazioni: editor esterno e terminale

**Files:**
- Create: `src/main/open-app.ts`
- Create: `src/renderer/components/settings/IntegrationSettings.vue`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`
- Modify: `src/main/ipc-handlers.ts`, `src/main/menu.ts`
- Modify: `src/renderer/actions/builtin.ts`, `src/renderer/components/SettingsView.vue`
- Test: `test/unit/open-app.test.ts`

**Interfaces:**
- Consumes: `attempt`, `withSession`, `settings` (main); `app.updatePreferences` (Task 1).
- Produces:
  - `interface Launch { command: string; args: string[]; cwd?: string; wait: boolean }`;
  - `editorLaunch(platform, app, file): Launch`;
  - `terminalLaunch(platform, app, root): Launch`;
  - `startApp(l: Launch): Promise<void>`;
  - nell'API: `pickApp()`, `openInTerminal(root)`;
  - l'azione `repo.openTerminal`.

- [ ] **Step 1: Test unit dei comandi per piattaforma**

Crea `test/unit/open-app.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { editorLaunch, terminalLaunch } from '../../src/main/open-app'

describe('app esterne', () => {
  it('editor: open -a su macOS (aspettando l\'esito), eseguibile diretto altrove', () => {
    expect(editorLaunch('darwin', '/Applications/Visual Studio Code.app', '/r/a.txt')).toEqual({
      command: 'open',
      args: ['-a', '/Applications/Visual Studio Code.app', '/r/a.txt'],
      wait: true,
    })
    expect(editorLaunch('win32', 'C:\\Code\\Code.exe', 'C:\\r\\a.txt')).toEqual({ command: 'C:\\Code\\Code.exe', args: ['C:\\r\\a.txt'], wait: false })
  })

  it('terminale: Terminal su macOS, cmd su Windows, x-terminal-emulator su Linux, oppure quello scelto', () => {
    expect(terminalLaunch('darwin', null, '/r')).toEqual({ command: 'open', args: ['-a', 'Terminal', '/r'], wait: true })
    expect(terminalLaunch('darwin', '/Applications/iTerm.app', '/r').args).toEqual(['-a', '/Applications/iTerm.app', '/r'])
    expect(terminalLaunch('win32', null, 'C:\\r')).toEqual({ command: 'cmd.exe', args: ['/c', 'start', 'cmd.exe'], cwd: 'C:\\r', wait: false })
    expect(terminalLaunch('linux', null, '/r')).toEqual({ command: 'x-terminal-emulator', args: [], cwd: '/r', wait: false })
    expect(terminalLaunch('linux', '/usr/bin/kitty', '/r').command).toBe('/usr/bin/kitty')
  })
})
```

Run: `npx vitest run test/unit/open-app.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/main/open-app.ts`**

```ts
import { spawn } from 'node:child_process'

/** Un'app esterna da avviare; wait: aspetta l'uscita (open su macOS esce subito, con l'esito). */
export interface Launch {
  command: string
  args: string[]
  cwd?: string
  wait: boolean
}

export function editorLaunch(platform: NodeJS.Platform, app: string, file: string): Launch {
  return platform === 'darwin' ? { command: 'open', args: ['-a', app, file], wait: true } : { command: app, args: [file], wait: false }
}

export function terminalLaunch(platform: NodeJS.Platform, app: string | null, root: string): Launch {
  if (platform === 'darwin') return { command: 'open', args: ['-a', app ?? 'Terminal', root], wait: true }
  if (platform === 'win32') {
    return app ? { command: app, args: [], cwd: root, wait: false } : { command: 'cmd.exe', args: ['/c', 'start', 'cmd.exe'], cwd: root, wait: false }
  }
  return { command: app ?? 'x-terminal-emulator', args: [], cwd: root, wait: false }
}

/** Avvia senza shell; rifiuta se il processo non parte (o, con wait, se esce con errore). */
export function startApp(l: Launch): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(l.command, l.args, { cwd: l.cwd, detached: !l.wait, stdio: 'ignore' })
    child.once('error', reject)
    if (l.wait) {
      child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Impossibile aprire con ${l.args[1] ?? l.command} (exit ${code})`))))
    } else {
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    }
  })
}
```

Run: `npx vitest run test/unit/open-app.test.ts`
Expected: PASS.

- [ ] **Step 3: IPC**

In `src/shared/ipc.ts`:
- in `Channels` aggiungi `pickApp: 'app:pick-app'` e `openInTerminal: 'repo:open-in-terminal'`;
- nell'`Api`:

```ts
  /** Dialog di scelta di un'applicazione (.app su macOS, .exe su Windows); null se annullato. */
  pickApp(): Promise<string | null>
  /** Apre il terminale scelto nelle Impostazioni (o quello predefinito) nella cartella del repo. */
  openInTerminal(root: string): Promise<Result<void>>
```

In `src/preload/index.ts`:

```ts
  pickApp: () => ipcRenderer.invoke(Channels.pickApp),
  openInTerminal: (root) => ipcRenderer.invoke(Channels.openInTerminal, root),
```

In `src/main/ipc-handlers.ts`:
- importa `editorLaunch`, `startApp` e `terminalLaunch` da `./open-app`;
- sostituisci l'handler di `openInEditor`:

```ts
  ipcMain.handle(Channels.openInEditor, (_e, root: unknown, path: unknown) =>
    withSession(root, async (s) => {
      const file = join(s.root, relPath(path))
      const editor = settings.get().preferences.editorApp
      if (editor) return startApp(editorLaunch(process.platform, editor, file))
      const error = await shell.openPath(file)
      if (error) throw new Error(error)
    }),
  )
```

- aggiungi:

```ts
  ipcMain.handle(Channels.openInTerminal, (_e, root: unknown) =>
    withSession(root, (s) => startApp(terminalLaunch(process.platform, settings.get().preferences.terminalApp, s.root))),
  )
  ipcMain.handle(Channels.pickApp, async () => {
    const options: Electron.OpenDialogOptions =
      process.platform === 'darwin'
        ? { defaultPath: '/Applications', properties: ['openFile'], filters: [{ name: 'Applicazioni', extensions: ['app'] }] }
        : process.platform === 'win32'
          ? { properties: ['openFile'], filters: [{ name: 'Programmi', extensions: ['exe'] }] }
          : { properties: ['openFile'] }
    const w = win()
    const r = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
```

- [ ] **Step 4: Azione "Apri nel terminale" e voce di menu**

In `src/renderer/actions/builtin.ts`, dentro `registry.register(…)`:

```ts
    {
      id: 'repo.openTerminal',
      title: 'Apri nel terminale',
      when: hasRepo,
      run: async () => {
        if (!app.active) return
        const r = await window.api.openInTerminal(app.active)
        if (!r.ok) app.error = r.error.message
      },
    },
```

In `src/main/menu.ts`, nel menu File, dopo `action('Clona repository…', 'repo.clone')`:

```ts
        action('Apri nel terminale', 'repo.openTerminal'),
```

- [ ] **Step 5: `IntegrationSettings.vue`**

```vue
<script setup lang="ts">
import { useAppStore } from '../../stores/app'

type AppField = 'editorApp' | 'terminalApp'
const app = useAppStore()
const ROWS: { field: AppField; label: string; fallback: string; hint: string }[] = [
  { field: 'editorApp', label: 'Editor', fallback: 'App predefinita del sistema', hint: 'Lo usa "Apri" sui file in conflitto.' },
  { field: 'terminalApp', label: 'Terminale', fallback: 'Terminale predefinito', hint: 'Lo usa "Apri nel terminale" (palette o menu File).' },
]
const appName = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.(app|exe)$/i, '') ?? path

async function pick(field: AppField) {
  const path = await window.api.pickApp()
  if (path) await app.updatePreferences({ [field]: path })
}
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <template v-for="row in ROWS" :key="row.field">
      <label>{{ row.label }}</label>
      <div class="row">
        <span :title="app.preferences[row.field] ?? ''" :data-testid="`pref-${row.field}`">
          {{ app.preferences[row.field] ? appName(app.preferences[row.field] as string) : row.fallback }}
        </span>
        <button type="button" :data-testid="`pref-${row.field}-pick`" @click="pick(row.field)">Scegli…</button>
        <button v-if="app.preferences[row.field]" type="button" @click="app.updatePreferences({ [row.field]: null })">Predefinito</button>
      </div>
      <p class="hint">{{ row.hint }}</p>
    </template>
  </form>
</template>
```

In `SettingsView.vue`, importa `IntegrationSettings` e aggiungi a `SECTIONS` dopo Diff:

```ts
  { id: 'integrations', title: 'Integrazioni', component: IntegrationSettings },
```

- [ ] **Step 6: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: editor esterno e terminale configurabili, con l'azione Apri nel terminale"
```

---

### Task 6: Commit template: funzioni pure, validazione, `commit.template` di git, IPC

**Files:**
- Create: `src/shared/commit-template.ts`, `src/main/git/commit-template.ts`
- Modify: `src/main/validate.ts`, `src/main/ipc-handlers.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`
- Test: `test/unit/commit-template.test.ts`, `test/unit/validate.test.ts`, `test/integration/commit-template.test.ts`

**Interfaces:**
- Produces:
  - `stripComments(text): string`;
  - `splitMessage(text): { subject: string; body: string }`;
  - `ticketFromBranch(branch: string | null): string`;
  - `expandTemplate(t: { subject: string; body: string }, branch: string | null): { subject: string; body: string }`;
  - `GIT_TEMPLATE_ID = 'git'`;
  - `readGitCommitTemplate(runner): Promise<{ path: string; text: string } | null>`;
  - `commitTemplates(value): CommitTemplate[]` in `validate.ts`;
  - nell'API: `saveCommitTemplates(templates)`, `setDefaultTemplate(root, id | null)`, `gitCommitTemplate(root)`.

- [ ] **Step 1: Test unit delle funzioni pure e della validazione**

Crea `test/unit/commit-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expandTemplate, splitMessage, stripComments, ticketFromBranch } from '../../src/shared/commit-template'

describe('commit template', () => {
  it('toglie le righe di commento', () => {
    expect(stripComments('# guida\nfix: \n#altro\ncorpo')).toBe('fix: \ncorpo')
  })

  it('oggetto e corpo da un file commit.template', () => {
    expect(splitMessage('# Scrivi un oggetto\nfix: \n\n# Perché?\nDettagli\n')).toEqual({ subject: 'fix: ', body: 'Dettagli' })
    expect(splitMessage('# solo commenti\n')).toEqual({ subject: '', body: '' })
    expect(splitMessage('a\r\n\r\nb\r\n')).toEqual({ subject: 'a', body: 'b' })
  })

  it('{ticket}: ultimo pezzo dopo "/" fino al primo "-"; vuoto senza "/" o con HEAD staccato', () => {
    expect(ticketFromBranch('feature/7hq2xk4mp-login')).toBe('7hq2xk4mp')
    expect(ticketFromBranch('team/feature/7hq2xk4mp')).toBe('7hq2xk4mp')
    expect(ticketFromBranch('main')).toBe('')
    expect(ticketFromBranch(null)).toBe('')
  })

  it('sostituisce le variabili e toglie i commenti; lo spazio finale dell\'oggetto resta', () => {
    const t = { subject: '[{ticket}] feat: ', body: 'Perché:\n# da togliere\nBranch {branch}' }
    expect(expandTemplate(t, 'feature/7hq2xk4mp-login')).toEqual({ subject: '[7hq2xk4mp] feat: ', body: 'Perché:\nBranch feature/7hq2xk4mp-login' })
    expect(expandTemplate(t, null)).toEqual({ subject: '[] feat: ', body: 'Perché:\nBranch' })
  })
})
```

In `test/unit/validate.test.ts`, importa `commitTemplates`:

```ts
describe('template di commit', () => {
  const t = { id: 'a1', name: ' Feature ', subject: 'feat: ', body: '' }
  it('nome con trim, campi in più scartati, elenco vuoto ammesso', () => {
    expect(commitTemplates([{ ...t, extra: 1 }])).toEqual([{ id: 'a1', name: 'Feature', subject: 'feat: ', body: '' }])
    expect(commitTemplates([])).toEqual([])
  })
  it('rifiuta id non validi o doppi, nomi vuoti, testi troppo lunghi, troppi template', () => {
    for (const bad of [
      [{ ...t, id: 'a b' }],
      [t, t],
      [{ ...t, name: '  ' }],
      [{ ...t, subject: 'x'.repeat(501) }],
      Array.from({ length: 201 }, (_, i) => ({ ...t, id: `t${i}` })),
      'nope',
    ]) expect(() => commitTemplates(bad)).toThrow()
  })
})
```

Run: `npx vitest run test/unit/commit-template.test.ts test/unit/validate.test.ts`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 2: `src/shared/commit-template.ts`**

```ts
/** Id del template che viene dal commit.template di git (non sta nella libreria). */
export const GIT_TEMPLATE_ID = 'git'

/** Toglie le righe di commento (#), come fa git quando il messaggio passa dall'editor. */
export function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
}

/** Oggetto (prima riga non vuota, così com'è) e corpo (con trim) di un messaggio, senza commenti. */
export function splitMessage(text: string): { subject: string; body: string } {
  const lines = stripComments(text.replace(/\r\n/g, '\n')).split('\n')
  const first = lines.findIndex((l) => l.trim() !== '')
  if (first === -1) return { subject: '', body: '' }
  return { subject: lines[first] ?? '', body: lines.slice(first + 1).join('\n').trim() }
}

/** feature/7hq2xk4mp-login → 7hq2xk4mp; vuoto se il branch non contiene "/" (main, develop) o se HEAD è staccato. */
export function ticketFromBranch(branch: string | null): string {
  if (!branch?.includes('/')) return ''
  return (branch.split('/').pop() ?? '').split('-')[0] ?? ''
}

/** Il template pronto per il composer: {branch} e {ticket} sostituiti, commenti tolti. */
export function expandTemplate(t: { subject: string; body: string }, branch: string | null): { subject: string; body: string } {
  const fill = (s: string) => stripComments(s).replaceAll('{branch}', branch ?? '').replaceAll('{ticket}', ticketFromBranch(branch))
  return { subject: fill(t.subject).replace(/\n/g, ' ').trimStart(), body: fill(t.body).trim() }
}
```

In `src/main/validate.ts`, importa il tipo `CommitTemplate`:

```ts
/** La libreria dei template: id unici, nomi con trim, testi entro i limiti. */
export function commitTemplates(value: unknown): CommitTemplate[] {
  if (!Array.isArray(value) || value.length > 200) throw new TypeError('elenco dei template non valido')
  const ids = new Set<string>()
  return value.map((raw) => {
    const t = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const id = str(t.id, 'id')
    if (!/^[\w-]{1,64}$/.test(id) || ids.has(id)) throw new TypeError(`id del template non valido: ${id}`)
    ids.add(id)
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    if (!name || name.length > 100) throw new TypeError('Il nome di un template deve avere da 1 a 100 caratteri')
    const subject = text(t.subject, 'oggetto')
    const body = text(t.body, 'descrizione')
    if (subject.length > 500 || body.length > 20_000) throw new TypeError(`Il template "${name}" è troppo lungo`)
    return { id, name, subject, body }
  })
}
```

Run: `npx vitest run test/unit/commit-template.test.ts test/unit/validate.test.ts`
Expected: PASS.

- [ ] **Step 3: Test di integrazione di `readGitCommitTemplate`**

Crea `test/integration/commit-template.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readGitCommitTemplate } from '../../src/main/git/commit-template'
import { GitRunner } from '../../src/main/git/runner'
import { git, makeRepo } from '../helpers/repo'

afterEach(() => {
  process.env.GIT_CONFIG_GLOBAL = devNull
})

describe('commit.template di git', () => {
  it('quello del repo vince sul globale; percorso relativo dalla radice; file mancante → null', async () => {
    const repo = makeRepo(1)
    const runner = new GitRunner(() => 'git', repo)
    expect(await readGitCommitTemplate(runner)).toBeNull()

    const dir = mkdtempSync(join(tmpdir(), 'merlino-tpl-'))
    const globalTemplate = join(dir, 'globale.txt')
    writeFileSync(globalTemplate, 'globale\n')
    writeFileSync(join(dir, 'gitconfig'), `[commit]\n\ttemplate = ${globalTemplate}\n`)
    process.env.GIT_CONFIG_GLOBAL = join(dir, 'gitconfig')
    expect(await readGitCommitTemplate(runner)).toEqual({ path: globalTemplate, text: 'globale\n' })

    writeFileSync(join(repo, '.gitmessage'), '# istruzioni\n[{ticket}] \n')
    git(repo, 'config', 'commit.template', '.gitmessage')
    expect(await readGitCommitTemplate(runner)).toEqual({ path: join(repo, '.gitmessage'), text: '# istruzioni\n[{ticket}] \n' })

    git(repo, 'config', 'commit.template', 'manca.txt')
    expect(await readGitCommitTemplate(runner)).toBeNull()
  })
})
```

Run: `npx vitest run test/integration/commit-template.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 4: `src/main/git/commit-template.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { GitRunner } from './runner'

/** Il commit.template di git (quello del repo vince sul globale); null se non c'è o se il file non si legge. */
export async function readGitCommitTemplate(runner: GitRunner): Promise<{ path: string; text: string } | null> {
  // exit 1: commit.template non impostato
  const out = await runner.run(['config', '--path', '--get', 'commit.template'], { okCodes: [0, 1] })
  const value = out.stdout.trim()
  if (!value) return null
  // Un percorso relativo si intende dalla radice del repo (il runner di una sessione lavora lì)
  const path = isAbsolute(value) ? value : join(runner.cwd, value)
  try {
    return { path, text: await readFile(path, 'utf8') }
  } catch {
    return null
  }
}
```

Run: `npx vitest run test/integration/commit-template.test.ts`
Expected: PASS.

- [ ] **Step 5: IPC**

In `src/shared/ipc.ts`:
- importa `CommitTemplate`;
- in `Channels` aggiungi `saveCommitTemplates: 'settings:save-templates'`, `setDefaultTemplate: 'settings:set-default-template'` e `gitCommitTemplate: 'repo:git-commit-template'`;
- nell'`Api`:

```ts
  /** Salva la libreria dei template (validata nel main); i predefiniti dei template eliminati se ne vanno. */
  saveCommitTemplates(templates: CommitTemplate[]): Promise<Result<AppSettings>>
  /** Template predefinito di un repo; null lo toglie. */
  setDefaultTemplate(root: string, id: string | null): Promise<Result<AppSettings>>
  /** Il commit.template di git del repo (o globale); null se non c'è. */
  gitCommitTemplate(root: string): Promise<Result<{ path: string; text: string } | null>>
```

In `src/preload/index.ts`:

```ts
  saveCommitTemplates: (templates) => ipcRenderer.invoke(Channels.saveCommitTemplates, templates),
  setDefaultTemplate: (root, id) => ipcRenderer.invoke(Channels.setDefaultTemplate, root, id),
  gitCommitTemplate: (root) => ipcRenderer.invoke(Channels.gitCommitTemplate, root),
```

In `src/main/ipc-handlers.ts`, importa `readGitCommitTemplate` e `commitTemplates as validateTemplates`:

```ts
  ipcMain.handle(Channels.saveCommitTemplates, (_e, value: unknown) =>
    attempt(() => {
      const commitTemplates = validateTemplates(value)
      const ids = new Set(commitTemplates.map((t) => t.id))
      // I predefiniti dei template eliminati se ne vanno con loro
      const defaultTemplates = Object.fromEntries(Object.entries(settings.get().defaultTemplates).filter(([, id]) => ids.has(id)))
      return settings.update({ commitTemplates, defaultTemplates })
    }),
  )
  ipcMain.handle(Channels.setDefaultTemplate, (_e, root: unknown, id: unknown) =>
    attempt(() => {
      const repo = str(root, 'root')
      const { commitTemplates, defaultTemplates } = settings.get()
      if (id === null) {
        delete defaultTemplates[repo]
      } else {
        const t = str(id, 'id')
        if (!commitTemplates.some((x) => x.id === t)) throw new TypeError('Template non trovato')
        defaultTemplates[repo] = t
      }
      return settings.update({ defaultTemplates })
    }),
  )
  ipcMain.handle(Channels.gitCommitTemplate, (_e, root: unknown) => withSession(root, (s) => readGitCommitTemplate(s.runner)))
```

- [ ] **Step 6: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: dati dei commit template (variabili, commenti, commit.template di git, libreria validata)"
```

---

### Task 7: Commit template nel composer e sezione Commit delle Impostazioni

**Files:**
- Create: `src/renderer/components/TemplatePicker.vue`
- Create: `src/renderer/components/settings/CommitSettings.vue`
- Modify: `src/renderer/stores/app.ts` (template della libreria), `src/renderer/stores/repo.ts` (applicazione e precompilazione)
- Modify: `src/renderer/components/WorkingView.vue`, `src/renderer/components/SettingsView.vue`
- Modify: `src/renderer/actions/working.ts`
- Test: `test/e2e/templates.spec.ts`

**Interfaces:**
- Consumes:
  - `expandTemplate`, `splitMessage`, `GIT_TEMPLATE_ID` (Task 6);
  - `saveCommitTemplates`, `setDefaultTemplate` e `gitCommitTemplate` dell'API (Task 6);
  - `PrefNumber` e `preferences` (Task 1).
- Produces:
  - nello store dell'app: `saveTemplates(list)` (salvataggio dopo 400 ms di pausa), `flushTemplates(): Promise<void>`, `setDefaultTemplate(root, id | null)`;
  - nello store del repo: `gitTemplate`, `defaultTemplate`, `templatePicker: 'button' | 'slash' | null`, `applyTemplate(t)`, `prefillTemplate()`;
  - `TemplatePicker` con le props `root` e `filter?` e gli eventi `choose(template)` e `close`, che espone `onKey(e)`.

- [ ] **Step 1: Test E2E**

Crea `test/e2e/templates.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('template creato nelle Impostazioni, applicato con "/" e {ticket}; da predefinito precompila dopo il commit', async () => {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'feature/7hq2xk4mp-login')
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(1)

  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-commit').click()
  await page.getByTestId('template-add').click()
  await page.getByTestId('template-name').fill('Feature')
  await page.getByTestId('template-subject').fill('[{ticket}] feat: ')
  await page.getByTestId('template-body').fill('Perché:\n# da togliere\nBranch {branch}')
  await page.getByTestId('settings-close').click()

  await page.getByTestId('working-row').click()
  await page.getByTestId('commit-subject').fill('/fea')
  await expect(page.getByTestId('template-item')).toHaveText(['Feature'])
  await page.getByTestId('commit-subject').press('Enter')
  await expect(page.getByTestId('commit-subject')).toHaveValue('[7hq2xk4mp] feat: ')
  await expect(page.getByTestId('commit-body')).toHaveValue('Perché:\nBranch feature/7hq2xk4mp-login')

  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-commit').click()
  await page.getByTestId('template-default').check()
  await page.getByTestId('settings-close').click()
  await page.getByTestId('commit-subject').fill('[7hq2xk4mp] feat: login')
  await page.getByTestId('commit-body').fill('')
  await page.getByTestId('section-unstaged').getByTestId('stage-file').click()
  await page.getByTestId('commit-button').click()
  await expect(page.getByTestId('commit-row').first()).toContainText('[7hq2xk4mp] feat: login')
  await expect(page.getByTestId('commit-subject')).toHaveValue('[7hq2xk4mp] feat: ')
  await app.close()
})

test('commit.template di git: precompila senza le righe # e compare nel selettore', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, '.gitmessage'), '# Scrivi un oggetto breve\nfix: \n\n# Perché?\nDettagli\n')
  git(repo, 'config', 'commit.template', '.gitmessage')
  writeFileSync(join(repo, 'file1.txt'), 'x\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await expect(page.getByTestId('commit-subject')).toHaveValue('fix: ')
  await expect(page.getByTestId('commit-body')).toHaveValue('Dettagli')

  await page.getByTestId('commit-subject').fill('')
  await page.getByTestId('commit-body').fill('')
  await page.getByTestId('template-toggle').click()
  await expect(page.getByTestId('template-item')).toHaveText([/commit\.template \(git\)/])
  await page.getByTestId('template-item').click()
  await expect(page.getByTestId('commit-subject')).toHaveValue('fix: ')
  await app.close()
})
```

Run: `npx electron-vite build && npx playwright test test/e2e/templates.spec.ts`
Expected: FAIL, perché la sezione Commit e il selettore non esistono.

- [ ] **Step 2: Template della libreria nello store dell'app**

In `src/renderer/stores/app.ts`, importa `CommitTemplate` e aggiungi dopo `updatePreferences`:

```ts
  // La libreria si aggiorna subito in locale (si scrive senza attese) e si salva dopo 400 ms di pausa
  let templatesTimer: ReturnType<typeof setTimeout> | undefined
  let pendingTemplates: CommitTemplate[] | null = null

  function saveTemplates(list: CommitTemplate[]) {
    if (!settings.value) return
    settings.value = { ...settings.value, commitTemplates: list }
    pendingTemplates = list
    clearTimeout(templatesTimer)
    templatesTimer = setTimeout(() => void flushTemplates(), 400)
  }

  async function flushTemplates() {
    clearTimeout(templatesTimer)
    const list = pendingTemplates
    pendingTemplates = null
    if (!list) return
    const r = await window.api.saveCommitTemplates(list)
    // Dal main serve solo defaultTemplates: i template locali possono essere già più nuovi
    if (r.ok && settings.value) settings.value = { ...settings.value, defaultTemplates: r.value.defaultTemplates }
    else if (!r.ok) error.value = r.error.message
  }

  async function setDefaultTemplate(root: string, id: string | null) {
    await flushTemplates()
    const r = await window.api.setDefaultTemplate(root, id)
    if (r.ok && settings.value) settings.value = { ...settings.value, defaultTemplates: r.value.defaultTemplates }
    else if (!r.ok) error.value = r.error.message
  }
```

e aggiungi `saveTemplates, flushTemplates, setDefaultTemplate` al `return`.

- [ ] **Step 3: Applicazione e precompilazione nello store del repo**

In `src/renderer/stores/repo.ts`:
- importa `expandTemplate`, `GIT_TEMPLATE_ID` e `splitMessage` da `../../shared/commit-template`, e il tipo `CommitTemplate`;
- dopo `const amend = ref(false)`:

```ts
    // Template di commit
    const gitTemplate = shallowRef<CommitTemplate | null>(null)
    const templatePicker = ref<'button' | 'slash' | null>(null)
    /** Messaggio inserito dalla precompilazione: finché resta identico, Amend lo sostituisce. */
    let prefilled: string | null = null
    const message = () => (body.value.trim() ? `${subject.value}\n\n${body.value}` : subject.value)

    /** Il predefinito del repo: quello scelto nelle Impostazioni, altrimenti il commit.template di git. */
    const defaultTemplate = computed(() => {
      const s = useAppStore().settings
      const id = s?.defaultTemplates[root]
      return s?.commitTemplates.find((t) => t.id === id) ?? gitTemplate.value
    })

    async function loadGitTemplate() {
      const r = await window.api.gitCommitTemplate(root)
      gitTemplate.value = r.ok && r.value ? { id: GIT_TEMPLATE_ID, name: 'commit.template (git)', ...splitMessage(r.value.text) } : null
    }

    function applyTemplate(t: CommitTemplate) {
      const filled = expandTemplate(t, info.value?.branch ?? null)
      subject.value = filled.subject
      body.value = filled.body
      prefilled = null
    }

    function prefillTemplate() {
      const t = defaultTemplate.value
      if (!t || amend.value || subject.value.trim() || body.value.trim()) return
      applyTemplate(t)
      prefilled = message()
    }
```

- in `refresh`, aggiungi `loadGitTemplate()` al `Promise.all`;
- in `selectWorking`:

```ts
    async function selectWorking() {
      view.value = 'working'
      if (!working.value && status.value) working.value = firstWorking(status.value)
      await loadGitTemplate()
      prefillTemplate()
      await loadWorkingDiff()
    }
```

- in `setAmend`:

```ts
    async function setAmend(value: boolean) {
      amend.value = value
      // Il template precompilato e non toccato si sostituisce come un composer vuoto
      const untouched = prefilled !== null && message() === prefilled
      if (!value || (subject.value.trim() && !untouched)) return
      const r = await window.api.lastCommitMessage(root)
      if (!r.ok) return
      const [first = '', ...rest] = r.value.split('\n')
      subject.value = first
      body.value = rest.join('\n').trim()
      prefilled = null
    }
```

- in `commitChanges`, dopo `amend.value = false`:

```ts
        prefilled = null
        prefillTemplate()
```

- aggiungi `gitTemplate, defaultTemplate, templatePicker, applyTemplate, prefillTemplate` al `return`.

- [ ] **Step 4: `TemplatePicker.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { CommitTemplate } from '../../shared/types'
import { fuzzy } from '../actions/registry'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'

// filter assente: il selettore ha il suo campo di ricerca; altrimenti cerca con il testo dopo la "/" dell'oggetto
const props = defineProps<{ root: string; filter?: string }>()
const emit = defineEmits<{ choose: [template: CommitTemplate]; close: [] }>()
const app = useAppStore()
const repo = useRepoStore(props.root)
const search = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)

const items = computed(() => {
  const all = [...(app.settings?.commitTemplates ?? []), ...(repo.gitTemplate ? [repo.gitTemplate] : [])]
  return all.filter((t) => fuzzy(props.filter ?? search.value, t.name))
})
watch(
  () => props.filter ?? search.value,
  () => {
    index.value = 0
  },
)
onMounted(() => input.value?.focus())

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') index.value = Math.min(index.value + 1, items.value.length - 1)
  else if (e.key === 'ArrowUp') index.value = Math.max(index.value - 1, 0)
  else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
    const t = items.value[index.value]
    if (t) emit('choose', t)
  } else if (e.key === 'Escape') emit('close')
  else return
  e.preventDefault()
  e.stopPropagation()
}
defineExpose({ onKey })

function manage() {
  emit('close')
  app.settingsSection = 'commit'
}
</script>

<template>
  <div class="picker" data-testid="template-picker">
    <input
      v-if="filter === undefined"
      ref="input"
      v-model="search"
      data-testid="template-search"
      placeholder="Cerca un template…"
      @keydown="onKey"
      @blur="emit('close')"
    />
    <ul>
      <li
        v-for="(t, i) in items"
        :key="t.id"
        :class="{ active: i === index }"
        data-testid="template-item"
        @mousedown.prevent="emit('choose', t)"
        @mousemove="index = i"
      >
        <span class="name">{{ t.name }}</span>
        <span v-if="t.id === repo.defaultTemplate?.id" class="muted">predefinito</span>
      </li>
      <li v-if="!items.length" class="muted">Nessun template</li>
    </ul>
    <button type="button" class="manage" data-testid="template-manage" @mousedown.prevent="manage">Gestisci template…</button>
  </div>
</template>

<style scoped>
.picker { position: absolute; top: calc(100% + 4px); left: 0; right: 32px; z-index: 5; overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.2); }
input { width: 100%; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; }
input:focus { outline: none; }
ul { max-height: 240px; margin: 0; padding: 4px; overflow: auto; list-style: none; }
li { display: flex; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 4px; cursor: default; }
li.active { background: var(--selected-bg); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.manage { width: 100%; border: 0; border-top: 1px solid var(--border); border-radius: 0; text-align: left; }
</style>
```

- [ ] **Step 5: Composer (`WorkingView.vue`)**

In `src/renderer/components/WorkingView.vue`:
- importa `nextTick` e `watch` da `vue`, il tipo `CommitTemplate`, `useAppStore` e `TemplatePicker`;
- nello script aggiungi:

```ts
const app = useAppStore()
const subjectInput = ref<HTMLInputElement | null>(null)
const picker = ref<InstanceType<typeof TemplatePicker> | null>(null)
// Scrivendo "/" in un oggetto vuoto si apre il selettore; il testo dopo la "/" fa da ricerca
watch(
  () => repo.subject,
  (s, old) => {
    if (repo.templatePicker === null && !old && s.startsWith('/')) repo.templatePicker = 'slash'
    else if (repo.templatePicker === 'slash' && !s.startsWith('/')) repo.templatePicker = null
  },
)

function onSubjectKey(e: KeyboardEvent) {
  if (repo.templatePicker === 'slash') picker.value?.onKey(e)
}

async function chooseTemplate(t: CommitTemplate) {
  const slash = repo.templatePicker === 'slash'
  repo.templatePicker = null
  const typed = repo.body.trim() !== '' || (!slash && repo.subject.trim() !== '')
  if (typed && !window.confirm(`Sostituire il messaggio con il template «${t.name}»?`)) return
  repo.applyTemplate(t)
  await nextTick()
  const el = subjectInput.value
  el?.focus()
  el?.setSelectionRange(el.value.length, el.value.length)
}
```

- sostituisci il calcolo di `subjectLength` con le preferenze:

```ts
const subjectLength = computed(() => {
  const n = repo.subject.length
  return n > app.preferences.subjectLimit ? 'over' : n > app.preferences.subjectWarn ? 'long' : ''
})
```

- nel template, il blocco `.subject` diventa:

```html
      <div class="subject">
        <input
          ref="subjectInput"
          v-model="repo.subject"
          data-testid="commit-subject"
          placeholder="Oggetto del commit (/ per i template)"
          @keydown="onSubjectKey"
          @blur="repo.templatePicker === 'slash' && (repo.templatePicker = null)"
        />
        <span class="count" :class="subjectLength">{{ repo.subject.length }}</span>
        <TemplatePicker
          v-if="repo.templatePicker"
          ref="picker"
          :root="root"
          :filter="repo.templatePicker === 'slash' ? repo.subject.slice(1) : undefined"
          @choose="chooseTemplate"
          @close="repo.templatePicker = null"
        />
      </div>
```

- la `textarea` della descrizione prende la guida:

```html
      <textarea
        v-model="repo.body"
        data-testid="commit-body"
        rows="3"
        placeholder="Descrizione (facoltativa)"
        :class="{ guided: app.preferences.bodyGuide > 0 }"
        :style="{ '--guide': `calc(8px + ${app.preferences.bodyGuide}ch)` }"
      />
```

- in `.commit-actions`, dopo il pulsante Stash…:

```html
        <!-- mousedown.prevent: il campo di ricerca aperto non perde il fuoco, così il clic chiude invece di riaprire -->
        <button
          data-testid="template-toggle"
          @mousedown.prevent
          @click="repo.templatePicker = repo.templatePicker === 'button' ? null : 'button'"
        >Template</button>
```

- nello stile:

```css
.subject { position: relative; }
/* Guida verticale a N colonne nella descrizione (solo visiva) */
textarea.guided { background-image: linear-gradient(to right, transparent calc(var(--guide) - 1px), var(--border) calc(var(--guide) - 1px), var(--border) var(--guide), transparent var(--guide)); background-repeat: no-repeat; }
```

- [ ] **Step 6: Azione della palette**

In `src/renderer/actions/working.ts`, dentro `registry.register(…)`:

```ts
    {
      id: 'commit.template',
      title: 'Applica un template di commit…',
      when: () => app.active !== null,
      run: async () => {
        const r = repo()
        if (!r) return
        await r.selectWorking()
        r.templatePicker = 'button'
      },
    },
```

- [ ] **Step 7: `CommitSettings.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CommitTemplate } from '../../../shared/types'
import { useAppStore } from '../../stores/app'
import { useRepoStore } from '../../stores/repo'
import PrefNumber from './PrefNumber.vue'

const app = useAppStore()
const repo = computed(() => (app.active ? useRepoStore(app.active) : null))
const templates = computed(() => app.settings?.commitTemplates ?? [])
const selectedId = ref<string | null>(templates.value[0]?.id ?? null)
const showGit = ref(false)
const selected = computed(() => (showGit.value ? null : (templates.value.find((t) => t.id === selectedId.value) ?? null)))
const isDefault = computed(() => !!app.active && !!selected.value && app.settings?.defaultTemplates[app.active] === selected.value.id)

function select(id: string) {
  selectedId.value = id
  showGit.value = false
}

function add() {
  const t: CommitTemplate = { id: crypto.randomUUID(), name: 'Nuovo template', subject: '', body: '' }
  app.saveTemplates([...templates.value, t])
  select(t.id)
}

function edit(patch: Partial<CommitTemplate>) {
  const id = selected.value?.id
  if (id) app.saveTemplates(templates.value.map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

function remove() {
  const t = selected.value
  if (!t || !window.confirm(`Eliminare il template «${t.name}»?`)) return
  const rest = templates.value.filter((x) => x.id !== t.id)
  app.saveTemplates(rest)
  selectedId.value = rest[0]?.id ?? null
}

const value = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>Guide del messaggio</h2>
    <label for="pref-subjectWarn">Avviso sull'oggetto</label>
    <div class="row"><PrefNumber id="pref-subjectWarn" field="subjectWarn" :min="20" :max="200" /> <span class="muted">caratteri (contatore giallo)</span></div>
    <label for="pref-subjectLimit">Limite dell'oggetto</label>
    <div class="row"><PrefNumber id="pref-subjectLimit" field="subjectLimit" :min="20" :max="200" /> <span class="muted">caratteri (contatore rosso)</span></div>
    <label for="pref-bodyGuide">Guida della descrizione</label>
    <div class="row"><PrefNumber id="pref-bodyGuide" field="bodyGuide" :min="0" :max="200" /> <span class="muted">colonne (0 = nessuna)</span></div>
  </form>

  <h2 class="title">Template</h2>
  <div class="templates">
    <ul>
      <li v-for="t in templates" :key="t.id" :class="{ active: !showGit && t.id === selectedId }" data-testid="template-entry" @click="select(t.id)">
        {{ t.name }}
      </li>
      <li v-if="repo?.gitTemplate" :class="{ active: showGit, git: true }" @click="showGit = true">commit.template (git)</li>
      <li class="add"><button type="button" data-testid="template-add" @click="add">+ Nuovo</button></li>
    </ul>

    <form v-if="selected" class="settings-form editor" @submit.prevent>
      <label for="template-name">Nome</label>
      <input id="template-name" data-testid="template-name" :value="selected.name" @input="edit({ name: value($event) })" />
      <label for="template-subject">Oggetto</label>
      <input id="template-subject" data-testid="template-subject" :value="selected.subject" @input="edit({ subject: value($event) })" />
      <label for="template-body">Descrizione</label>
      <textarea id="template-body" data-testid="template-body" rows="8" :value="selected.body" @input="edit({ body: value($event) })" />
      <template v-if="app.active">
        <span />
        <label class="check">
          <input
            type="checkbox"
            data-testid="template-default"
            :checked="isDefault"
            @change="app.setDefaultTemplate(app.active, checked($event) ? selected.id : null)"
          />
          Predefinito per {{ repo?.info?.name }}
        </label>
      </template>
      <span />
      <div class="row"><button type="button" data-testid="template-delete" @click="remove">Elimina</button></div>
    </form>

    <div v-else-if="showGit && repo?.gitTemplate" class="git-template">
      <p class="muted">Dal <code>commit.template</code> di git: si modifica nel file. È il predefinito se il repo non ne ha uno scelto qui.</p>
      <pre>{{ repo.gitTemplate.subject }}<template v-if="repo.gitTemplate.body">&#10;&#10;{{ repo.gitTemplate.body }}</template></pre>
    </div>
    <p v-else class="muted">Crea un template con "+ Nuovo".</p>
  </div>

  <aside class="help">
    <strong>Variabili</strong>: <code>{branch}</code> diventa il branch corrente; <code>{ticket}</code> l'ultimo pezzo del branch dopo "/" fino al primo "-"
    (<code>feature/7hq2xk4mp-login</code> → <code>7hq2xk4mp</code>), vuoto se il branch non contiene "/".
    Le righe che iniziano con <code>#</code> si tolgono quando applichi il template. Nel commit si sceglie con il pulsante Template o scrivendo <code>/</code> nell'oggetto.
  </aside>
</template>

<style scoped>
.title { margin: 24px 0 8px; font-size: 13px; }
.templates { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; max-width: 900px; }
ul { margin: 0; padding: 4px; list-style: none; border: 1px solid var(--border); border-radius: 6px; align-self: start; }
li { padding: 5px 8px; border-radius: 4px; cursor: default; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li:hover { background: var(--bg-hover); }
li.active { background: var(--selected-bg); font-weight: 600; }
li.git { font-style: italic; }
li.add:hover { background: transparent; }
li.add button { width: 100%; }
.editor input:not([type]) { width: 100%; }
textarea { width: 100%; font: 12px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; resize: vertical; }
.git-template pre { margin: 8px 0 0; padding: 8px; background: var(--bg-alt); border-radius: 5px; white-space: pre-wrap; }
.help { max-width: 900px; margin-top: 16px; padding: 10px 12px; font-size: 12px; line-height: 1.6; background: var(--bg-alt); border-radius: 6px; }
</style>
```

In `SettingsView.vue`, importa `CommitSettings` e aggiungi a `SECTIONS` dopo Generale:

```ts
  { id: 'commit', title: 'Commit', component: CommitSettings },
```

Ordine finale di `SECTIONS`: Generale, Commit, Diff, Integrazioni, Git.

- [ ] **Step 8: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde, `templates.spec.ts` compreso.

```bash
git add src test
git commit -m "feat: commit template nel composer (pulsante, scorciatoia /, predefinito per repo) e sezione Commit delle Impostazioni"
```

---

### Task 8: Verifica

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run test:e2e`. Expected: tutto verde.
- [ ] **Step 2:** Screenshot di ogni sezione delle Impostazioni, in tema chiaro e scuro, e del selettore dei template nel composer, su una copia di `demo-backend`.
- [ ] **Step 3:** A mano su macOS, sulla copia di `demo-backend`:
  - "Apri nel terminale", con il terminale predefinito e con uno scelto;
  - editor esterno scelto: "Apri" su un file in conflitto;
  - in entrambi i casi l'app giusta si apre nella cartella o sul file giusti.
- [ ] **Step 4:** Annota l'esito in fondo a questo piano e committa.

**Note dall'esecuzione:**
- **Nomi diversi dal piano**:
  - nello store del repo esisteva già il contatore `diffRequest`, quindi la funzione per le opzioni del diff si chiama `diffOptionsFor`;
  - l'helper del messaggio si chiama `currentMessage`, perché `commitChanges` ha già una variabile `message`.
- **Bug trovato dagli E2E (Task 4)**: un salvataggio che finiva mentre si scriveva in un altro campo riscriveva quel campo con il valore salvato, perché Vue applicava di nuovo `:value`. Per questo l'email si perdeva. `PrefNumber` e i campi di testo della sezione Git ora usano una copia locale con `v-model`.
- **Test E2E corretti**:
  - nella sezione Git, prima di premere ⌘, il test aspetta la fine dell'avvio: prima la scorciatoia non è ancora registrata;
  - il test del tema ora controlla anche la pagina (`prefers-color-scheme`) dopo aver tolto l'emulazione di Playwright, che altrimenti forza il chiaro. Prima controllava solo `nativeTheme.themeSource`, e non si accorgeva se la finestra non cambiava.
- **Task 8**:
  - lint, typecheck e unit (129, più 1 saltato) verdi. E2E (23) verdi nelle ultime esecuzioni complete, con l'eccezione del blocco intermittente qui sotto;
  - screenshot di tutte le sezioni e del selettore dei template, in tema chiaro e scuro, su una copia di `demo-backend`. La config globale era temporanea, con un'identità di prova;
  - prove reali su macOS:
    - "Apri nel terminale" con Terminale e con iTerm: entrambe le shell partono nella cartella del repo (verificato con `lsof`);
    - editor TextEdit su un file: si apre;
    - un'app inesistente dà l'errore "Impossibile aprire con … (exit 1)".
- **Problema aperto**: in una suite E2E completa su tre o quattro, un test a caso aspetta 30 s la prima finestra di Electron e fallisce; il processo non scrive niente.
  - Non succede su `feature/storia-stile` (4 esecuzioni su 4 verdi), né ripetendo un solo file (15 e 15 avvii senza blocchi).
  - Non dipende dall'impostazione del tema all'avvio: provato.
  - Se dipenda da un'altra istanza di Merlino aperta non è dimostrato.
  - `launch()` ora riporta l'output del processo quando la finestra non arriva, ma resta da trovare la causa.
