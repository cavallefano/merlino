<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { StashEntry } from '../../shared/types'
import { branchMenu, remoteBranchMenu, remoteMenu, tagMenu } from '../actions/branches'
import { dragSource, dropTarget } from '../drag/drag'
import type { DragSource, DropTarget } from '../drag/drop-actions'
import { treeRows } from '../history/branch-tree'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

interface Row {
  key: string
  depth: number
  label: string
  /** Chiave in collapsed, se la riga è una cartella. */
  folder?: string
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

// Sezioni e cartelle chiuse. Le cartelle sono "<gruppo>:<percorso>" (gruppo: heads o remotes/<nome>), i remote "remotes/<nome>".
const collapsed = reactive(new Set<string>())

function toggle(key: string) {
  if (!collapsed.delete(key)) collapsed.add(key)
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
    sha: b.sha,
    current: b.current,
    track: [b.ahead && `↑${b.ahead}`, b.behind && `↓${b.behind}`].filter(Boolean).join(' '),
    title: b.upstream ? `${b.name} → ${b.upstream}${b.gone ? ' (non esiste più sul remote)' : ''}` : b.name,
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
      title: remote.url,
      testid: 'remote-item',
      menu: () => remoteMenu(repo, remote),
      drop: { kind: 'remote', name: remote.name },
    }
    if (collapsed.has(key)) return [header]
    const branches = tree(key, remote.branches, 1, (b) => ({
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
    (t): Row => ({ key: t.name, depth: 0, label: t.name, sha: t.sha, testid: 'tag-item', menu: () => tagMenu(repo, t), drag: { kind: 'tag', name: t.name } }),
  ),
)

const sections = computed(() => [
  { title: 'Branch', rows: branchRows.value, empty: 'Nessun branch', drop: { kind: 'branchesHeader' } as DropTarget, testid: 'branches-header' },
  { title: 'Remote', rows: remoteRows.value, empty: 'Nessun remote', drop: undefined, testid: 'remotes-header' },
  { title: 'Tag', rows: tagRows.value, empty: 'Nessun tag', drop: { kind: 'tagsHeader' } as DropTarget, testid: 'tags-header' },
])

/** Attributi di drag & drop di una riga o di un'intestazione. */
const dnd = (source?: DragSource, target?: DropTarget) => ({ ...(source ? dragSource(source) : {}), ...(target ? dropTarget(repo, target) : {}) })

const isSelected = (sha: string | undefined) => repo.view === 'commit' && !!sha && repo.selected === sha

function click(row: Row) {
  if (row.folder) toggle(row.folder)
  else if (row.sha) void repo.select(row.sha)
}

function drop(stash: StashEntry) {
  if (window.confirm(`Eliminare lo stash "${stash.message}"? Non si può annullare.`)) void repo.stashAction('drop', stash.ref)
}
</script>

<template>
  <aside class="sidebar">
    <section v-for="s in sections" :key="s.title">
      <h3 v-bind="dnd(undefined, s.drop)" :data-testid="s.testid" @click="toggle(s.title)">{{ s.title }}</h3>
      <template v-if="!collapsed.has(s.title)">
        <p v-if="!s.rows.length" class="muted empty">{{ s.empty }}</p>
        <ul>
          <li
            v-for="row in s.rows"
            :key="row.key"
            v-bind="dnd(row.drag, row.drop)"
            :class="{ folder: row.folder, current: row.current, selected: isSelected(row.sha) }"
            :style="{ paddingLeft: `${16 + row.depth * 12}px` }"
            :title="row.title ?? row.label"
            :data-testid="row.testid"
            @click="click(row)"
            @dblclick="row.open?.()"
            @contextmenu.prevent="row.menu?.()"
          >
            <span v-if="row.folder" class="twisty">{{ collapsed.has(row.folder) ? '▸' : '▾' }}</span>
            <span class="name">{{ row.label }}</span>
            <span v-if="row.track" class="track">{{ row.track }}</span>
          </li>
        </ul>
      </template>
    </section>
    <section>
      <h3 v-bind="dnd(undefined, { kind: 'stashHeader' })" data-testid="stash-header" @click="toggle('Stash')">Stash <span class="muted">{{ repo.stashes.length }}</span></h3>
      <template v-if="!collapsed.has('Stash')">
        <p v-if="!repo.stashes.length" class="muted empty">Nessuno stash</p>
        <ul>
          <li
            v-for="s in repo.stashes"
            :key="s.ref"
            v-bind="dnd({ kind: 'stash', ref: s.ref, sha: s.sha })"
            :class="{ selected: isSelected(s.sha) }"
            :title="s.message"
            data-testid="stash-item"
            @click="repo.select(s.sha)"
          >
            <span class="name">{{ s.message }}</span>
            <span class="actions" @click.stop>
              <button data-testid="stash-apply" title="Applica" @click="repo.stashAction('apply', s.ref)">Applica</button>
              <button data-testid="stash-pop" title="Applica ed elimina" @click="repo.stashAction('pop', s.ref)">Pop</button>
              <button data-testid="stash-drop" title="Elimina" @click="drop(s)">✕</button>
            </span>
          </li>
        </ul>
      </template>
    </section>
  </aside>
</template>

<style scoped>
.sidebar { min-width: 0; min-height: 0; overflow: auto; background: var(--bg-alt); border-right: 1px solid var(--border); user-select: none; }
h3 { margin: 0; padding: 8px 12px 4px; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fg-muted); cursor: default; }
ul { margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 4px; padding: 3px 8px 3px 16px; cursor: default; }
li:hover { background: var(--bg-hover); }
li.selected { background: var(--accent); color: var(--accent-fg); }
li.current { font-weight: 700; }
li.folder { color: var(--fg-muted); }
.twisty { width: 10px; font-size: 10px; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--fg-muted); }
li.selected .track { color: inherit; }
/* Visibili al passaggio del mouse o al focus, senza togliere i pulsanti dal layout */
.actions { display: flex; gap: 2px; opacity: 0; }
li:hover .actions, li:focus-within .actions, li.selected .actions { opacity: 1; }
.actions button { padding: 0 5px; font-size: 11px; }
.empty { margin: 0; padding: 2px 16px 8px; font-size: 12px; }
</style>
