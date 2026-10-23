# Merlino — Sidebar più chiara — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sidebar che dice a colpo d'occhio dove si lavora:
- area di lavoro con icone;
- sezioni comprimibili e separate, con i tag chiusi all'inizio e lo stato ricordato;
- icone diverse per branch locali e remoti, e HEAD sul branch corrente;
- evidenziata solo la riga cliccata.

**Architecture:**
- `AppIcon.vue` disegna icone SVG di Lucide, copiate con la loro licenza.
- `RepoSidebar.vue` viene riscritta: area di lavoro, intestazioni con freccia, icona e numero, righe con icona, HEAD, evidenziazione per chiave di riga.
- Lo stato delle sezioni sta nel layout (`closedSections` in `src/renderer/layout.ts`), salvato nel `localStorage` come le misure dei pannelli.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright.

Spec: `docs/superpowers/specs/2026-10-23-merlino-sidebar-design.md`. Branch: `feature/sidebar`, che parte da `develop`.

## Global Constraints

- **Nessuna dipendenza nuova.**
- **Icone**:
  - tracciati da `lucide-static` 1.61.0 (ISC), con il testo della licenza in un commento `/*! … */`;
  - chevron proprio (`m9 18 6-6-6-6`);
  - 14 px, `stroke="currentColor"`, `stroke-width="2"`, `aria-hidden="true"`.
- **Sezioni**:
  - id `branches`, `remotes`, `tags`, `stashes`; al primo avvio è chiuso solo `tags`;
  - lo stato vale per tutti i repo e resta dopo il riavvio.
- **Test id che restano**: `page-history`, `page-pull-requests`, `branches-header`, `remotes-header`, `tags-header`, `stash-header`, `branch-item`, `remote-item`, `remote-branch-item`, `tag-item`, `stash-item`, `stash-apply`, `stash-pop`, `stash-drop`.
- **Test id nuovi**: `page-working`, `head-badge`.
- **Testi** in inglese e in italiano.
- **Test e screenshot**: sempre con la finestra nascosta (`MERLINO_E2E=1`).
- **Repo**: solo nomi fittizi.
- **Commit**: email locale `cavallefano@users.noreply.github.com`; il messaggio termina con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: sezioni chiuse nel layout

**Files:**
- Modify: `src/renderer/layout.ts`
- Test: `test/unit/layout.test.ts`

**Interfaces:**
- Produces:
  - `SIDEBAR_SECTIONS = ['branches', 'remotes', 'tags', 'stashes'] as const`;
  - `type SidebarSection`;
  - `Layout.closedSections: SidebarSection[]`, predefinito `['tags']`.

- [ ] **Step 1: test che falliscono**

In `test/unit/layout.test.ts`:
- `defaults` diventa:

```ts
const defaults = { sidebar: 220, list: 0.55, listVertical: 0.4, commitFiles: 140, workingFiles: 180, prFiles: 160, dialog: null, closedSections: ['tags'] }
```

- in `describe('readLayout')`:

```ts
  it('sezioni chiuse: solo gli id validi; senza un array, i tag', () => {
    expect(readLayout(JSON.stringify({ closedSections: ['remotes', 'boh', 3] })).closedSections).toEqual(['remotes'])
    expect(readLayout(JSON.stringify({ closedSections: [] })).closedSections).toEqual([])
    expect(readLayout(JSON.stringify({ closedSections: 'tags' })).closedSections).toEqual(['tags'])
  })
```

- [ ] **Step 2: i test falliscono**

Run: `npx vitest run test/unit/layout.test.ts`
Expected: FAIL, `closedSections` è `undefined`.

- [ ] **Step 3: implementazione**

`src/renderer/layout.ts`, prima di `export interface Layout`:

```ts
/** Sezioni comprimibili della sidebar. */
export const SIDEBAR_SECTIONS = ['branches', 'remotes', 'tags', 'stashes'] as const
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number]
```

e in `Layout`, dopo `dialog`:

```ts
  /** Sezioni della sidebar chiuse; al primo avvio i tag, che di solito sono tanti. */
  closedSections: SidebarSection[]
```

