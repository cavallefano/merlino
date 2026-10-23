# Merlino — Pannelli ridimensionabili, layout e popup del diff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Divisori trascinabili fra i pannelli, layout orizzontale o verticale di lista e dettaglio (una preferenza), e il diff in un popup grande e ridimensionabile.

**Architecture:**
- `src/renderer/layout.ts` tiene le misure dei pannelli (reattive, salvate nel `localStorage`), con funzioni pure testate.
- `Splitter.vue` è il divisore: legge le misure dei due elementi accanto e aggiorna un `v-model` in px o in frazione.
- `RepoView.vue` costruisce la griglia: sidebar | divisore | area principale. L'area principale è una seconda griglia, con colonne o righe secondo la preferenza `panelLayout`.
- `DiffDialog.vue` è un `<dialog>` modale con `resize: both`. Usa la stessa selezione dei pannelli, tramite gli store `repo` e `pull-requests`.

**Tech Stack:** Electron 45, Vue 3, Pinia, TypeScript, Vitest, Playwright.

Spec: `docs/superpowers/specs/2026-10-23-merlino-panels-layout-design.md`. Branch: `feature/panels-layout`, che parte da `develop`.

## Global Constraints

- **Nessuna dipendenza nuova.**
- **Memoria**:
  - le misure stanno nel `localStorage` alla chiave `merlino.layout`, valgono per tutta l'app e un valore non valido torna al predefinito;
  - il layout è la preferenza `panelLayout: 'horizontal' | 'vertical'` (predefinita `horizontal`), in `settings.json`.
- **Misure**:

| Chiave | Unità | Predefinita | Valida nel `localStorage` | Limiti al trascinamento |
|---|---|---|---|---|
| `sidebar` | px | 220 | 160–400 | 160–400, l'area principale almeno 480 |
| `list` | frazione | 0.55 | 0.05–0.95 | lista e dettaglio almeno 240 px |
| `listVertical` | frazione | 0.4 | 0.05–0.95 | lista e dettaglio almeno 120 px |
| `commitFiles`, `workingFiles`, `prFiles` | px | 140, 180, 160 | 48–4000 | almeno 48, il diff almeno 120 |
| `dialog` | `{ width, height }` px | null (85% della finestra) | almeno 480 × 300 | — |

- **Divisore**: fascia di 5 px con una linea di 1 px (`--border`, `--accent` al passaggio, durante il trascinamento e col focus). Il doppio clic riporta la misura al predefinito. È accessibile con `role="separator"`, `aria-orientation`, `aria-label`, `tabindex="0"`, e le frecce lo spostano di 16 px.
- **Testi**: in inglese e in italiano, con le stesse chiavi (lo controlla il tipo `Messages`).
- **Test e screenshot**: sempre con la finestra nascosta (`MERLINO_E2E=1`, già impostato da `test/e2e/launch.ts`). Nessuna finestra visibile, nessun focus rubato.
- **Repo**: solo nomi fittizi.
- **Commit**: email locale `cavallefano@users.noreply.github.com`; il messaggio termina con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File

| File | Cosa |
|---|---|
| `src/renderer/layout.ts` (nuovo) | `Layout`, `SIZES`, `DIALOG_MIN`, `clamp`, `readLayout`, `useLayout` |
| `test/unit/layout.test.ts` (nuovo) | test di `clamp` e `readLayout` |
| `src/shared/types.ts`, `src/shared/preferences.ts`, `src/main/validate.ts` | preferenza `panelLayout` |
| `test/unit/validate.test.ts` | validazione di `panelLayout` |
| `src/renderer/components/settings/GeneralSettings.vue` | select "Panel layout" |
| `src/renderer/actions/builtin.ts`, `src/main/menu.ts` | azione `layout.toggle` e voce nel menu View |
| `src/renderer/components/Splitter.vue` (nuovo) | il divisore |
| `src/renderer/components/RepoView.vue` | griglia dal layout, divisori, pulsante del layout, `DiffDialog` |
| `HistoryView.vue`, `PullRequestList.vue`, `RepoSidebar.vue` | tolto il bordo destro (lo disegna il divisore) |
| `CommitDetail.vue`, `WorkingView.vue`, `PullRequestDetail.vue` | divisore fra file e diff, pulsante ⤢, doppio clic sui file |
| `src/renderer/stores/repo.ts` | `diffDialog` |
| `src/renderer/components/DiffDialog.vue` (nuovo) | il popup del diff |
| `src/shared/i18n/en.ts`, `it.ts` | testi nuovi |
| `test/e2e/layout.spec.ts` (nuovo) | E2E di divisori, layout e popup |
| `README.md` | riga in "What you get" |

---

### Task 1: misure dei pannelli (`layout.ts`)

**Files:**
- Create: `src/renderer/layout.ts`
- Test: `test/unit/layout.test.ts`

**Interfaces:**
- Produces:
  - `interface Layout { sidebar; list; listVertical; commitFiles; workingFiles; prFiles: number; dialog: { width: number; height: number } | null }`;
  - `type LayoutSize = Exclude<keyof Layout, 'dialog'>`;
  - `SIZES: Record<LayoutSize, { min; max; default }>` e `DIALOG_MIN = { width: 480, height: 300 }`;
  - `clamp(value, min, max): number` (con i limiti incrociati vince `min`);
  - `readLayout(text: string | null): Layout`;
  - `useLayout(): Layout`, reattivo e condiviso, che salva a ogni modifica.

- [ ] **Step 1: test che falliscono**

