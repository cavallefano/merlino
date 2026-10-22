<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatDate } from '../history/format'
import { drawGraph, LANE_WIDTH, MAX_LANES, ROW_HEIGHT } from '../history/graph-draw'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const scroller = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const scrollTop = ref(0)
const viewHeight = ref(0)
const OVERSCAN = 10

const first = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN))
const last = computed(() =>
  Math.min(repo.history.total - 1, Math.ceil((scrollTop.value + viewHeight.value) / ROW_HEIGHT) + OVERSCAN),
)
const visible = computed(() =>
  Array.from({ length: Math.max(0, last.value - first.value + 1) }, (_, k) => {
    const i = first.value + k
    return { i, commit: repo.commitAt(i) }
  }),
)
const graphWidth = computed(() => (repo.history.lanes ? Math.min(repo.history.lanes, MAX_LANES) * LANE_WIDTH + 8 : 0))

watch([first, last, () => repo.history.version], () => void repo.ensureRows(first.value, last.value), { immediate: true })
watch([first, last, () => repo.pagesTick, graphWidth], () => void nextTick(draw))
watch(
  () => repo.selectedIndex,
  (i) => {
    const el = scroller.value
    if (!el || i < 0) return
    const top = i * ROW_HEIGHT
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight
  },
)

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
  drawGraph(ctx, repo.rowAt, first.value, last.value)
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

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') repo.move(1)
  else if (e.key === 'ArrowUp') repo.move(-1)
  else return
  e.preventDefault()
}

function select(i: number) {
  const commit = repo.commitAt(i)
  if (commit) void repo.select(commit.sha, i)
  scroller.value?.focus()
}
</script>

<template>
  <div ref="scroller" class="list" tabindex="0" data-testid="commit-list" @scroll="onScroll" @keydown="onKey">
    <p v-if="repo.history.version && !repo.history.total" class="muted empty">Nessun commit</p>
    <div class="content" :style="{ height: `${repo.history.total * ROW_HEIGHT}px` }">
      <canvas v-if="graphWidth" ref="canvas" class="graph" :style="{ top: `${first * ROW_HEIGHT}px` }" />
      <div
        v-for="{ i, commit } in visible"
        :key="i"
        class="row"
        :class="{ selected: commit && commit.sha === repo.selected }"
        :style="{ top: `${i * ROW_HEIGHT}px`, paddingLeft: `${graphWidth + 8}px` }"
        data-testid="commit-row"
        @click="select(i)"
      >
        <template v-if="commit">
          <span
            v-for="r in commit.refs"
            :key="`${r.kind}:${r.name}`"
            class="ref"
            :class="[r.kind, { current: r.current }]"
          >{{ r.name }}</span>
          <span class="subject">{{ commit.subject }}</span>
          <span class="author">{{ commit.author }}</span>
          <span class="date">{{ formatDate(commit.authorTime) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list { position: relative; flex: 1; min-height: 0; overflow: auto; outline: none; }
.content { position: relative; }
.graph { position: absolute; left: 0; z-index: 1; pointer-events: none; }
.row { position: absolute; left: 0; right: 0; height: 24px; display: flex; align-items: center; gap: 6px; padding-right: 8px; white-space: nowrap; cursor: default; }
.row:hover { background: var(--bg-hover); }
.row.selected { background: var(--accent); color: var(--accent-fg); }
.row.selected .author, .row.selected .date { color: inherit; }
.subject { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.author { width: 140px; overflow: hidden; text-overflow: ellipsis; color: var(--fg-muted); }
.date { width: 140px; text-align: right; color: var(--fg-muted); font-variant-numeric: tabular-nums; }
.ref { padding: 0 6px; border: 1px solid currentColor; border-radius: 9px; font-size: 11px; line-height: 16px; }
.ref.branch { color: var(--accent); }
.row.selected .ref { color: inherit; }
.ref.remote { color: var(--fg-muted); }
.ref.tag { color: #b7791f; }
.ref.current { font-weight: 700; }
.empty { padding: 12px; }
</style>
