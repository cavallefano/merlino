<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Commit, GraphRow } from '../../shared/types'
import { commitMenu } from '../actions/branches'
import { dragSource, dropTarget } from '../drag/drag'
import { formatShortDate } from '../history/format'
import { drawGraph, graphRight, laneColor, type NodeKind, ROW_HEIGHT } from '../history/graph-draw'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const scroller = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const scrollTop = ref(0)
const viewHeight = ref(0)
const OVERSCAN = 10
/** Margine sinistro del testo senza grafo (durante una ricerca). */
const PADDING = 10
/** Spazio fra il grafo e il testo. */
const GAP = 8

// Righe della lista: la 0 è quella delle modifiche locali, la r è il commit r − 1
const WORKING_ROW: GraphRow = { lane: 0, up: [] }
const rowCount = computed(() => repo.history.total + 1)
const hasGraph = computed(() => repo.history.lanes > 0)
const rowAt = (r: number): GraphRow | undefined => (!hasGraph.value ? undefined : r === 0 ? WORKING_ROW : repo.rowAt(r - 1))
const nodeAt = (r: number): NodeKind | undefined => {
  if (r === 0) return 'commit'
  const commit = repo.commitAt(r - 1)
  return commit && (commit.parents.length > 1 ? 'merge' : 'commit')
}

const first = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN))
const last = computed(() =>
  Math.min(rowCount.value - 1, Math.ceil((scrollTop.value + viewHeight.value) / ROW_HEIGHT) + OVERSCAN),
)
const visible = computed(() =>
  Array.from({ length: Math.max(0, last.value - first.value + 1) }, (_, k) => {
    const r = first.value + k
    return { r, commit: r === 0 ? undefined : repo.commitAt(r - 1) }
  }),
)
// Larghezza del canvas dalle sole righe visibili; il testo di ogni riga parte dopo il suo grafo (a scaletta)
const graphWidth = computed(() => {
  if (!hasGraph.value) return 0
  let max = 0
  for (let r = first.value; r <= last.value; r++) max = Math.max(max, graphRight(rowAt, r))
  return max + 2
})
const textLeft = (r: number) => (hasGraph.value ? graphRight(rowAt, r) + GAP : PADDING)

const workingSummary = computed(() => {
  const s = repo.status
  if (!s || !repo.changeCount) return 'Nessuna modifica'
  const parts: [number, string, string][] = [
    [s.staged.length, 'in stage', 'in stage'],
    [s.unstaged.length, 'modificato', 'modificati'],
    [s.untracked.length, 'non tracciato', 'non tracciati'],
    [s.conflicted.length, 'in conflitto', 'in conflitto'],
  ]
  return parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(' · ')
})

const isSelected = (r: number, commit?: Commit) =>
  r === 0 ? repo.view === 'working' : repo.view === 'commit' && commit?.sha === repo.selected
const isHead = (commit: Commit) => commit.refs.some((ref) => ref.current)

watch([first, last, () => repo.history.version], () => void repo.ensureRows(Math.max(0, first.value - 1), last.value - 1), {
  immediate: true,
})
watch([first, last, () => repo.pagesTick, graphWidth], () => void nextTick(draw))
watch(
  () => repo.selectedIndex,
  (i) => {
    if (i >= 0) reveal(i + 1)
  },
)
watch(
  () => repo.view,
  (view) => {
    if (view === 'working') reveal(0)
  },
)

function reveal(r: number) {
  const el = scroller.value
  if (!el) return
  const top = r * ROW_HEIGHT
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight
}

function draw() {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const ratio = window.devicePixelRatio || 1
  const height = Math.max(0, last.value - first.value + 1) * ROW_HEIGHT
  el.width = graphWidth.value * ratio
  el.height = height * ratio
  el.style.width = `${graphWidth.value}px`
  el.style.height = `${height}px`
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  drawGraph(ctx, rowAt, nodeAt, first.value, last.value)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(() => {
    viewHeight.value = scroller.value?.clientHeight ?? 0
  })
  if (scroller.value) observer.observe(scroller.value)
})
onUnmounted(() => observer?.disconnect())

function onScroll() {
  scrollTop.value = scroller.value?.scrollTop ?? 0
}

function select(r: number) {
  scroller.value?.focus()
  if (r === 0) {
    void repo.selectWorking()
    return
  }
  const commit = repo.commitAt(r - 1)
  if (commit) void repo.select(commit.sha, r - 1)
}