`LayoutSize` diventa `Exclude<keyof Layout, 'dialog' | 'closedSections'>`.

In `readLayout`:
- `const layout = { dialog: null } as Layout` diventa `const layout = { dialog: null, closedSections: ['tags'] } as Layout`;
- prima di `return layout`:

```ts
  const closed = saved.closedSections
  if (Array.isArray(closed)) layout.closedSections = SIDEBAR_SECTIONS.filter((s) => closed.includes(s))
```

- [ ] **Step 4: i test passano**

Run: `npx vitest run test/unit/layout.test.ts && npm run typecheck`
Expected: PASS (7 test), typecheck pulito.

- [ ] **Step 5: commit**

```bash
git add src/renderer/layout.ts test/unit/layout.test.ts
git commit -m "feat: sezioni chiuse della sidebar ricordate nel layout (i tag chiusi al primo avvio)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: icone e nuova sidebar

**Files:**
- Create: `src/renderer/components/AppIcon.vue`
- Modify: `src/renderer/components/RepoSidebar.vue` (riscritto)
- Modify: `src/shared/i18n/en.ts`, `src/shared/i18n/it.ts`
- Modify: `test/e2e/branches.spec.ts`, `test/e2e/drag.spec.ts`
- Test: `test/e2e/sidebar.spec.ts`

**Interfaces:**
- Consumes:
  - `useLayout`, `SidebarSection` (Task 1);
  - dallo store `repo`: `page`, `view`, `selected`, `select`, `selectWorking`, `changeCount`, `info.headSha`, `refs`, `stashes`, `stashAction`;
  - dallo store `pull-requests`: `openCount`.
- Produces:
  - `AppIcon.vue` con la prop `name: IconName`;
  - `type IconName = 'changes' | 'history' | 'pullRequest' | 'branch' | 'remote' | 'tag' | 'stash' | 'folder' | 'folderOpen' | 'chevron'`, esportato da `AppIcon.vue`.

- [ ] **Step 1: E2E che falliscono**

`test/e2e/sidebar.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRemotePair, makeRepo } from '../helpers/repo'
import { launch } from './launch'

test('si evidenzia solo la riga cliccata, non il branch remoto sullo stesso commit; HEAD sul branch corrente', async () => {
  const { clone } = makeRemotePair()
  const { app, page } = await launch([clone])
  const local = page.getByTestId('branch-item').filter({ hasText: 'main' })
  const remote = page.getByTestId('remote-branch-item').filter({ hasText: 'main' })
  await expect(local.getByTestId('head-badge')).toHaveText('HEAD')
  await expect(remote.getByTestId('head-badge')).toHaveCount(0)

  await local.click()
  await expect(local).toHaveClass(/selected/)
  await expect(remote).not.toHaveClass(/selected/)
  await remote.click()
  await expect(remote).toHaveClass(/selected/)
  await expect(local).not.toHaveClass(/selected/)
  await app.close()
})

test('i tag partono chiusi, si aprono e restano aperti dopo il reload', async () => {
  const repo = makeRepo(1)
  git(repo, 'tag', 'v1.0')
  const { app, page } = await launch([repo])
  const header = page.getByTestId('tags-header')
  await expect(header).toContainText('1')
  await expect(page.getByTestId('tag-item')).toHaveCount(0)

  await header.click()
  await expect(page.getByTestId('tag-item')).toHaveText('v1.0')
  await page.reload()
  await expect(page.getByTestId('tag-item')).toHaveText('v1.0')
  await page.getByTestId('tags-header').click()
  await expect(page.getByTestId('tag-item')).toHaveCount(0)
  await app.close()
})

