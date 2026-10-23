<script setup lang="ts">
import { computed } from 'vue'
import type { CheckState, CiStatus } from '../../shared/types'
import { tn } from '../i18n'
import { ciProgress, formatDuration } from '../pull-requests/model'

const props = defineProps<{ status: CiStatus; now: number }>()
// Segmenti in quest'ordine; annullati e saltati insieme
const SEGMENTS: { states: CheckState[]; cls: string }[] = [
  { states: ['passed'], cls: 'passed' },
  { states: ['failed'], cls: 'failed' },
  { states: ['skipped', 'cancelled'], cls: 'skipped' },
  { states: ['running'], cls: 'running' },
  { states: ['queued'], cls: 'queued' },
]
const ORDER: CheckState[] = ['passed', 'failed', 'running', 'queued', 'skipped', 'cancelled']

const p = computed(() => ciProgress(props.status))
const segments = computed(() =>
  SEGMENTS.map((s) => ({ cls: s.cls, n: s.states.reduce((sum, state) => sum + p.value.counts[state], 0) })).filter((s) => s.n > 0),
)
/** "10 passed · 1 failed · 3 in progress · 26 queued" */
const title = computed(() =>
  ORDER.filter((s) => p.value.counts[s] > 0)
    .map((s) => tn(`ci.${s}`, p.value.counts[s]))
    .join(' · '),
)
/** "14/40 · test · 6 min"; con dei falliti "9/40 · 1 failed · 3 min" */
const text = computed(() =>
  [
    `${p.value.done}/${p.value.total}`,
    p.value.counts.failed ? tn('ci.failed', p.value.counts.failed) : p.value.current,
    p.value.startedAt === null ? null : formatDuration(props.now - p.value.startedAt),
  ]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <div class="ci-progress" :title="title" data-testid="ci-progress">
    <div class="bar" role="progressbar" aria-valuemin="0" :aria-valuenow="p.done" :aria-valuemax="p.total" :aria-label="title">
      <span v-for="s in segments" :key="s.cls" :class="s.cls" :style="{ flexGrow: s.n }" />
    </div>
    <span class="text" data-testid="ci-progress-text">{{ text }}</span>
  </div>
</template>

<style scoped>
.ci-progress { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--fg-muted); }
.bar { display: flex; flex: 0 0 140px; height: 6px; overflow: hidden; border-radius: 3px; background: var(--bg-hover); }
.bar span { flex-basis: 0; }
.passed { background: #2da44e; }
.failed { background: var(--danger); }
.skipped { background: var(--border); }
.running { background: #bf8700; animation: pulse 1.6s ease-in-out infinite; }
.queued { background: var(--bg-hover); }
.text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
@keyframes pulse { 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .running { animation: none; } }
</style>