function onKey(e: KeyboardEvent) {
  const working = repo.view === 'working'
  if (e.key === 'ArrowDown') {
    if (working) select(1)
    else repo.move(1)
  } else if (e.key === 'ArrowUp') {
    if (!working && repo.selectedIndex === 0) select(0)
    else if (!working) repo.move(-1)
  } else {
    return
  }
  e.preventDefault()
}

function openMenu(r: number) {
  const commit = r > 0 ? repo.commitAt(r - 1) : undefined
  if (!commit) return
  select(r)
  void commitMenu(repo, commit)
}
</script>

<template>
  <div ref="scroller" class="list" tabindex="0" data-testid="commit-list" @scroll="onScroll" @keydown="onKey">
    <div class="content" :style="{ height: `${rowCount * ROW_HEIGHT}px` }">
      <canvas v-if="graphWidth" ref="canvas" class="graph" :style="{ top: `${first * ROW_HEIGHT}px` }" />
      <p v-if="repo.history.version && !repo.history.total" class="muted empty" :style="{ top: `${ROW_HEIGHT}px` }">Nessun commit</p>
      <div
        v-for="{ r, commit } in visible"
        :key="r"
        class="row"
        :class="{ selected: isSelected(r, commit) }"
        :style="{ top: `${r * ROW_HEIGHT}px`, paddingLeft: `${textLeft(r)}px` }"
        :data-testid="r === 0 ? 'working-row' : 'commit-row'"
        v-bind="r === 0 ? dropTarget(repo, { kind: 'working' }) : commit ? dragSource({ kind: 'commit', sha: commit.sha }) : {}"
        @click="select(r)"
        @contextmenu.prevent="openMenu(r)"
      >
        <template v-if="r === 0">
          <div class="line">
            <span class="subject">{{ workingSummary }}</span>
            <span v-if="repo.changeCount" class="files" data-testid="working-files">{{ repo.changeCount }}</span>
          </div>
          <div class="line">
            <span class="author">Modifiche locali</span>
          </div>
        </template>
        <template v-else-if="commit">
          <div class="line">
            <span class="subject" :class="{ head: isHead(commit) }">{{ commit.subject }}</span>
            <span v-if="repo.fileCountOf(commit.sha)" class="files" data-testid="commit-files">{{ repo.fileCountOf(commit.sha) }}</span>
          </div>
          <div class="line">
            <span class="author">{{ commit.author }}</span>
            <span class="spacer" />
            <template v-if="commit.refs.length">
              <span
                v-for="ref in commit.refs"
                :key="`${ref.kind}:${ref.name}`"
                class="ref"
                :class="[ref.kind, { current: ref.current }]"
                :style="ref.kind === 'remote' ? { borderLeftColor: laneColor(rowAt(r)?.lane ?? 0) } : undefined"
                :title="ref.name"
              >{{ ref.name }}</span>
            </template>
            <span v-else class="date">{{ formatShortDate(commit.authorTime) }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list { position: relative; flex: 1; min-height: 0; overflow: auto; outline: none; }
.content { position: relative; }
.graph { position: absolute; left: 0; z-index: 1; pointer-events: none; }
.row { position: absolute; left: 0; right: 0; height: 46px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding-right: 10px; cursor: default; }
.row:hover { background: var(--bg-hover); }
.row.selected { background: var(--selected-bg); }
.line { display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; }
.subject { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.subject.head { font-weight: 700; }
.files { flex: none; padding: 0 5px; border-radius: 4px; background: var(--bg-hover); font-size: 11px; line-height: 16px; font-variant-numeric: tabular-nums; }
/* L'autore tiene la sua larghezza (fino al 40%): si accorciano prima le etichette */
.author { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; font-style: italic; color: var(--fg-muted); }
.date { flex: none; font-size: 12px; color: var(--fg-muted); font-variant-numeric: tabular-nums; }
.ref { flex: 0 1 auto; min-width: 24px; overflow: hidden; text-overflow: ellipsis; padding: 0 6px; border-radius: 4px; font-size: 11px; line-height: 17px; }
.ref.tag { background: var(--ref-tag-bg); color: var(--ref-tag-fg); }
.ref.branch { background: var(--accent); color: var(--accent-fg); }
.ref.remote { background: var(--ref-remote-bg); border-left: 3px solid; padding-left: 5px; }
.ref.head { border: 1px solid var(--accent); color: var(--accent); }
.ref.current { font-weight: 700; }
.empty { position: absolute; left: 0; margin: 0; padding: 12px; }
</style>