test('area di lavoro: Local Changes e History cambiano pannello e voce attiva', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch([repo])
  const working = page.getByTestId('page-working')
  const history = page.getByTestId('page-history')
  await expect(working).toContainText('1')
  await expect(history).toHaveClass(/active/)

  await working.click()
  await expect(page.getByTestId('commit-subject')).toBeVisible()
  await expect(working).toHaveClass(/active/)
  await expect(history).not.toHaveClass(/active/)

  await history.click()
  await expect(page.getByTestId('commit-message')).toContainText('commit 1')
  await expect(history).toHaveClass(/active/)
  await expect(working).not.toHaveClass(/active/)
  await app.close()
})
```

- [ ] **Step 2: gli E2E falliscono**

Run: `npm run build && npx playwright test test/e2e/sidebar.spec.ts`
Expected: FAIL (`head-badge` e `page-working` non esistono, i tag sono aperti).

- [ ] **Step 3: testi**

`en.ts`, dopo `'common.close': 'Close',`:

```ts
  'sidebar.workspace': 'Workspace',
  'page.localChanges': 'Local Changes',
```

`it.ts`, dopo `'common.close': 'Chiudi',`:

```ts
  'sidebar.workspace': 'Area di lavoro',
  'page.localChanges': 'Modifiche locali',
```

- [ ] **Step 4: `AppIcon.vue`**

```vue
<script lang="ts">
/*!
 * Icone di Lucide (https://lucide.dev), da lucide-static 1.61.0; lo chevron è un tracciato di Merlino.
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
const ICONS = {
  changes:
    '<path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  pullRequest: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
  branch: '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
  remote: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  stash: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderOpen:
    '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
} as const

export type IconName = keyof typeof ICONS
</script>

<script setup lang="ts">
defineProps<{ name: IconName }>()
</script>

<template>
  <!-- v-html solo con i disegni fissi di questo file, mai con testo da fuori -->
  <svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="ICONS[name]"
  />
</template>

<style scoped>
.icon { width: 14px; height: 14px; flex: none; }
</style>
```

- [ ] **Step 5: `RepoSidebar.vue`**

Il file intero diventa:

```vue
<script setup lang="ts">
import { t } from '../i18n'
import { computed, reactive, ref } from 'vue'
import type { StashEntry } from '../../shared/types'
import { branchMenu, remoteBranchMenu, remoteMenu, tagMenu } from '../actions/branches'
import { dragSource, dropTarget } from '../drag/drag'
import type { DragSource, DropTarget } from '../drag/drop-actions'
import { treeRows } from '../history/branch-tree'
import { type SidebarSection, useLayout } from '../layout'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import AppIcon, { type IconName } from './AppIcon.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const prs = usePullRequestStore(props.root)
const layout = useLayout()

interface Row {
  key: string
  depth: number
  label: string
  /** Chiave in collapsed, se la riga è una cartella. */
  folder?: string
  /** Senza icona, le cartelle mostrano quella della cartella, aperta o chiusa. */
  icon?: IconName
  /** Icona nel colore d'accento (branch locali); le altre sono grigie. */
  accent?: boolean
  sha?: string
  current?: boolean
  /** Commit avanti/indietro rispetto all'upstream. */
  track?: string
  title?: string
  testid?: string
  /** Doppio clic. */
  open?: () => unknown
  /** Clic destro. */
  menu?: () => unknown
  /** Origine del drag & drop. */
  drag?: DragSource
  /** Destinazione del drag & drop. */
  drop?: DropTarget
}

// Cartelle chiuse, finché la scheda resta aperta: "<gruppo>:<percorso>" (gruppo: heads o remotes/<nome>), i remote "remotes/<nome>"
const collapsed = reactive(new Set<string>())

function toggle(key: string) {
  if (!collapsed.delete(key)) collapsed.add(key)
}

// Sezioni chiuse: nel layout, per tutti i repo e anche dopo il riavvio
const isOpen = (id: SidebarSection) => !layout.closedSections.includes(id)

function toggleSection(id: SidebarSection) {
  const i = layout.closedSections.indexOf(id)
  if (i < 0) layout.closedSections.push(id)
  else layout.closedSections.splice(i, 1)
}

/** Righe ad albero (feature/login dentro la cartella feature) per i ref di un gruppo. */
function tree<T extends { name: string }>(group: string, items: T[], depth: number, row: (item: T) => Partial<Row>): Row[] {
  const prefix = `${group}:`
  const closed = new Set([...collapsed].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)))
  const byName = new Map(items.map((item) => [item.name, item]))
  return treeRows([...byName.keys()], closed).map((r) => {
    if (r.kind === 'folder') return { key: `${prefix}${r.path}/`, depth: depth + r.depth, label: r.name, folder: `${prefix}${r.path}` }
    const item = byName.get(r.name)
    return { key: `${prefix}${r.name}`, depth: depth + r.depth, label: r.label, ...(item && row(item)) }
  })
}

