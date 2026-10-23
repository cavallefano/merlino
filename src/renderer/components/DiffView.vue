<script setup lang="ts">
import { computed } from 'vue'
import type { DiffLine, FileDiff } from '../../shared/types'
import { renderSegments, splitRows, wordSegments } from '../history/diff-model'
import { highlighter } from '../history/highlight'

const props = defineProps<{ diff: FileDiff; split: boolean }>()
const emit = defineEmits<{ force: [] }>()

const highlight = computed(() => highlighter(props.diff.path))
const segments = computed(() => new Map(props.diff.hunks.flatMap((h) => [...wordSegments(h)])))
const sides = computed(() => (props.split ? props.diff.hunks.map((h) => ({ header: h.header, rows: splitRows(h) })) : []))

// ponytail: le righe con parole evidenziate perdono i colori della sintassi; unire le due cose quando servirà
function html(line: DiffLine): string {
  const s = segments.value.get(line)
  return s ? renderSegments(s) : highlight.value(line.text)
}

const sign = (line: DiffLine) => (line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' ')
</script>

<template>
  <div class="diff">
    <p v-if="diff.binary" class="note muted">File binario</p>
    <p v-else-if="diff.tooLarge" class="note">
      Diff troppo grande.
      <button @click="emit('force')">Mostra comunque</button>
    </p>
    <p v-else-if="!diff.hunks.length" class="note muted">Nessuna modifica al contenuto</p>
    <div v-else-if="!split" class="unified">
      <template v-for="(h, hi) in diff.hunks" :key="hi">
        <div class="hunk">{{ h.header }}</div>
        <div v-for="(l, li) in h.lines" :key="li" class="line" :class="l.type" :data-testid="`diff-line-${l.type}`">
          <span class="no">{{ l.oldNo ?? '' }}</span>
          <span class="no">{{ l.newNo ?? '' }}</span>
          <span class="sign">{{ sign(l) }}</span>
          <code v-html="html(l)" />
        </div>
      </template>
    </div>
    <div v-else class="split" data-testid="diff-split-view">
      <template v-for="(h, hi) in sides" :key="hi">
        <div class="hunk">{{ h.header }}</div>
        <div v-for="(r, ri) in h.rows" :key="ri" class="pair">
          <div class="line" :class="r.left?.type ?? 'empty'">
            <span class="no">{{ r.left?.oldNo ?? '' }}</span>
            <code v-if="r.left" v-html="html(r.left)" />
          </div>
          <div class="line" :class="r.right?.type ?? 'empty'">
            <span class="no">{{ r.right?.newNo ?? '' }}</span>
            <code v-if="r.right" v-html="html(r.right)" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diff { flex: 1; min-height: 0; overflow: auto; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.note { padding: 12px; font-family: system-ui, sans-serif; }
.hunk { padding: 2px 8px; color: var(--fg-muted); background: var(--bg-alt); }
.line { display: grid; grid-template-columns: 44px 44px 16px 1fr; line-height: 18px; content-visibility: auto; contain-intrinsic-size: auto 18px; }
.line code { white-space: pre; }
.no { padding-right: 6px; color: var(--fg-muted); text-align: right; user-select: none; }
.sign { color: var(--fg-muted); user-select: none; }
.add { background: var(--add-bg); }
.del { background: var(--del-bg); }
.empty { background: var(--bg-alt); }
.add :deep(mark) { background: var(--add-mark); color: inherit; }
.del :deep(mark) { background: var(--del-mark); color: inherit; }
.pair { display: grid; grid-template-columns: 1fr 1fr; }
.pair .line { grid-template-columns: 44px 1fr; overflow: hidden; }
</style>
