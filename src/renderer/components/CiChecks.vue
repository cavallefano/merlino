<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CheckState, CiStatus } from '../../shared/types'
import { t } from '../i18n'
import { ciGroups, formatDuration, span } from '../pull-requests/model'
import CiProgress from './CiProgress.vue'

const props = defineProps<{ status: CiStatus; now: number; pr: number }>()
/** Oltre questi job compare il filtro. */
const FILTER_FROM = 20
const SYMBOL: Record<CheckState, string> = { passed: '✓', failed: '✕', running: '●', queued: '○', skipped: '–', cancelled: '–' }

const query = ref('')
/** Gruppi aperti o chiusi dall'utente; '' è il gruppo degli altri controlli. */
const toggled = reactive(new Map<string, boolean>())
watch(
  () => props.pr,
  () => {
    toggled.clear()
    query.value = ''
  },
)

const key = (name: string | null) => name ?? ''
const groups = computed(() => {
  const all = ciGroups(props.status.checks, props.now)
  const q = query.value.trim().toLowerCase()
  // All'inizio aperti i gruppi con job falliti o in corso
  if (!q) return all.map((g) => ({ ...g, open: toggled.get(key(g.name)) ?? (g.state === 'failed' || g.state === 'running') }))
  // Con il filtro: solo i gruppi con risultati, aperti (il nome del gruppo vale per tutti i suoi job)
  return all.flatMap((g) => {
    const checks = (g.name ?? '').toLowerCase().includes(q) ? g.checks : g.checks.filter((c) => c.name.toLowerCase().includes(q))
    return checks.length ? [{ ...g, checks, open: true }] : []
  })
})

const duration = (seconds: number | null) => (seconds === null ? '' : formatDuration(seconds))
</script>

<template>
  <div class="ci-checks">
    <p v-if="!status.checks.length" class="muted note">{{ t('ci.none') }}</p>
    <template v-else>
      <header>
        <CiProgress :status="status" :now="now" />
        <input v-if="status.checks.length > FILTER_FROM" v-model="query" data-testid="ci-filter" :placeholder="t('ci.filter')" />
      </header>
      <section v-for="g in groups" :key="key(g.name)" class="group" data-testid="ci-group">
        <button class="head" :aria-expanded="g.open" data-testid="ci-group-head" @click="toggled.set(key(g.name), !g.open)">
          <span class="twisty">{{ g.open ? '▾' : '▸' }}</span>
          <span class="ci" :class="g.state">{{ SYMBOL[g.state] }}</span>
          <span class="name">{{ g.name ?? t('ci.otherChecks') }}</span>
          <span class="muted count">{{ g.done }}/{{ g.total }}</span>
          <span class="muted time">{{ duration(g.duration) }}</span>
        </button>
        <ul v-if="g.open">
          <li v-for="(c, i) in g.checks" :key="i" data-testid="ci-job">
            <span class="ci" :class="c.state">{{ SYMBOL[c.state] }}</span>
            <span class="name">{{ c.name }}</span>
            <span class="muted time">{{ c.state === 'queued' ? t('ci.queuedLabel') : duration(span([c], now)) }}</span>
            <a v-if="c.url" :href="c.url" target="_blank">{{ t('ci.details') }}</a>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ci-checks { flex: 1; min-height: 0; overflow: auto; padding: 8px 12px; }
header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.group { border-bottom: 1px solid var(--border); }
.head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 0; border: 0; border-radius: 0; background: transparent; text-align: left; }
.head:hover { background: var(--bg-hover); }
.twisty { width: 10px; font-size: 10px; color: var(--fg-muted); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count, .time { font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.time { min-width: 64px; text-align: right; }
ul { margin: 0 0 6px; padding: 0 0 0 16px; list-style: none; }
li { display: flex; align-items: center; gap: 6px; padding: 1px 0; font-size: 12px; }
.ci { width: 12px; font-weight: 700; text-align: center; color: var(--fg-muted); }
.ci.passed { color: #2da44e; }
.ci.failed { color: var(--danger); }
.ci.running { color: #bf8700; }
.note { margin: 0; }
</style>