const branchRows = computed(() =>
  tree('heads', repo.refs?.branches ?? [], 0, (b) => ({
    icon: 'branch',
    accent: true,
    sha: b.sha,
    current: b.current,
    track: [b.ahead && `↑${b.ahead}`, b.behind && `↓${b.behind}`].filter(Boolean).join(' '),
    title: !b.upstream ? b.name : b.gone ? t('sidebar.upstreamGone', { name: b.name, upstream: b.upstream }) : `${b.name} → ${b.upstream}`,
    testid: 'branch-item',
    open: () => !b.current && repo.git({ kind: 'checkoutBranch', name: b.name }),
    menu: () => branchMenu(repo, b),
    drag: { kind: 'branch', name: b.name },
    drop: { kind: 'branch', name: b.name },
  })),
)

const remoteRows = computed(() =>
  (repo.refs?.remotes ?? []).flatMap((remote): Row[] => {
    const key = `remotes/${remote.name}`
    const header: Row = {
      key,
      depth: 0,
      label: remote.name,
      folder: key,
      icon: 'remote',
      title: remote.url,
      testid: 'remote-item',
      menu: () => remoteMenu(repo, remote),
      drop: { kind: 'remote', name: remote.name },
    }
    if (collapsed.has(key)) return [header]
    const branches = tree(key, remote.branches, 1, (b) => ({
      icon: 'branch',
      sha: b.sha,
      title: b.fullName,
      testid: 'remote-branch-item',
      open: () => repo.git({ kind: 'checkoutRemote', fullName: b.fullName }),
      menu: () => remoteBranchMenu(repo, remote, b),
      drag: { kind: 'remoteBranch', remote: remote.name, name: b.name, fullName: b.fullName },
      drop: { kind: 'remoteBranch', remote: remote.name, name: b.name, fullName: b.fullName },
    }))
    return [header, ...branches]
  }),
)

const tagRows = computed(() =>
  (repo.refs?.tags ?? []).map(
    (tag): Row => ({
      key: `tags:${tag.name}`,
      depth: 0,
      label: tag.name,
      icon: 'tag',
      sha: tag.sha,
      testid: 'tag-item',
      menu: () => tagMenu(repo, tag),
      drag: { kind: 'tag', name: tag.name },
    }),
  ),
)

interface Section {
  id: SidebarSection
  icon: IconName
  title: string
  count: number
  rows: Row[]
  empty: string
  drop?: DropTarget
  testid: string
}

const sections = computed((): Section[] => [
  {
    id: 'branches',
    icon: 'branch',
    title: t('sidebar.branches'),
    count: repo.refs?.branches.length ?? 0,
    rows: branchRows.value,
    empty: t('sidebar.noBranches'),
    drop: { kind: 'branchesHeader' },
    testid: 'branches-header',
  },
  {
    id: 'remotes',
    icon: 'remote',
    title: t('sidebar.remotes'),
    count: repo.refs?.remotes.length ?? 0,
    rows: remoteRows.value,
    empty: t('sidebar.noRemotes'),
    testid: 'remotes-header',
  },
  {
    id: 'tags',
    icon: 'tag',
    title: t('sidebar.tags'),
    count: repo.refs?.tags.length ?? 0,
    rows: tagRows.value,
    empty: t('sidebar.noTags'),
    drop: { kind: 'tagsHeader' },
    testid: 'tags-header',
  },
  {
    id: 'stashes',
    icon: 'stash',
    title: t('sidebar.stashes'),
    count: repo.stashes.length,
    rows: [],
    empty: t('sidebar.noStashes'),
    drop: { kind: 'stashHeader' },
    testid: 'stash-header',
  },
])

