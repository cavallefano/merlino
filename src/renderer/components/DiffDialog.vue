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
  // Il fuoco al popup, non al primo pulsante (che mostrerebbe l'anello); ↑ e ↓ arrivano comunque a onKey
  el.focus()
})

onBeforeUnmount(() => {
  const el = dialog.value
  if (el) layout.dialog = { width: el.offsetWidth, height: el.offsetHeight }
  // Anche quando il popup sparisce con la sua scheda: tornando sulla scheda resta chiuso
  repo.diffDialog = null
})
</script>

<template>
  <dialog ref="dialog" class="diff-dialog" data-testid="diff-dialog" tabindex="-1" @cancel.prevent="close" @keydown="onKey">
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
.diff-dialog:focus { outline: none; }
.bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 12px; }
.bar button { padding: 1px 8px; font-size: 12px; }
.path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.position { font-variant-numeric: tabular-nums; }
.close { border: 0; background: transparent; font-size: 16px; }
</style>