`test/unit/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clamp, readLayout, SIZES } from '../../src/renderer/layout'

const defaults = { sidebar: 220, list: 0.55, listVertical: 0.4, commitFiles: 140, workingFiles: 180, prFiles: 160, dialog: null }

describe('clamp', () => {
  it('tiene il valore fra i limiti', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('con i limiti incrociati vince il minimo', () => {
    expect(clamp(50, 48, 20)).toBe(48)
  })
})

describe('readLayout', () => {
  it('senza dati, con JSON rovinato o non un oggetto dà i predefiniti', () => {
    expect(readLayout(null)).toEqual(defaults)
    expect(readLayout('{rotto')).toEqual(defaults)
    expect(readLayout('42')).toEqual(defaults)
  })

  it('tiene i valori validi e rimette i predefiniti al posto degli altri', () => {
    const saved = { sidebar: 300, list: 0.3, listVertical: 2, commitFiles: '200', workingFiles: 10, dialog: { width: 900, height: 600 } }
    expect(readLayout(JSON.stringify(saved))).toEqual({ ...defaults, sidebar: 300, list: 0.3, dialog: { width: 900, height: 600 } })
  })

  it('scarta un popup troppo piccolo o malformato', () => {
    expect(readLayout(JSON.stringify({ dialog: { width: 100, height: 600 } })).dialog).toBeNull()
    expect(readLayout(JSON.stringify({ dialog: 'grande' })).dialog).toBeNull()
  })

  it('i predefiniti stanno nei limiti', () => {
    for (const s of Object.values(SIZES)) expect(clamp(s.default, s.min, s.max)).toBe(s.default)
  })
})
```

- [ ] **Step 2: il test fallisce**

Run: `npx vitest run test/unit/layout.test.ts`
Expected: FAIL, `src/renderer/layout` non esiste.

- [ ] **Step 3: implementazione**

`src/renderer/layout.ts`:

```ts
import { reactive, watch } from 'vue'

/**
 * Misure dei pannelli: una comodità dell'interfaccia, non un'impostazione, quindi nel localStorage.
 * Il layout orizzontale o verticale invece è la preferenza panelLayout.
 */
export interface Layout {
  /** Larghezza della sidebar, px. */
  sidebar: number
  /** Frazione della lista (commit o PR) accanto al dettaglio. */
  list: number
  /** Frazione della lista sopra il dettaglio. */
  listVertical: number
  /** Altezza della lista dei file, px: dettaglio del commit, modifiche locali, dettaglio della PR. */
  commitFiles: number
  workingFiles: number
  prFiles: number
  /** Misura del popup del diff; null = l'85% della finestra. */
  dialog: { width: number; height: number } | null
}

export type LayoutSize = Exclude<keyof Layout, 'dialog'>

/** Predefiniti e valori ammessi nel localStorage; i limiti al trascinamento dipendono dalla finestra e li applica il divisore. */
export const SIZES: Record<LayoutSize, { min: number; max: number; default: number }> = {
  sidebar: { min: 160, max: 400, default: 220 },
  list: { min: 0.05, max: 0.95, default: 0.55 },
  listVertical: { min: 0.05, max: 0.95, default: 0.4 },
  commitFiles: { min: 48, max: 4000, default: 140 },
  workingFiles: { min: 48, max: 4000, default: 180 },
  prFiles: { min: 48, max: 4000, default: 160 },
}

export const DIALOG_MIN = { width: 480, height: 300 }

const KEY = 'merlino.layout'

/** value fra min e max; se i limiti si incrociano vince min, così un pannello non sparisce. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && v >= min && v <= max

/** Il layout salvato; i valori mancanti, non numerici o fuori dai limiti tornano ai predefiniti. */
export function readLayout(text: string | null): Layout {
  let saved: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(text ?? '{}')
    if (parsed && typeof parsed === 'object') saved = parsed as Record<string, unknown>
  } catch {
    // JSON rovinato: valori predefiniti
  }
  const layout = { dialog: null } as Layout
  for (const key of Object.keys(SIZES) as LayoutSize[]) {
    const { min, max, default: fallback } = SIZES[key]
    const v = saved[key]
    layout[key] = inRange(v, min, max) ? v : fallback
  }
  const d = saved.dialog
  if (d && typeof d === 'object') {
    const { width, height } = d as Record<string, unknown>
    if (inRange(width, DIALOG_MIN.width, 10_000) && inRange(height, DIALOG_MIN.height, 10_000)) layout.dialog = { width, height }
  }
  return layout
}

/** Il localStorage può mancare o rifiutare la scrittura: allora le misure restano solo in memoria. */
function storage<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

let state: Layout | null = null

/** Il layout dell'app, condiviso da tutte le schede; ogni modifica si salva subito. */
export function useLayout(): Layout {
  if (!state) {
    const s = reactive(readLayout(storage(() => localStorage.getItem(KEY))))
    watch(s, () => storage(() => localStorage.setItem(KEY, JSON.stringify(s))))
    state = s
  }
  return state
}
```

- [ ] **Step 4: il test passa**

Run: `npx vitest run test/unit/layout.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: commit**

```bash
git add src/renderer/layout.ts test/unit/layout.test.ts
git commit -m "feat: misure dei pannelli salvate nel localStorage

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: preferenza `panelLayout`, impostazione, azione e menu

**Files:**
- Modify: `src/shared/types.ts` (`ThemePreference` alla riga 50, `Preferences` alla riga 54)
- Modify: `src/shared/preferences.ts`
- Modify: `src/main/validate.ts` (funzione `preferences`, dopo `theme`)
- Modify: `src/renderer/components/settings/GeneralSettings.vue`
- Modify: `src/renderer/actions/builtin.ts`
- Modify: `src/main/menu.ts` (sottomenu View)
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Test: `test/unit/validate.test.ts`