/** Attributi di drag & drop di una riga o di un'intestazione. */
const dnd = (source?: DragSource, target?: DropTarget) => ({ ...(source ? dragSource(source) : {}), ...(target ? dropTarget(repo, target) : {}) })

/** La riga cliccata: si evidenzia solo lei, non le altre sullo stesso commit (es. origin/main accanto a main). */
const picked = ref<string | null>(null)

const isSelected = (key: string, sha: string | undefined) =>
  picked.value === key && repo.page === 'history' && repo.view === 'commit' && !!sha && repo.selected === sha

/** Un commit scelto dalla sidebar si guarda nella storia. */
function pick(key: string, sha: string) {
  picked.value = key
  repo.page = 'history'
  void repo.select(sha)
}

function click(row: Row) {
  if (row.folder) toggle(row.folder)
  else if (row.sha) pick(row.key, row.sha)
}

function showWorking() {
  repo.page = 'history'
  void repo.selectWorking()
}

/** La storia: dalle modifiche locali si torna al commit selezionato prima, oppure a HEAD. */
function showHistory() {
  repo.page = 'history'
  const sha = repo.selected ?? repo.info?.headSha
  if (repo.view === 'working' && sha) void repo.select(sha)
}

function drop(stash: StashEntry) {
  if (window.confirm(t('stash.confirmDrop', { message: stash.message }))) void repo.stashAction('drop', stash.ref)
}
</script>

<template>
  <aside class="sidebar">
    <nav class="workspace">
      <h3 class="label">{{ t('sidebar.workspace') }}</h3>
      <button
        v-bind="dnd(undefined, { kind: 'working' })"
        :class="{ active: repo.page === 'history' && repo.view === 'working' }"
        data-testid="page-working"
        @click="showWorking"
      >
        <AppIcon name="changes" class="kind" />
        <span class="name">{{ t('page.localChanges') }}</span>
        <span v-if="repo.changeCount" class="badge">{{ repo.changeCount }}</span>
      </button>
      <button :class="{ active: repo.page === 'history' && repo.view === 'commit' }" data-testid="page-history" @click="showHistory">
        <AppIcon name="history" class="kind" />
        <span class="name">{{ t('page.history') }}</span>
      </button>
      <button
        v-bind="dnd(undefined, { kind: 'pullRequests' })"
        :class="{ active: repo.page === 'pullRequests' }"
        data-testid="page-pull-requests"
        @click="repo.page = 'pullRequests'"
      >
        <AppIcon name="pullRequest" class="kind" />
        <span class="name">{{ t('page.pullRequests') }}</span>
        <span v-if="prs.openCount !== null" class="badge">{{ prs.openCount }}</span>
      </button>
    </nav>
    <section v-for="s in sections" :key="s.id">
      <h3 v-bind="dnd(undefined, s.drop)" :data-testid="s.testid">
        <button type="button" class="toggle" :aria-expanded="isOpen(s.id)" @click="toggleSection(s.id)">
          <AppIcon name="chevron" class="chevron" :class="{ open: isOpen(s.id) }" />
          <AppIcon :name="s.icon" />
          <span class="title">{{ s.title }}</span>
          <span class="count">{{ s.count }}</span>
        </button>
      </h3>
      <template v-if="isOpen(s.id)">
        <p v-if="!s.count" class="muted empty">{{ s.empty }}</p>
        <ul v-if="s.id === 'stashes'">
          <li
            v-for="st in repo.stashes"
            :key="st.ref"
            v-bind="dnd({ kind: 'stash', ref: st.ref, sha: st.sha })"
            :class="{ selected: isSelected(`stash:${st.ref}`, st.sha) }"
            :title="st.message"
            data-testid="stash-item"
            @click="pick(`stash:${st.ref}`, st.sha)"
          >
            <span class="slot" />
            <AppIcon name="stash" class="kind" />
            <span class="name">{{ st.message }}</span>
            <span class="actions" @click.stop>
              <button data-testid="stash-apply" :title="t('stash.apply')" @click="repo.stashAction('apply', st.ref)">{{ t('stash.apply') }}</button>
              <button data-testid="stash-pop" :title="t('stash.applyAndDelete')" @click="repo.stashAction('pop', st.ref)">Pop</button>
              <button data-testid="stash-drop" :title="t('stash.delete')" @click="drop(st)">✕</button>
            </span>
          </li>
        </ul>
        <ul v-else>
          <li
            v-for="row in s.rows"
            :key="row.key"
            v-bind="dnd(row.drag, row.drop)"
            :class="{ folder: row.folder, current: row.current, selected: isSelected(row.key, row.sha) }"
            :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
            :title="row.title ?? row.label"
            :data-testid="row.testid"
            @click="click(row)"
            @dblclick="row.open?.()"
            @contextmenu.prevent="row.menu?.()"
          >
            <span class="slot"><AppIcon v-if="row.folder" name="chevron" class="chevron" :class="{ open: !collapsed.has(row.folder) }" /></span>
            <AppIcon :name="row.icon ?? (row.folder && collapsed.has(row.folder) ? 'folder' : 'folderOpen')" class="kind" :class="{ accent: row.accent }" />
            <span class="name">{{ row.label }}</span>
            <span v-if="row.track" class="track">{{ row.track }}</span>
            <span v-if="row.current" class="head" data-testid="head-badge">HEAD</span>
          </li>
        </ul>
      </template>
    </section>
  </aside>
