<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRepoStore } from '../stores/repo'
import CommitDetail from './CommitDetail.vue'
import HistoryView from './HistoryView.vue'
import RepoSidebar from './RepoSidebar.vue'
import WorkingView from './WorkingView.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

const head = computed(() => {
  const info = repo.info
  if (!info) return ''
  if (info.branch) return info.branch
  return info.headSha ? `HEAD staccato (${info.headSha.slice(0, 7)})` : 'nessun commit'
})

onMounted(() => {
  if (!repo.history.version) void repo.refresh()
})
</script>

<template>
  <section class="repo">
    <header class="toolbar">
      <strong>{{ repo.info?.name }}</strong>
      <span class="branch" data-testid="repo-branch">{{ head }}</span>
      <span class="spacer" />
      <button aria-label="Aggiorna" @click="repo.refresh()">↻</button>
    </header>
    <p v-if="repo.error" class="error message">{{ repo.error }}</p>
    <div class="panes">
      <RepoSidebar :root="root" />
      <HistoryView :root="root" />
      <WorkingView v-if="repo.view === 'working'" :root="root" />
      <CommitDetail v-else :root="root" />
    </div>
  </section>
</template>

<style scoped>
.repo { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.branch { padding: 1px 8px; border-radius: 10px; background: var(--bg-hover); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.message { margin: 0; padding: 6px 12px; border-bottom: 1px solid var(--border); }
.panes { flex: 1; min-height: 0; display: grid; grid-template-columns: 200px minmax(0, 11fr) minmax(0, 9fr); }
</style>