**Interfaces:**
- Produces: `type PanelLayout = 'horizontal' | 'vertical'`; `Preferences.panelLayout`; l'azione `layout.toggle`.

- [ ] **Step 1: test che falliscono**

In `test/unit/validate.test.ts`, `describe('preferenze')`:
- nel primo test, dopo la riga di `editorApp`:

```ts
    expect(preferences(DEFAULT_PREFERENCES, { panelLayout: 'vertical' }).panelLayout).toBe('vertical')
```

- nella lista `bad` del secondo test, dopo `{ theme: 'blu' },`:

```ts
      { panelLayout: 'diagonal' },
```

- [ ] **Step 2: i test falliscono**

Run: `npx vitest run test/unit/validate.test.ts`
Expected: FAIL. Il primo test riceve `undefined`, e `typecheck` segnalerebbe anche `panelLayout` mancante.

- [ ] **Step 3: tipo, predefinito e validazione**

`src/shared/types.ts`, dopo `export type ThemePreference = 'system' | 'light' | 'dark'`:

```ts
/** Lista e dettaglio affiancati (horizontal) o la lista sopra il dettaglio (vertical). */
export type PanelLayout = 'horizontal' | 'vertical'
```

e in `Preferences`, dopo `theme: ThemePreference`:

```ts
  panelLayout: PanelLayout
```

`src/shared/preferences.ts`, dopo `theme: 'system',`:

```ts
  panelLayout: 'horizontal',
```

`src/main/validate.ts`, in `preferences()`, dopo la riga di `theme`:

```ts
    panelLayout: oneOf(p.panelLayout, ['horizontal', 'vertical'] as const, t('setting.panelLayout')),
```

Le `settings.json` già salvate ricevono il predefinito da `{ ...DEFAULT_PREFERENCES, ...saved.preferences }` in `src/main/settings.ts`: non serve una migrazione.

- [ ] **Step 4: testi**

`src/shared/i18n/en.ts`, dopo `'clone.inProgress': 'Cloning…',`:

```ts
  'setting.panelLayout': 'Panel layout',
  'layout.horizontal': 'Horizontal (list beside details)',
  'layout.vertical': 'Vertical (list above details)',
  'action.layout.toggle': 'Toggle Panel Layout',
```

`src/shared/i18n/it.ts`, dopo `'clone.inProgress': 'Clone in corso…',`:

```ts
  'setting.panelLayout': 'Layout dei pannelli',
  'layout.horizontal': 'Orizzontale (lista accanto al dettaglio)',
  'layout.vertical': 'Verticale (lista sopra il dettaglio)',
  'action.layout.toggle': 'Cambia layout dei pannelli',
```

- [ ] **Step 5: impostazione**

`GeneralSettings.vue`: nello script, cambiare l'import dei tipi in:

```ts
import type { PanelLayout, ThemePreference } from '../../../shared/types'
```

e nel template, dopo la `</select>` del tema:

```html
    <label for="pref-panelLayout">{{ t('setting.panelLayout') }}</label>
    <select
      id="pref-panelLayout"
      data-testid="pref-panelLayout"
      :value="app.preferences.panelLayout"
      @change="app.updatePreferences({ panelLayout: ($event.target as HTMLSelectElement).value as PanelLayout })"
    >
      <option value="horizontal">{{ t('layout.horizontal') }}</option>
      <option value="vertical">{{ t('layout.vertical') }}</option>
    </select>
```

- [ ] **Step 6: azione e menu**

`src/renderer/actions/builtin.ts`, in `registry.register(...)`, dopo `output.toggle`:

```ts
    {
      id: 'layout.toggle',
      get title() { return t('action.layout.toggle') },
      run: () => app.updatePreferences({ panelLayout: app.preferences.panelLayout === 'vertical' ? 'horizontal' : 'vertical' }),
    },
```

`src/main/menu.ts`, nel sottomenu View, dopo `action('view.pullRequests'),`:

```ts
        action('layout.toggle'),
```

- [ ] **Step 7: verifica**

Run: `npx vitest run test/unit/validate.test.ts test/unit/i18n.test.ts && npm run typecheck`
Expected: PASS, typecheck pulito.

- [ ] **Step 8: commit**

```bash
git add src/shared src/main src/renderer/actions/builtin.ts src/renderer/components/settings/GeneralSettings.vue test/unit/validate.test.ts
git commit -m "feat: preferenza del layout dei pannelli, nelle impostazioni, nella palette e nel menu View

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: divisore e griglia della vista del repo

**Files:**
- Create: `src/renderer/components/Splitter.vue`
- Modify: `src/renderer/components/RepoView.vue`
- Modify: `src/renderer/components/HistoryView.vue` (`.history`), `PullRequestList.vue` (`.prs`), `RepoSidebar.vue` (`.sidebar`): togliere `border-right: 1px solid var(--border);`
- Modify: `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `useLayout`, `SIZES`, `clamp` (Task 1); `preferences.panelLayout`, azione `layout.toggle` (Task 2).
- Produces: `Splitter.vue` con props `orientation: 'col' | 'row'`, `modelValue: number`, `defaultValue: number`, `fraction?: boolean`, `min: number`, `minAfter: number`, `max?: number`, `label: string`; evento `update:modelValue`. Il divisore misura `previousElementSibling` e `nextElementSibling`: va messo fra i due pannelli che divide, come fratelli.

- [ ] **Step 1: E2E che fallisce**

