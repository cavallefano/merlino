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
