<script setup lang="ts">
import { t, tn } from '../i18n'
import { computed, onMounted } from 'vue'
import type { MessageKey } from '../../shared/i18n'
import type { Operation } from '../../shared/types'
import { SIZES, useLayout } from '../layout'
import { useAppStore } from '../stores/app'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'
import AppIcon from './AppIcon.vue'
import BlameDialog from './BlameDialog.vue'
import CommitDetail from './CommitDetail.vue'
import CreatePullRequestDialog from './CreatePullRequestDialog.vue'
import DiffDialog from './DiffDialog.vue'
import FlowFinishDialog from './FlowFinishDialog.vue'
import FlowInitDialog from './FlowInitDialog.vue'
import FlowStartDialog from './FlowStartDialog.vue'
import HistoryView from './HistoryView.vue'
import MergeDialog from './MergeDialog.vue'
import PullRequestDetail from './PullRequestDetail.vue'
import PullRequestList from './PullRequestList.vue'
import RebaseDialog from './RebaseDialog.vue'
import RepoSidebar from './RepoSidebar.vue'
import PaneSplitter from './PaneSplitter.vue'
import WorkingView from './WorkingView.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const prs = usePullRequestStore(props.root)
const app = useAppStore()
const layout = useLayout()
const vertical = computed(() => app.preferences.panelLayout === 'vertical')
/** La misura della lista: frazione della larghezza in orizzontale, dell'altezza in verticale. */
const listKey = computed(() => (vertical.value ? 'listVertical' : 'list'))
const mainStyle = computed(() => {
  const f = layout[listKey.value]
  const tracks = `minmax(0, ${f}fr) 5px minmax(0, ${1 - f}fr)`
  return vertical.value ? { gridTemplateRows: tracks } : { gridTemplateColumns: tracks }
})

const OPERATIONS: Record<Operation, MessageKey> = {
  merge: 'operation.merge',
  rebase: 'operation.rebase',
  'cherry-pick': 'operation.cherryPick',
  revert: 'operation.revert',
}

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
    <p v-if="repo.error" class="band" data-testid="repo-error">
      <AppIcon name="warning" />
      <span>{{ repo.error }}</span>
      <button :aria-label="t('common.closeError')" @click="repo.error = null">×</button>
    </p>
    <div v-if="operation" class="operation" data-testid="operation-banner">
      <strong>{{ t(OPERATIONS[operation]) }}</strong>
      <span v-if="conflicts" class="muted">{{ tn('operation.conflicts', conflicts) }}</span>
      <span class="spacer" />
      <button class="primary" data-testid="op-continue" :disabled="!!repo.busy || conflicts > 0" @click="step('continue')">{{ t('operation.continue') }}</button>
      <button v-if="operation !== 'merge'" data-testid="op-skip" :disabled="!!repo.busy" @click="step('skip')">{{ t('operation.skip') }}</button>
      <button data-testid="op-abort" :disabled="!!repo.busy" @click="step('abort')">{{ t('operation.abort') }}</button>
    </div>
    <div class="panes" :style="{ gridTemplateColumns: `${layout.sidebar}px 5px minmax(0, 1fr)` }">
      <RepoSidebar :root="root" />
      <PaneSplitter
        v-model="layout.sidebar"
        orientation="col"
        :default-value="SIZES.sidebar.default"
        :min="SIZES.sidebar.min"
        :max="SIZES.sidebar.max"
        :min-after="480"
        :label="t('layout.resize')"
        data-testid="split-sidebar"
      />
      <div class="main" :class="{ vertical }" :style="mainStyle">
        <PullRequestList v-if="repo.page === 'pullRequests'" :root="root" />
        <HistoryView v-else :root="root" />
        <PaneSplitter
          v-model="layout[listKey]"
          :orientation="vertical ? 'row' : 'col'"
          fraction
          :default-value="SIZES[listKey].default"
          :min="vertical ? 120 : 240"
          :min-after="vertical ? 120 : 240"
          :label="t('layout.resize')"
          data-testid="split-list"
        />
        <PullRequestDetail v-if="repo.page === 'pullRequests'" :root="root" />
        <WorkingView v-else-if="repo.view === 'working'" :root="root" />
        <CommitDetail v-else :root="root" />
      </div>
    </div>
    <RebaseDialog v-if="repo.rebasePlan" :root="root" />
    <MergeDialog v-if="prs.merging && prs.detail" :root="root" />
    <CreatePullRequestDialog v-if="prs.creating" :root="root" />
    <FlowInitDialog v-if="repo.flowDialog?.kind === 'init'" :root="root" />
    <FlowStartDialog v-else-if="repo.flowDialog?.kind === 'start'" :root="root" />
    <FlowFinishDialog v-else-if="repo.flowDialog?.kind === 'finish'" :root="root" />
    <DiffDialog v-if="repo.diffDialog" :root="root" />
    <BlameDialog v-if="repo.blame" :root="root" />
  </section>
</template>

<style scoped>
.repo { display: flex; flex-direction: column; height: 100%; }
.band { display: flex; align-items: center; gap: 8px; margin: 0; padding: 6px 12px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.band span { flex: 1; }
.band button { padding: 0 6px; border: 0; background: transparent; color: inherit; }
.operation { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); box-shadow: inset 3px 0 #bf8700; }
.operation button { padding: 2px 10px; }
.panes { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); }
/* Lista | divisore | dettaglio: colonne (dallo stile in linea) e una riga, oppure righe e una colonna */
.main { display: grid; grid-template-rows: minmax(0, 1fr); min-width: 0; min-height: 0; }
.main.vertical { grid-template-columns: minmax(0, 1fr); }
</style>