`test/e2e/layout.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test'
import { makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Trascina il centro di un divisore di dx, dy px. */
async function drag(page: Page, testid: string, dx: number, dy: number) {
  const b = await page.getByTestId(testid).boundingBox()
  if (!b) throw new Error(`divisore non visibile: ${testid}`)
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

const width = async (page: Page, selector: string) => Math.round((await page.locator(selector).boundingBox())?.width ?? 0)

test('divisori: la sidebar si allarga, la misura resta dopo il reload e il doppio clic la riporta a 220 px', async () => {
  const repo = makeRepo(2)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  expect(await width(page, 'aside.sidebar')).toBe(220)

  await drag(page, 'split-sidebar', 80, 0)
  await expect.poll(() => width(page, 'aside.sidebar')).toBe(300)

  await page.reload()
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  expect(await width(page, 'aside.sidebar')).toBe(300)

  await page.getByTestId('split-sidebar').dblclick()
  await expect.poll(() => width(page, 'aside.sidebar')).toBe(220)
  await app.close()
})

test('layout verticale dalle impostazioni, ritorno all\'orizzontale dal pulsante della barra', async () => {
  const repo = makeRepo(2)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  const box = async (selector: string) => (await page.locator(selector).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }

  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('pref-panelLayout').selectOption('vertical')
  await page.getByTestId('settings-close').click()
  // Il dettaglio sta sotto la lista, alla stessa x
  await expect.poll(async () => (await box('.detail')).y > (await box('.history')).y + 100).toBe(true)
  expect(Math.round((await box('.detail')).x)).toBe(Math.round((await box('.history')).x))

  await page.getByTestId('layout-toggle').click()
  await expect.poll(async () => (await box('.detail')).x > (await box('.history')).x + 100).toBe(true)
  await page.keyboard.press(`${mod}+Comma`)
  await expect(page.getByTestId('pref-panelLayout')).toHaveValue('horizontal')
  await app.close()
})
```

- [ ] **Step 2: l'E2E fallisce**

Run: `npm run build && npx playwright test test/e2e/layout.spec.ts`
Expected: FAIL, `split-sidebar` e `layout-toggle` non esistono.

- [ ] **Step 3: testo dei divisori**

`en.ts`, dopo `'action.layout.toggle'`: `  'layout.resize': 'Resize panels',`
`it.ts`, dopo `'action.layout.toggle'`: `  'layout.resize': 'Ridimensiona i pannelli',`

- [ ] **Step 4: `Splitter.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { clamp } from '../layout'

const props = defineProps<{
  /** col: divisore fra due colonne, si sposta in orizzontale; row: fra due righe. */
  orientation: 'col' | 'row'
  /** px del pannello prima del divisore, oppure la sua frazione con fraction. */
  modelValue: number
  defaultValue: number
  fraction?: boolean
  /** px minimi del pannello prima e di quello dopo; max facoltativo per quello prima. */
  min: number
  minAfter: number
  max?: number
  label: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const el = ref<HTMLElement | null>(null)
const dragging = ref(false)

/** Le misure attuali dei due pannelli accanto (gli elementi fratelli del divisore). */
function sizes(): { before: number; total: number } {
  const dim = props.orientation === 'col' ? 'width' : 'height'
  const before = el.value?.previousElementSibling?.getBoundingClientRect()[dim] ?? 0
  const after = el.value?.nextElementSibling?.getBoundingClientRect()[dim] ?? 0
  return { before, total: before + after }
}

function resize(start: { before: number; total: number }, delta: number) {
  const px = clamp(start.before + delta, props.min, Math.min(props.max ?? Infinity, start.total - props.minAfter))
  emit('update:modelValue', props.fraction ? px / start.total : Math.round(px))
}

const coord = (e: PointerEvent) => (props.orientation === 'col' ? e.clientX : e.clientY)

function onPointerDown(e: PointerEvent) {
  const target = el.value
  if (e.button !== 0 || !target) return
  // Niente selezione del testo durante il trascinamento
  e.preventDefault()
  const start = sizes()
  const origin = coord(e)
  const move = (ev: PointerEvent) => resize(start, coord(ev) - origin)
  const end = () => {
    dragging.value = false
    target.removeEventListener('pointermove', move)
    target.removeEventListener('lostpointercapture', end)
  }
  target.setPointerCapture(e.pointerId)
  target.addEventListener('pointermove', move)
  target.addEventListener('lostpointercapture', end)
  dragging.value = true
}

function onKey(e: KeyboardEvent) {
  const keys = props.orientation === 'col' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
  const i = keys.indexOf(e.key)
  if (i < 0) return
  e.preventDefault()
  resize(sizes(), i === 0 ? -16 : 16)
}
</script>

<template>
  <div
    ref="el"
    class="splitter"
    :class="[orientation, { dragging }]"
    role="separator"
    :aria-orientation="orientation === 'col' ? 'vertical' : 'horizontal'"
    :aria-label="label"
    tabindex="0"
    @pointerdown="onPointerDown"
    @dblclick="emit('update:modelValue', defaultValue)"
    @keydown="onKey"
  />
</template>

<style scoped>
/* Fascia di presa di 5 px con una linea di 1 px al centro */
.splitter { position: relative; flex: none; touch-action: none; outline: none; }
.splitter.col { width: 5px; cursor: col-resize; }
.splitter.row { height: 5px; cursor: row-resize; }
.splitter::before { content: ''; position: absolute; background: var(--border); }
.splitter.col::before { top: 0; bottom: 0; left: 2px; width: 1px; }
.splitter.row::before { left: 0; right: 0; top: 2px; height: 1px; }
.splitter:hover::before, .splitter.dragging::before, .splitter:focus-visible::before { background: var(--accent); }
</style>
```

