<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import type { CiStatus, PullRequestFilter } from '../../shared/types'
import { formatShortDate } from '../history/format'
import { t, tn } from '../i18n'
import { headLabel, isActive } from '../pull-requests/model'
import { useAppStore } from '../stores/app'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import CiProgress from './CiProgress.vue'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
const app = useAppStore()
const FILTERS: PullRequestFilter[] = ['open', 'merged', 'closed', 'all']
const SYMBOL: Record<CiStatus['summary'], string> = { passed: '✓', failed: '✕', running: '●', none: '' }
const ciOf = (sha: string) => prs.ci.get(sha)

/** Server del remote scelto, se non c'è un account per lui. */
const missing = computed(() => (prs.current && !prs.current.account ? prs.current.host : null))

function connect(host: string) {
  app.openAccountDialog({ service: host.includes('gitlab') ? 'gitlab' : 'github', host })
}

function updateToken() {
  const a = prs.current?.account
  if (a) app.openAccountDialog({ service: a.service, host: a.host })
}

// Finché la vista è aperta, le CI in corso si ricontrollano ogni 30 s
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => void prs.poll(), 30_000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section class="prs">
    <div class="bar">
      <input v-model="prs.query" data-testid="pr-search" :placeholder="t('pr.search')" />
      <select :value="prs.filter" data-testid="pr-filter" @change="prs.setFilter(($event.target as HTMLSelectElement).value as PullRequestFilter)">
        <option v-for="f in FILTERS" :key="f" :value="f">{{ t(`pr.filter.${f}`) }}</option>
      </select>
      <select v-if="prs.withAccount.length > 1" :value="prs.remote" data-testid="pr-remote" @change="prs.setRemote(($event.target as HTMLSelectElement).value)">
        <option v-for="r in prs.withAccount" :key="r.name" :value="r.name">{{ r.name }}</option>
      </select>
      <button data-testid="pr-new" :disabled="!prs.current?.account" @click="prs.creating = { branch: repo.info?.branch ?? '' }">{{ t('action.pr.create') }}</button>
      <button data-testid="pr-reload" :aria-label="t('action.repo.refresh')" :disabled="!prs.current?.account" @click="prs.refresh()">↻</button>
    </div>
    <p v-if="prs.error" class="band" data-testid="pr-error">
      <span>{{ prs.error.message }}</span>
      <button v-if="prs.error.code === 'auth'" data-testid="pr-update-token" @click="updateToken">{{ t('pr.updateToken') }}</button>
      <button :aria-label="t('common.closeError')" @click="prs.error = null">×</button>
    </p>
    <div v-if="missing" class="center" data-testid="pr-no-account">
      <p>{{ t('pr.noAccount', { host: missing }) }}</p>
      <button class="primary" data-testid="pr-connect" @click="connect(missing)">{{ t('pr.connect') }}</button>
    </div>
    <p v-else-if="!prs.current" class="center muted">{{ t('pr.noRemote') }}</p>
    <p v-else-if="prs.list && !prs.visible.length" class="center muted">{{ t('pr.none') }}</p>
    <ul v-else class="rows">
      <li
        v-for="p in prs.visible"
        :key="p.number"
        :class="{ selected: p.number === prs.selected }"
        data-testid="pr-row"
        @click="prs.select(p.number)"
      >
        <div class="first">
          <span class="number">#{{ p.number }}</span>
          <span class="title">{{ p.title }}</span>
          <span v-if="p.draft" class="badge">{{ t('pr.draft') }}</span>
          <span v-if="ciOf(p.head.sha)" class="ci" :class="ciOf(p.head.sha)?.summary" data-testid="pr-ci" :data-state="ciOf(p.head.sha)?.summary">
            {{ SYMBOL[ciOf(p.head.sha)?.summary ?? 'none'] }}
          </span>
        </div>
        <div class="second muted">
          {{ p.author }} · {{ formatShortDate(p.updatedAt) }} · <code>{{ headLabel(p) }} → {{ p.base.branch }}</code>
          <template v-if="p.comments"> · {{ tn('pr.comments', p.comments) }}</template>
        </div>
        <CiProgress
          v-if="ciOf(p.head.sha) && isActive(ciOf(p.head.sha)!)"
          class="third"
          :status="ciOf(p.head.sha)!"
          :now="prs.now"
          @click.stop="prs.select(p.number, 'checks')"
        />
      </li>
    </ul>
    <p v-if="prs.stale" class="muted stale" data-testid="pr-stale">{{ t('pr.stale') }}</p>
  </section>
</template>

<style scoped>
.prs { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--border); }
.bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.bar input { flex: 1; min-width: 80px; }
.bar button { padding: 2px 8px; white-space: nowrap; }
.band { display: flex; align-items: center; gap: 8px; margin: 0; padding: 6px 10px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.band span { flex: 1; }
.band button { padding: 1px 8px; }
.band button:last-child { border: 0; background: transparent; }
.rows { flex: 1; min-height: 0; margin: 0; padding: 0; overflow: auto; list-style: none; }
.rows li { padding: 5px 10px; border-bottom: 1px solid var(--border); cursor: default; }
.rows li:hover { background: var(--bg-hover); }
.rows li.selected { background: var(--selected-bg); }
.first, .second { display: flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; }
.second { margin-top: 2px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; display: block; }
.number { color: var(--fg-muted); font-variant-numeric: tabular-nums; }
.title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.badge { padding: 0 6px; border-radius: 8px; background: var(--bg-hover); font-size: 11px; color: var(--fg-muted); }
.ci { font-weight: 700; }
.ci.passed { color: #2da44e; }
.ci.failed { color: var(--danger); }
.ci.running { color: #bf8700; }
.third { margin-top: 4px; cursor: pointer; }
.stale { margin: 0; padding: 4px 10px; font-size: 12px; border-top: 1px solid var(--border); }
</style>