</template>

<style scoped>
.sidebar { min-width: 0; min-height: 0; overflow: auto; background: var(--bg-alt); user-select: none; }
.label, .toggle { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fg-muted); }
/* Area di lavoro: le pagine, con la loro icona */
.workspace { display: flex; flex-direction: column; padding-bottom: 8px; }
.label { margin: 0; padding: 10px 12px 4px; }
.workspace button { display: flex; align-items: center; gap: 8px; padding: 4px 12px; border: 0; border-radius: 0; background: transparent; text-align: left; }
.workspace button:hover { background: var(--bg-hover); }
.workspace button.active { background: var(--selected-bg); font-weight: 600; }
.workspace button.active .kind { color: var(--accent); }
.badge { padding: 0 6px; border-radius: 8px; background: var(--bg-hover); color: var(--fg-muted); font-size: 11px; font-weight: 400; font-variant-numeric: tabular-nums; }
/* Sezioni separate da una linea; l'intestazione resta in cima mentre si scorre la sua sezione */
section { padding-bottom: 6px; border-top: 1px solid var(--border); }
section > h3 { position: sticky; top: 0; z-index: 1; margin: 0; background: var(--bg-alt); }
.toggle { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 12px 4px 8px; border: 0; border-radius: 0; background: transparent; text-align: left; }
.count { margin-left: auto; font-weight: 400; letter-spacing: 0; font-variant-numeric: tabular-nums; }
.chevron { width: 10px; height: 10px; transition: transform 0.12s; }
.chevron.open { transform: rotate(90deg); }
ul { margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 5px; padding: 3px 8px; cursor: default; }
li:hover { background: var(--bg-hover); }
li.selected { background: var(--accent); color: var(--accent-fg); }
li.current { font-weight: 700; }
li.folder { color: var(--fg-muted); }
/* La freccia delle cartelle in uno spazio fisso: le icone di una stessa profondità restano allineate */
.slot { display: flex; justify-content: center; width: 12px; flex: none; }
.kind { color: var(--fg-muted); }
.kind.accent { color: var(--accent); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--fg-muted); }
.head { padding: 0 5px; border: 1px solid var(--accent); border-radius: 8px; color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: 0.04em; }
li.selected .kind, li.selected .track, li.selected .head { color: inherit; border-color: currentColor; }
/* Visibili al passaggio del mouse o al focus, senza togliere i pulsanti dal layout */
.actions { display: flex; gap: 2px; opacity: 0; }
li:hover .actions, li:focus-within .actions, li.selected .actions { opacity: 1; }
.actions button { padding: 0 5px; font-size: 11px; }
.empty { margin: 0; padding: 2px 16px 8px; font-size: 12px; }
</style>
```

- [ ] **Step 6: E2E esistenti con i tag**

`test/e2e/branches.spec.ts`, test "tag annotato creato dal menu del commit…": subito dopo `const { app, page } = await launch([clone])`:

```ts
  // I tag partono chiusi nella sidebar
  await page.getByTestId('tags-header').click()
