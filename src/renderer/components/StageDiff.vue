<script setup lang="ts">
import { computed } from 'vue'
import { changedKeys, lineKey } from '../../shared/patch'
import type { DiffLine, FileDiff } from '../../shared/types'
import { renderSegments, wordSegments } from '../history/diff-model'
import { highlighter } from '../history/highlight'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string; diff: FileDiff }>()
const repo = useRepoStore(props.root)
const area = computed(() => repo.working?.area)
/** Blocchi e righe solo per file modificati (in stage o no) e con gli spazi non ignorati. */
const editable = computed(
  () => repo.working?.file.status === 'M' && (area.value === 'staged' || area.value === 'unstaged') && !repo.diffOptions.ignoreWhitespace,
)
const highlight = computed(() => highlighter(props.diff.path))
const segments = computed(() => new Map(props.diff.hunks.flatMap((h) => [...wordSegments(h)])))

function html(line: DiffLine): string {
  const s = segments.value.get(line)
  return s ? renderSegments(s) : highlight.value(line.text)
}

const sign = (line: DiffLine) => (line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' ')
const confirmDiscard = (what: string) => window.confirm(`Scartare ${what}? Le modifiche andranno perse.`)

function discardHunk(hunk: number) {
  if (confirmDiscard('questo blocco')) void repo.applyLines('discard', changedKeys(props.diff, hunk))
}

function discardLines() {
  if (confirmDiscard(`${repo.selectedLines.size} righe`)) void repo.applyLines('discard')
}

function onLine(e: MouseEvent, hunk: number, index: number, line: DiffLine) {
  if (editable.value && line.type !== 'context') repo.toggleLine(lineKey(hunk, index), e.shiftKey)
}
</script>

<template>
  <div class="stage-diff">
    <div v-if="repo.selectedLines.size" class="selection">
      <span>{{ repo.selectedLines.size }} righe selezionate</span>
      <template v-if="area === 'unstaged'">
        <button data-testid="lines-stage" @click="repo.applyLines('stage')">Aggiungi righe</button>
        <button data-testid="lines-discard" @click="discardLines">Scarta righe</button>
      </template>
      <button v-else data-testid="lines-unstage" @click="repo.applyLines('unstage')">Togli righe</button>
      <button @click="repo.clearSelection()">Annulla</button>
    </div>
    <p v-if="diff.binary" class="note muted">File binario</p>
    <p v-else-if="diff.tooLarge" class="note muted">Diff troppo grande per essere mostrato</p>
    <p v-else-if="!diff.hunks.length" class="note muted">Nessuna modifica al contenuto</p>
    <div v-else class="hunks">
      <template v-for="(h, hi) in diff.hunks" :key="hi">
        <div class="hunk">
          <span class="header">{{ h.header }}</span>
          <template v-if="editable">
            <template v-if="area === 'unstaged'">
              <button data-testid="hunk-stage" @click="repo.applyLines('stage', changedKeys(diff, hi))">Aggiungi blocco</button>
              <button data-testid="hunk-discard" @click="discardHunk(hi)">Scarta blocco</button>
            </template>
            <button v-else data-testid="hunk-unstage" @click="repo.applyLines('unstage', changedKeys(diff, hi))">Togli blocco</button>
          </template>
        </div>
        <div
          v-for="(l, li) in h.lines"
          :key="li"
          class="line"
          :class="[l.type, { selected: repo.selectedLines.has(lineKey(hi, li)), selectable: editable && l.type !== 'context' }]"
          data-testid="stage-line"
          @click="onLine($event, hi, li, l)"
        >
          <span class="no">{{ l.oldNo ?? '' }}</span>
          <span class="no">{{ l.newNo ?? '' }}</span>
          <span class="sign">{{ sign(l) }}</span>
          <code v-html="html(l)" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.stage-diff { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.selection { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); font-size: 12px; }
.selection span { flex: 1; }
.selection button, .hunk button { padding: 0 8px; font-size: 11px; }
.note { padding: 12px; }
.hunks { flex: 1; min-height: 0; overflow: auto; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: var(--code-size, 12px); tab-size: var(--tab-size, 4); }
.hunk { display: flex; align-items: center; gap: 6px; padding: 2px 8px; background: var(--bg-alt); color: var(--fg-muted); }
.hunk .header { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { display: grid; grid-template-columns: 44px 44px 16px 1fr; line-height: 18px; content-visibility: auto; contain-intrinsic-size: auto 18px; }
.line code { white-space: pre; }
.line.selectable { cursor: pointer; }
.no { padding-right: 6px; color: var(--fg-muted); text-align: right; user-select: none; }
.sign { color: var(--fg-muted); user-select: none; }
.add { background: var(--add-bg); }
.del { background: var(--del-bg); }
.line.selected { outline: 1px solid var(--accent); outline-offset: -1px; background: color-mix(in srgb, var(--accent) 25%, transparent); }
.add :deep(mark) { background: var(--add-mark); color: inherit; }
.del :deep(mark) { background: var(--del-mark); color: inherit; }
</style>
