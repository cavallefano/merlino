<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CheckState, CiStatus } from '../../shared/types'
import { popup } from '../actions/branches'
import { formatDate, formatShortDate } from '../history/format'
import { t, tn } from '../i18n'
import { headLabel } from '../pull-requests/model'
import { type PullRequestTab, usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import CiChecks from './CiChecks.vue'
import CommitDetail from './CommitDetail.vue'
import DiffView from './DiffView.vue'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
const TABS: PullRequestTab[] = ['conversation', 'commits', 'changes', 'checks']
const STATES: CheckState[] = ['failed', 'running', 'queued', 'passed', 'skipped', 'cancelled']
const SYMBOL: Record<CheckState | CiStatus['summary'], string> = { passed: '✓', failed: '✕', running: '●', queued: '○', skipped: '–', cancelled: '–', none: '' }

const d = computed(() => prs.detail)
const ci = computed(() => (d.value ? prs.ci.get(d.value.head.sha) : undefined))
/** "4 passed · 1 failed" */
const ciText = computed(() =>
  STATES.map((s) => [s, ci.value?.checks.filter((c) => c.state === s).length ?? 0] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => tn(`ci.${s}`, n))
    .join(' · '),
)
const state = computed(() => (d.value?.state === 'open' && d.value.draft ? 'draft' : (d.value?.state ?? 'open')))
const commitCount = computed(() => prs.changes?.commits.length ?? d.value?.timeline.filter((x) => x.kind === 'commit').length ?? 0)
const comment = ref('')

watch(
  () => prs.selected,
  () => {
    comment.value = ''
  },
)

function tabLabel(tab: PullRequestTab): string {
  if (tab === 'conversation') return t('pr.tab.conversation')
  if (tab === 'commits') return `${t('pr.tab.commits')} (${commitCount.value})`
  if (tab === 'checks') return ci.value ? `${t('pr.tab.checks')} (${ci.value.checks.length})` : t('pr.tab.checks')
  return prs.changes ? `${t('pr.tab.changes')} (${prs.changes.files.length})` : t('pr.tab.changes')
}

async function send() {
  if (!comment.value.trim() || prs.busy) return
  if (await prs.comment(comment.value)) comment.value = ''
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
  // ⌘↩ qui invia il commento, non il commit delle modifiche locali
  e.preventDefault()
  e.stopPropagation()
  void send()
}

function more() {
  const url = d.value?.url
  if (!url) return
  void popup([
    { label: t('pr.openInBrowser'), run: () => window.open(url) },
    { label: t('pr.copyLink'), run: () => navigator.clipboard.writeText(url) },
  ])
}
</script>

<template>
  <section class="detail">
    <p v-if="!d" class="muted center">{{ t('pr.select') }}</p>
    <template v-else>
      <header class="head">
        <h2 data-testid="pr-title">{{ d.title }} <span class="muted">#{{ d.number }}</span></h2>
        <div class="meta">
          <span class="state" :class="state" data-testid="pr-state">{{ t(`pr.state.${state}`) }}</span>
          <span>{{ d.author }}</span>
          <code>{{ headLabel(d) }} → {{ d.base.branch }}</code>
          <button v-if="ci && ci.summary !== 'none'" class="link" :class="ci.summary" data-testid="pr-ci-summary" @click="prs.setTab('checks')">
            {{ SYMBOL[ci.summary] }} {{ ciText }}
          </button>
        </div>
        <div class="actions">
          <button data-testid="pr-checkout" :disabled="!!repo.busy" @click="prs.checkout()">Checkout</button>
          <template v-if="d.state === 'open'">
            <button class="primary" data-testid="pr-merge" :disabled="prs.busy" @click="prs.merging = true">{{ t('pr.merge') }}</button>
            <button data-testid="pr-close" :disabled="prs.busy" @click="prs.setState('closed')">{{ t('pr.close') }}</button>
          </template>
          <button v-else-if="d.state === 'closed'" data-testid="pr-reopen" :disabled="prs.busy" @click="prs.setState('open')">{{ t('pr.reopen') }}</button>
          <button :aria-label="t('pr.more')" data-testid="pr-more" @click="more">…</button>
        </div>
      </header>
      <nav class="tabs">
        <button v-for="tab in TABS" :key="tab" :class="{ active: prs.tab === tab }" :data-testid="`pr-tab-${tab}`" @click="prs.setTab(tab)">
          {{ tabLabel(tab) }}
        </button>
      </nav>

      <div v-if="prs.tab === 'conversation'" class="conversation">
        <MarkdownView v-if="d.body.trim()" :source="d.body" />
        <p v-else class="muted">{{ t('pr.noDescription') }}</p>
        <template v-for="item in d.timeline" :key="item.kind === 'commit' ? `c:${item.sha}` : `n:${item.id}`">
          <article v-if="item.kind === 'comment'" class="comment" data-testid="timeline-comment">
            <header><strong>{{ item.author }}</strong> <span class="muted">{{ formatDate(item.time) }}</span></header>
            <MarkdownView :source="item.body" />
          </article>
          <button v-else class="commit link" data-testid="timeline-commit" @click="prs.openCommit(item.sha)">
            <code>{{ item.sha.slice(0, 7) }}</code> {{ item.subject }}
          </button>
        </template>
        <div class="composer">
          <textarea v-model="comment" rows="3" data-testid="pr-comment" :placeholder="t('pr.commentPlaceholder')" @keydown="onKey" />
          <button data-testid="pr-comment-send" :disabled="!comment.trim() || prs.busy" @click="send">{{ t('pr.comment') }}</button>
        </div>
      </div>

      <div v-else-if="prs.tab === 'commits'" class="pane">
        <template v-if="prs.commit">
          <button class="link back" data-testid="pr-back" @click="prs.commit = null">{{ t('pr.backToCommits') }}</button>
          <CommitDetail :root="root" />
        </template>
        <p v-else-if="prs.changesError" class="error note">{{ t('pr.changesFailed', { reason: prs.changesError }) }}</p>
        <p v-else-if="!prs.changes" class="muted note">{{ t('pr.loadingChanges') }}</p>
        <ul v-else class="list">
          <li v-for="c in prs.changes.commits" :key="c.sha" data-testid="pr-commit" @click="prs.openCommit(c.sha)">
            <code>{{ c.sha.slice(0, 7) }}</code>
            <span class="subject">{{ c.subject }}</span>
            <span class="muted">{{ c.author }} · {{ formatShortDate(c.authorTime) }}</span>
          </li>
        </ul>
      </div>

      <div v-else-if="prs.tab === 'checks'" class="pane">
        <CiChecks v-if="ci" :status="ci" :now="prs.now" :pr="d.number" />
        <p v-else class="muted note">{{ t('pr.loadingChecks') }}</p>
      </div>

      <div v-else class="pane">
        <p v-if="prs.changesError" class="error note">{{ t('pr.changesFailed', { reason: prs.changesError }) }}</p>
        <p v-else-if="!prs.changes" class="muted note">{{ t('pr.loadingChanges') }}</p>
        <template v-else>
          <ul class="files">
            <li
              v-for="f in prs.changes.files"
              :key="f.path"
              :class="{ selected: f.path === prs.file?.path }"
              data-testid="pr-file"
              @click="prs.selectFile(f)"
            >
              <span class="status" :class="f.status">{{ f.status }}</span>
              <span class="path">{{ f.oldPath ? `${f.oldPath} → ${f.path}` : f.path }}</span>
              <span class="stat"><span class="plus">+{{ f.added ?? '–' }}</span> <span class="minus">−{{ f.deleted ?? '–' }}</span></span>
            </li>
          </ul>
          <div class="diff-bar">
            <span class="path muted">{{ prs.file?.path }}</span>
            <button @click="repo.toggleSplit()">{{ repo.diffOptions.split ? t('diff.unified') : t('diff.split') }}</button>
            <label>
              <input type="checkbox" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
              {{ t('diff.ignoreWhitespace') }}
            </label>
          </div>
          <DiffView v-if="prs.diff" :diff="prs.diff" :split="repo.diffOptions.split" @force="prs.loadDiff(true)" />
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.head { max-height: 40%; overflow: auto; padding: 10px 12px; border-bottom: 1px solid var(--border); }
h2 { margin: 0 0 6px; font-size: 15px; overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
.meta code { overflow-wrap: anywhere; }
.state { padding: 1px 8px; border-radius: 10px; color: #fff; font-weight: 600; }
.state.open { background: #2da44e; }
.state.draft { background: var(--fg-muted); }
.state.merged { background: #8250df; }
.state.closed { background: var(--danger); }
.link.failed { color: var(--danger); }
.link.running { color: #bf8700; }
.link.passed { color: #2da44e; }
.actions { display: flex; gap: 6px; margin-top: 10px; }
.actions button { padding: 2px 10px; }
.tabs { display: flex; gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--border); }
.tabs button { border: 0; background: transparent; padding: 4px 10px; }
.tabs button:hover { background: var(--bg-hover); }
.tabs button.active { background: var(--selected-bg); font-weight: 600; }
.conversation { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px; }
.comment { margin: 10px 0; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; }
.comment header { margin-bottom: 4px; font-size: 12px; }
.commit { display: block; margin: 6px 0; text-align: left; color: var(--fg); font-size: 12px; }
.commit code { color: var(--accent); }
.composer { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-top: 12px; }
.composer textarea { width: 100%; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px; resize: vertical; }
.pane { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.pane > section { flex: 1; }
.back { align-self: flex-start; margin: 6px 12px; }
.note { padding: 12px; margin: 0; }
.list { flex: 1; margin: 0; padding: 4px 0; overflow: auto; list-style: none; }
.list li { display: flex; align-items: baseline; gap: 8px; padding: 3px 12px; cursor: default; }
.list li:hover { background: var(--bg-hover); }
.subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list .muted { font-size: 12px; white-space: nowrap; }
.files { max-height: 30%; margin: 0; padding: 4px 0; overflow: auto; list-style: none; border-bottom: 1px solid var(--border); }
.files li { display: flex; align-items: center; gap: 8px; padding: 2px 12px; cursor: default; }
.files li:hover { background: var(--bg-hover); }
.files li.selected { background: var(--bg-hover); font-weight: 600; }
.status { width: 14px; font-weight: 700; text-align: center; }
.status.A { color: #2da44e; }
.status.D { color: var(--danger); }
.status.M { color: #bf8700; }
.status.R, .status.C { color: #8250df; }
.path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat { font-size: 11px; font-variant-numeric: tabular-nums; }
.plus { color: #2da44e; }
.minus { color: var(--danger); }
.diff-bar { display: flex; align-items: center; gap: 10px; padding: 4px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.diff-bar .path { flex: 1; }
.diff-bar button { padding: 1px 8px; font-size: 12px; }
</style>