- [ ] **Step 5: `RepoView.vue`**

Script, nuovi import:

```ts
import { registry } from '../actions/builtin'
import { SIZES, useLayout } from '../layout'
import { useAppStore } from '../stores/app'
import Splitter from './Splitter.vue'
```

e dopo `const prs = usePullRequestStore(props.root)`:

```ts
const app = useAppStore()
const layout = useLayout()
const vertical = computed(() => app.preferences.panelLayout === 'vertical')
/** La misura della lista: frazione della larghezza in orizzontale, dell'altezza in verticale. */
const listKey = computed(() => (vertical.value ? 'listVertical' : 'list'))
const mainStyle = computed(() => {
  const f = layout[listKey.value]
  const tracks = `minmax(0, ${f}fr) 5px minmax(0, ${1 - f}fr)`
  return vertical.value ? { gridTemplateRows: tracks } : { gridTemplateColumns: tracks }
})
```

Template, il pulsante prima di `repo-refresh`:

```html
      <button
        data-testid="layout-toggle"
        :aria-label="t('action.layout.toggle')"
        :title="t('action.layout.toggle')"
        @click="registry.run('layout.toggle')"
      >{{ vertical ? '◫' : '⊟' }}</button>
```

e `<div class="panes">…</div>` diventa:

```html
    <div class="panes" :style="{ gridTemplateColumns: `${layout.sidebar}px 5px minmax(0, 1fr)` }">
      <RepoSidebar :root="root" />
      <Splitter
        v-model="layout.sidebar"
        orientation="col"
        :default-value="SIZES.sidebar.default"
        :min="SIZES.sidebar.min"
        :max="SIZES.sidebar.max"
        :min-after="480"
        :label="t('layout.resize')"
        data-testid="split-sidebar"
      />
      <div class="main" :class="{ vertical }" :style="mainStyle">
        <PullRequestList v-if="repo.page === 'pullRequests'" :root="root" />
        <HistoryView v-else :root="root" />
        <Splitter
          v-model="layout[listKey]"
          :orientation="vertical ? 'row' : 'col'"
          fraction
          :default-value="SIZES[listKey].default"
          :min="vertical ? 120 : 240"
          :min-after="vertical ? 120 : 240"
          :label="t('layout.resize')"
          data-testid="split-list"
        />
        <PullRequestDetail v-if="repo.page === 'pullRequests'" :root="root" />
        <WorkingView v-else-if="repo.view === 'working'" :root="root" />
        <CommitDetail v-else :root="root" />
      </div>
    </div>
```

Stile: sostituire la regola `.panes` con:

```css
.panes { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); }
/* Lista | divisore | dettaglio: colonne (dallo stile in linea) e una riga, oppure righe e una colonna */
.main { display: grid; grid-template-rows: minmax(0, 1fr); min-width: 0; min-height: 0; }
.main.vertical { grid-template-columns: minmax(0, 1fr); }
```

Togliere `border-right: 1px solid var(--border);` da `.history` (`HistoryView.vue`), da `.prs` (`PullRequestList.vue`) e da `.sidebar` (`RepoSidebar.vue`): ora la linea la disegna il divisore.

- [ ] **Step 6: l'E2E passa**

Run: `npm run build && npx playwright test test/e2e/layout.spec.ts`
Expected: PASS (2 test).

Se `page.reload()` non riapre la scheda del repo, si rilancia l'app con la stessa cartella dati: `launch([], userData)`, prendendo `userData` dal primo `launch`. Il `localStorage` sta in quella cartella.

- [ ] **Step 7: commit**

```bash
git add src/renderer/components test/e2e/layout.spec.ts src/shared/i18n
git commit -m "feat: divisori fra sidebar, lista e dettaglio; layout verticale e pulsante nella barra

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: divisore fra file e diff

**Files:**
- Modify: `src/renderer/components/CommitDetail.vue`, `WorkingView.vue`, `PullRequestDetail.vue`
- Test: `test/e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `Splitter.vue` (Task 3), `useLayout`, `SIZES` (Task 1).
- Produces: in ognuno dei tre pannelli, la lista dei file seguita da `Splitter` (`data-testid="split-files"`) e da `<div class="diff-area">` con la barra del diff e il diff. Il Task 5 aggiunge il pulsante ⤢ in quella barra.

- [ ] **Step 1: E2E che fallisce**

In `test/e2e/layout.spec.ts`:

```ts
test('divisore fra file e diff nel dettaglio del commit', async () => {
  const repo = makeRepo(1)
  const { app, page } = await launch([repo])
  const files = page.locator('.detail .files')
  await expect(page.getByTestId('file-row')).toHaveCount(1)
  const height = async () => Math.round((await files.boundingBox())?.height ?? 0)
  expect(await height()).toBe(140)
  await drag(page, 'split-files', 0, 60)
  await expect.poll(height).toBe(200)
  await page.getByTestId('split-files').dblclick()
  await expect.poll(height).toBe(140)
  await app.close()
})
```

- [ ] **Step 2: l'E2E fallisce**

Run: `npm run build && npx playwright test test/e2e/layout.spec.ts -g "file e diff"`
Expected: FAIL. L'altezza della lista non è 140 e `split-files` non esiste.

- [ ] **Step 3: `CommitDetail.vue`**

Script:

```ts
import { SIZES, useLayout } from '../layout'
import Splitter from './Splitter.vue'
```

e dopo `const repo = useRepoStore(props.root)`: `const layout = useLayout()`.

