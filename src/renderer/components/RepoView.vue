<script setup lang="ts">
import { t, tn } from '../i18n'
import { computed, onMounted } from 'vue'
import type { MessageKey } from '../../shared/i18n'
import type { Operation } from '../../shared/types'
import { push } from '../actions/branches'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import CommitDetail from './CommitDetail.vue'
import HistoryView from './HistoryView.vue'
import PullRequestDetail from './PullRequestDetail.vue'
import PullRequestList from './PullRequestList.vue'
import RebaseDialog from './RebaseDialog.vue'
import RepoSidebar from './RepoSidebar.vue'
import WorkingView from './WorkingView.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const prs = usePullRequestStore(props.root)

const OPERATIONS: Record<Operation, MessageKey> = {
  merge: 'operation.merge',
  rebase: 'operation.rebase',
  'cherry-pick': 'operation.cherryPick',
  revert: 'operation.revert',
}

const head = computed(() => {
  const info = repo.info
  if (!info) return ''
  if (info.branch) return info.branch
  return info.headSha ? t('repo.detachedHead', { sha: info.headSha.slice(0, 7) }) : t('repo.noCommits')
})
const operation = computed(() => repo.status?.operation ?? null)
const conflicts = computed(() => repo.status?.conflicted.length ?? 0)

function step(s: 'continue' | 'skip' | 'abort') {
  if (operation.value) void repo.git({ kind: 'operation', op: operation.value, step: s })
}

onMounted(() => {
  if (!repo.history.version) void repo.refresh()
  // Il numero delle pull request aperte, per la sidebar
  if (!prs.remotes.length) void prs.refresh()
})
</script>

<template>
  <section class="repo">
    <header class="toolbar">
      <strong>{{ repo.info?.name }}</strong>
      <span class="branch" data-testid="repo-branch">{{ head }}</span>
      <span class="spacer" />
      <span v-if="repo.busy && repo.progress" class="progress muted" data-testid="progress">{{ repo.progress }}</span>
      <button data-testid="fetch" :disabled="!!repo.busy" @click="repo.git({ kind: 'fetch' })">Fetch</button>
      <button data-testid="pull" :disabled="!!repo.busy" @click="repo.git({ kind: 'pull', mode: 'config' })">
        Pull<span v-if="repo.status?.behind" class="count">↓{{ repo.status.behind }}</span>
      </button>
      <button data-testid="push" :disabled="!!repo.busy" @click="push(repo, false)">
        Push<span v-if="repo.status?.ahead" class="count">↑{{ repo.status.ahead }}</span>
      </button>
      <button :aria-label="t('action.repo.refresh')" @click="repo.refresh()">↻</button>
    </header>
    <p v-if="repo.error" class="error message">{{ repo.error }}</p>
    <div v-if="operation" class="operation" data-testid="operation-banner">
      <strong>{{ t(OPERATIONS[operation]) }}</strong>
      <span v-if="conflicts" class="muted">{{ tn('operation.conflicts', conflicts) }}</span>
      <span class="spacer" />
      <button class="primary" data-testid="op-continue" :disabled="!!repo.busy || conflicts > 0" @click="step('continue')">{{ t('operation.continue') }}</button>
      <button v-if="operation !== 'merge'" data-testid="op-skip" :disabled="!!repo.busy" @click="step('skip')">{{ t('operation.skip') }}</button>
      <button data-testid="op-abort" :disabled="!!repo.busy" @click="step('abort')">{{ t('operation.abort') }}</button>
    </div>
    <div class="panes">
      <RepoSidebar :root="root" />
      <template v-if="repo.page === 'pullRequests'">
        <PullRequestList :root="root" />
        <PullRequestDetail :root="root" />
      </template>
      <template v-else>
        <HistoryView :root="root" />
        <WorkingView v-if="repo.view === 'working'" :root="root" />
        <CommitDetail v-else :root="root" />
      </template>
    </div>
    <RebaseDialog v-if="repo.rebasePlan" :root="root" />
  </section>
</template>

<style scoped>
.repo { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.toolbar button { padding: 2px 10px; }
.branch { padding: 1px 8px; border-radius: 10px; background: var(--bg-hover); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.progress { max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.count { margin-left: 4px; font-variant-numeric: tabular-nums; }
.message { margin: 0; padding: 6px 12px; border-bottom: 1px solid var(--border); }
.operation { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); box-shadow: inset 3px 0 #bf8700; }
.operation button { padding: 2px 10px; }
.panes { flex: 1; min-height: 0; display: grid; grid-template-columns: 220px minmax(0, 11fr) minmax(0, 9fr); }
</style>