```

`test/e2e/drag.spec.ts`, test "commit sul tag…": dopo `await page.getByTestId('prompt-ok').click()`:

```ts
  await page.getByTestId('tags-header').click()
```

- [ ] **Step 7: verifica**

Run: `npm run lint && npm run typecheck && npm run build && npx playwright test test/e2e/sidebar.spec.ts test/e2e/branches.spec.ts test/e2e/drag.spec.ts test/e2e/working.spec.ts test/e2e/pull-requests.spec.ts`
Expected: PASS.

Poi la licenza nel bundle: `grep -l "Lucide Icons and Contributors" out/renderer/assets/*.js` deve trovare un file. Se il minificatore toglie il commento, si aggiunge la licenza come file a parte e lo si annota nelle note di esecuzione.

- [ ] **Step 8: screenshot nascosti**

Con uno spec temporaneo nella cartella scratchpad (copiato in `test/e2e/zz-sidebar.spec.ts` e poi rimosso), si fanno gli screenshot della sidebar in chiaro e in scuro. Il repo di prova ha:
- un remote;
- una cartella `feature/` con due branch;
- due tag;
- uno stash;
- file modificati.

Controllare:
- allineamento di icone e frecce;
- HEAD, intestazioni e separatori;
- la voce attiva dell'area di lavoro;
- che locali e remoti si distinguano.

- [ ] **Step 9: commit**

```bash
git add src/renderer src/shared/i18n test/e2e
git commit -m "feat: sidebar con area di lavoro, icone, sezioni comprimibili e HEAD; si evidenzia solo la riga cliccata

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: screenshot del README e verifica completa

**Files:**
- Modify: `docs/assets/screenshots/*.jpg` (rigenerati)
- Modify: `docs/superpowers/plans/2026-10-23-merlino-sidebar.md` (note di esecuzione)

- [ ] **Step 1: screenshot del README**

Run: `npx electron-vite build && MERLINO_SCREENSHOTS=1 npx playwright test test/e2e/readme-screenshots.spec.ts`
Expected: PASS. Le 6 immagini in `docs/assets/screenshots/` sono rigenerate con la finestra nascosta. Controllarne almeno due (`history-light.jpg`, `pull-requests-dark.jpg`): devono mostrare la nuova sidebar.

- [ ] **Step 2: verifica completa**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde.

- [ ] **Step 3: note di esecuzione e commit**

In fondo al piano, una sezione "Note di esecuzione": i commit, le deviazioni e la verifica, con i numeri.

```bash
git add docs
git commit -m "docs: screenshot del README con la nuova sidebar e note di esecuzione

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Note di esecuzione

- **Commit**: Task 1 `80b1bc2`, Task 2 `f0826ea`, Task 3 in questo commit.
- **Deviazioni dal piano**:
  - due E2E esistenti cercavano la riga di un branch col testo esatto (`^main$`, `^search$`). Ora la riga del branch corrente contiene anche HEAD, quindi il filtro guarda il nome della riga (`.name`): l'helper `branchItem` in `drag.spec.ts` e il Finish in `flow.spec.ts`;
  - la voce Local Changes è anche una destinazione del drag & drop, come la riga "Local changes" in cima alla storia.
- **Licenza delle icone**: il commento `/*! … */` di `AppIcon.vue` resta nel bundle (`out/renderer/assets/index-*.js`).
- **Screenshot**:
  - sidebar in chiaro e in scuro, con la finestra nascosta: allineamento, HEAD, separatori, voce attiva, locali colorati e remoti grigi, una sola riga evidenziata;
  - i 6 screenshot del README rigenerati: ora mostrano anche il pulsante ⤢ e quello del layout.
- **Verifica**:
  - lint e typecheck puliti;
  - 210 test unit e di integrazione (1 saltato), di cui 1 nuovo in `layout.test.ts`;
  - 49 E2E con la finestra nascosta (1 saltato: gli screenshot del README), di cui 3 nuovi in `sidebar.spec.ts`.