Template:
- `<ul class="files">` diventa `<ul class="files" :style="{ height: `${layout.commitFiles}px` }">`;
- dopo `</ul>`:

```html
      <Splitter
        v-model="layout.commitFiles"
        orientation="row"
        :default-value="SIZES.commitFiles.default"
        :min="SIZES.commitFiles.min"
        :min-after="120"
        :label="t('layout.resize')"
        data-testid="split-files"
      />
      <div class="diff-area">
```

- chiudere `</div>` dopo `<DiffView … />`, così `diff-bar` e `DiffView` stanno dentro `diff-area`.

Stile:
- `.files` diventa `.files { flex: 0 1 auto; min-height: 48px; margin: 0; padding: 4px 0; overflow: auto; list-style: none; }`, senza `max-height` e senza `border-bottom`;
- aggiungere `.diff-area { flex: 1 1 0; min-height: 120px; display: flex; flex-direction: column; }`.

- [ ] **Step 4: `WorkingView.vue`**

Stessi import, più `const layout = useLayout()`.

Template:
- `<div class="files">` diventa `<div class="files" :style="{ height: `${layout.workingFiles}px` }">`;
- il blocco `<template v-if="repo.working && repo.workingDiff">` diventa:

```html
    <template v-if="repo.working && repo.workingDiff">
      <Splitter
        v-model="layout.workingFiles"
        orientation="row"
        :default-value="SIZES.workingFiles.default"
        :min="SIZES.workingFiles.min"
        :min-after="120"
        :label="t('layout.resize')"
        data-testid="split-files"
      />
      <div class="diff-area">
        <div class="diff-bar">
          <span class="path muted">{{ repo.working.file.path }}</span>
          <label>
            <input type="checkbox" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
            {{ t('diff.ignoreWhitespace') }}
          </label>
        </div>
        <StageDiff :root="root" :diff="repo.workingDiff" />
      </div>
    </template>
```

Stile: `.files` diventa `.files { flex: 0 1 auto; min-height: 48px; overflow: auto; }`, senza `max-height` e senza `border-bottom`. Aggiungere la stessa regola `.diff-area` del passo 3.

- [ ] **Step 5: `PullRequestDetail.vue`**

Stessi import (`SIZES`, `useLayout`, `Splitter`), più `const layout = useLayout()`.

Nella scheda Changes:
- `<ul class="files">` diventa `<ul class="files" :style="{ height: `${layout.prFiles}px` }">`;
- dopo `</ul>`, `Splitter` con `v-model="layout.prFiles"`, `:default-value="SIZES.prFiles.default"`, `:min="SIZES.prFiles.min"` e gli stessi `orientation`, `min-after`, `label` e `data-testid` del passo 3;
- `diff-bar` e `DiffView` vanno dentro `<div class="diff-area">…</div>`.

Stile:
- `.files` diventa `.files { flex: 0 1 auto; min-height: 48px; margin: 0; padding: 4px 0; overflow: auto; list-style: none; }`;
- aggiungere `.diff-area` come sopra.

- [ ] **Step 6: verifica**

Run: `npm run typecheck && npm run build && npx playwright test test/e2e/layout.spec.ts test/e2e/history.spec.ts test/e2e/working.spec.ts test/e2e/pull-requests.spec.ts`
Expected: PASS. Gli E2E di storia, modifiche locali e PR continuano a funzionare con la nuova struttura.

- [ ] **Step 7: commit**

```bash
git add src/renderer/components test/e2e/layout.spec.ts
git commit -m "feat: divisore fra la lista dei file e il diff nei tre pannelli

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: popup del diff

**Files:**
- Modify: `src/renderer/stores/repo.ts`
- Create: `src/renderer/components/DiffDialog.vue`
- Modify: `src/renderer/components/RepoView.vue`, `CommitDetail.vue`, `WorkingView.vue`, `PullRequestDetail.vue`
- Modify: `src/shared/i18n/en.ts`, `it.ts`
- Test: `test/e2e/layout.spec.ts`

**Interfaces:**
- Consumes:
  - `useLayout`, `clamp` (Task 1);
  - dallo store `repo`: `detail`, `selectedFile`, `selectFile`, `diff`, `loadDiff`, `status`, `working`, `workingDiff`, `selectWorkingFile`, `view`, `selected`, `diffOptions`, `toggleSplit`, `toggleWhitespace`;
  - dallo store `pull-requests`: `changes`, `file`, `selectFile`, `diff`, `loadDiff`, `tab`, `selected`.
- Produces: `repo.diffDialog: 'commit' | 'working' | 'pr' | null`.

- [ ] **Step 1: E2E che falliscono**

In cima a `test/e2e/layout.spec.ts`, gli import diventano:

```ts
import { expect, type Page, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'
```

e in fondo:

```ts
test('popup del diff: si apre dal pulsante e col doppio clic, ↓ passa al file successivo, Esc chiude', async () => {
  const repo = makeRepo(0)
  for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(repo, name), `${name}\n`)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'tre file')
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('file-row')).toHaveCount(3)
  const dialog = page.getByTestId('diff-dialog')

  await page.getByTestId('diff-popup').click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('diff-position')).toHaveText('1/3')
  await expect(dialog.getByTestId('diff-dialog-path')).toHaveText('a.txt')
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByTestId('diff-position')).toHaveText('2/3')
  await expect(dialog.getByTestId('diff-line-add')).toContainText('b.txt')
  // La selezione è quella del pannello
  await expect(page.getByTestId('file-row').nth(1)).toHaveClass(/selected/)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.getByTestId('file-row').nth(2).dblclick()
  await expect(dialog.getByTestId('diff-position')).toHaveText('3/3')
  await dialog.getByTestId('diff-dialog-close').click()
  await expect(dialog).toBeHidden()
  await app.close()
})

test('popup del diff nelle modifiche locali: stage di un blocco', async () => {
  const lines = Array.from({ length: 20 }, (_, i) => `riga ${i + 1}`)
  const repo = makeRepo(0)
  writeFileSync(join(repo, 'f.txt'), lines.join('\n') + '\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'base')
  const changed = [...lines]
  changed[1] = 'DUE'
  changed[17] = 'DICIOTTO'
  writeFileSync(join(repo, 'f.txt'), changed.join('\n') + '\n')

  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-unstaged').getByTestId('working-file').dblclick()
  const dialog = page.getByTestId('diff-dialog')
  await expect(dialog.getByTestId('hunk-stage')).toHaveCount(2)
  await dialog.getByTestId('hunk-stage').first().click()
  await expect.poll(() => git(repo, 'diff', '--cached')).toContain('+DUE')
  expect(git(repo, 'diff', '--cached')).not.toContain('DICIOTTO')
  // Il file resta anche fra quelli non in stage: il popup resta aperto sullo stesso file
  await expect(dialog.getByTestId('diff-dialog-path')).toHaveText('f.txt')
  await app.close()
})
```

- [ ] **Step 2: gli E2E falliscono**

Run: `npm run build && npx playwright test test/e2e/layout.spec.ts -g "popup"`
Expected: FAIL, `diff-popup` non esiste.

- [ ] **Step 3: store e testi**

`src/renderer/stores/repo.ts`, vicino a `const working = shallowRef<WorkingSelection | null>(null)`:

```ts
    /** Popup del diff aperto e cosa mostra; null = chiuso. */
    const diffDialog = ref<'commit' | 'working' | 'pr' | null>(null)
```

e aggiungere `diffDialog` all'oggetto restituito dallo store, accanto a `working`.

`en.ts`, dopo `'layout.resize'`:

```ts
  'diff.expand': 'Expand diff',
  'diff.previousFile': 'Previous file',
  'diff.nextFile': 'Next file',
  'common.close': 'Close',
```

`it.ts`, dopo `'layout.resize'`:

```ts
  'diff.expand': 'Ingrandisci il diff',
  'diff.previousFile': 'File precedente',
  'diff.nextFile': 'File successivo',
  'common.close': 'Chiudi',
```

- [ ] **Step 4: `DiffDialog.vue`**

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WorkingArea } from '../../shared/types'
import { t } from '../i18n'
import { clamp, useLayout } from '../layout'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import DiffView from './DiffView.vue'
import StageDiff from './StageDiff.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const prs = usePullRequestStore(props.root)
const layout = useLayout()
const dialog = ref<HTMLDialogElement | null>(null)
// Fisso per tutta la vita del popup: è montato solo con diffDialog impostato
const source = repo.diffDialog ?? 'commit'

/** Le sezioni delle modifiche locali, nell'ordine della lista. */
const AREAS: WorkingArea[] = ['conflicted', 'staged', 'unstaged', 'untracked']

interface Entry {
  path: string
  current: boolean
  select: () => unknown
}

/** I file fra cui si passa con ↑ e ↓, nell'ordine del pannello. */
const entries = computed<Entry[]>(() => {
  if (source === 'working') {
    const s = repo.status
    const w = repo.working
    if (!s) return []
    return AREAS.flatMap((area) =>
      s[area].map((file) => ({
        path: file.path,
        current: w?.area === area && w.file.path === file.path,
        select: () => repo.selectWorkingFile(file, area),
      })),
    )
  }
  const files = source === 'pr' ? (prs.changes?.files ?? []) : (repo.detail?.files ?? [])
  const current = source === 'pr' ? prs.file : repo.selectedFile
  return files.map((f) => ({
    path: f.path,
    current: f.path === current?.path,
    select: () => (source === 'pr' ? prs.selectFile(f) : repo.selectFile(f)),
  }))
})
const index = computed(() => entries.value.findIndex((e) => e.current))
const diff = computed(() => (source === 'pr' ? prs.diff : repo.diff))

function move(delta: number) {
  const i = clamp(index.value + delta, 0, entries.value.length - 1)
  if (i !== index.value) void entries.value[i]?.select()
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  move(e.key === 'ArrowDown' ? 1 : -1)
}

function close() {
  repo.diffDialog = null
}

const force = () => (source === 'pr' ? prs.loadDiff(true) : repo.loadDiff(true))

// Ciò che il popup mostra: se cambia (un altro commit o PR, un'altra vista, nessuna modifica rimasta) si chiude
const shown = computed(() => {
  if (source === 'working') return repo.view === 'working' && repo.working ? 'working' : null
  if (source === 'pr') return prs.tab === 'changes' ? prs.selected : null
  return repo.view === 'commit' ? repo.selected : null
})
const opened = shown.value
watch(shown, (v) => {
  if (v !== opened) close()
})

onMounted(() => {
  const el = dialog.value
  if (!el) return
  const width = Math.min(layout.dialog?.width ?? window.innerWidth * 0.85, window.innerWidth - 16)
  const height = Math.min(layout.dialog?.height ?? window.innerHeight * 0.85, window.innerHeight - 16)
  // Posizione in px invece del centraggio automatico: così, ridimensionando, l'angolo segue il puntatore
  Object.assign(el.style, {
    width: `${width}px`,
    height: `${height}px`,
    left: `${(window.innerWidth - width) / 2}px`,
    top: `${(window.innerHeight - height) / 2}px`,
  })
  el.showModal()
})

onBeforeUnmount(() => {
  const el = dialog.value
  if (el) layout.dialog = { width: el.offsetWidth, height: el.offsetHeight }
  // Anche quando il popup sparisce con la sua scheda: tornando sulla scheda resta chiuso
  repo.diffDialog = null
})
</script>

<template>
  <dialog ref="dialog" class="diff-dialog" data-testid="diff-dialog" @cancel.prevent="close" @keydown="onKey">
    <header class="bar">
      <strong class="path" data-testid="diff-dialog-path">{{ entries[index]?.path }}</strong>
      <button data-testid="diff-prev" :aria-label="t('diff.previousFile')" :title="t('diff.previousFile')" :disabled="index <= 0" @click="move(-1)">↑</button>
      <button
        data-testid="diff-next"
        :aria-label="t('diff.nextFile')"
        :title="t('diff.nextFile')"
        :disabled="index >= entries.length - 1"
        @click="move(1)"
      >↓</button>
      <span class="muted position" data-testid="diff-position">{{ index + 1 }}/{{ entries.length }}</span>
      <span class="spacer" />
      <button v-if="source !== 'working'" @click="repo.toggleSplit()">{{ repo.diffOptions.split ? t('diff.unified') : t('diff.split') }}</button>
      <label>
        <input type="checkbox" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
        {{ t('diff.ignoreWhitespace') }}
      </label>
      <button class="close" data-testid="diff-dialog-close" :aria-label="t('common.close')" @click="close">×</button>
    </header>
    <template v-if="source === 'working'">
      <StageDiff v-if="repo.workingDiff" :root="root" :diff="repo.workingDiff" />
    </template>
    <DiffView v-else-if="diff" :diff="diff" :split="repo.diffOptions.split" @force="force" />
  </dialog>
</template>

<style scoped>
/* Misura e posizione in px (onMounted); resize: both ridimensiona dall'angolo in basso a destra */
.diff-dialog { inset: auto; margin: 0; padding: 0; max-width: none; max-height: none; min-width: 480px; min-height: 300px; overflow: hidden; resize: both; }
.diff-dialog[open] { display: flex; flex-direction: column; }
.bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 12px; }
.bar button { padding: 1px 8px; font-size: 12px; }
.path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.position { font-variant-numeric: tabular-nums; }
.close { border: 0; background: transparent; font-size: 16px; }
</style>
```

- [ ] **Step 5: apertura dai pannelli**

`RepoView.vue`:
- `import DiffDialog from './DiffDialog.vue'`;
- dopo `<FlowFinishDialog … />`: `<DiffDialog v-if="repo.diffDialog" :root="root" />`.

`CommitDetail.vue`:
- nella `diff-bar`, dopo lo `<span class="path …">`:

```html
          <button data-testid="diff-popup" :aria-label="t('diff.expand')" :title="t('diff.expand')" @click="repo.diffDialog = 'commit'">⤢</button>
```

- su `<li … data-testid="file-row">`, accanto a `@click`: `@dblclick="repo.diffDialog = 'commit'"`.

`WorkingView.vue`:
- nella `diff-bar`, dopo lo `<span class="path …">`, lo stesso pulsante con `repo.diffDialog = 'working'`;
- su `<li … data-testid="working-file">`: `@dblclick="repo.diffDialog = 'working'"`;
- aggiungere `.diff-bar button { padding: 1px 8px; font-size: 12px; }` allo stile, come in `CommitDetail`.

`PullRequestDetail.vue`:
- nella `diff-bar`, dopo lo `<span class="path …">`, lo stesso pulsante con `repo.diffDialog = 'pr'`;
- su `<li … data-testid="pr-file">`: `@dblclick="repo.diffDialog = 'pr'"`.

- [ ] **Step 6: gli E2E passano**

Run: `npm run typecheck && npm run build && npx playwright test test/e2e/layout.spec.ts`
Expected: PASS (5 test).

- [ ] **Step 7: screenshot nascosto del popup**

Con uno spec temporaneo nella cartella scratchpad (copiato in `test/e2e/zz-popup.spec.ts` e poi rimosso), si fa uno screenshot di `diff-dialog` in chiaro e in scuro, aperto sul repo di prova dei tre file. Lo spec usa `page.screenshot`; la finestra resta nascosta. Controllare bordo, barra, angolo di ridimensionamento e diff.

- [ ] **Step 8: commit**

```bash
git add src/renderer src/shared/i18n test/e2e/layout.spec.ts
git commit -m "feat: popup del diff ridimensionabile, con file precedente e successivo e la stessa selezione del pannello

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: README e verifica completa

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-10-23-merlino-panels-layout.md` (note di esecuzione)

- [ ] **Step 1: README**

Nella tabella "What you get", la riga "Everyday use" diventa:

```markdown
| Everyday use | Tabs restored at launch. Open a repository from the dialog, by dropping its folder or from the command line. Resizable panels, with the list beside or above the details. Diffs also in a large, resizable window. Command palette, menu bar and context menus with the same actions. An output panel with every git command. Open in your terminal or editor |
```

e nella riga "Settings", dopo `theme,`: ` panel layout,`.

- [ ] **Step 2: verifica completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde (gli screenshot del README restano saltati senza `MERLINO_SCREENSHOTS=1`).

- [ ] **Step 3: note di esecuzione**

In fondo al piano, una sezione "Note di esecuzione": i commit dei task, le deviazioni dal piano e la verifica, con i numeri dei test.

- [ ] **Step 4: commit**

```bash
git add README.md docs
git commit -m "docs: pannelli e popup del diff nel README e note di esecuzione

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
