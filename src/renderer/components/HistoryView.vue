<script setup lang="ts">
import { ref } from 'vue'
import { useRepoStore } from '../stores/repo'
import CommitList from './CommitList.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const text = ref(repo.query)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    void repo.search(text.value)
  } else if (e.key === 'Escape') {
    text.value = ''
    void repo.search('')
  }
}
</script>

<template>
  <section class="history">
    <div class="search">
      <input
        v-model="text"
        data-testid="history-search"
        placeholder="Cerca: testo, author:, path:, message:, contents:"
        @keydown="onKey"
      />
      <span class="muted count">{{ repo.history.total }} commit</span>
    </div>
    <div
      v-if="repo.changeCount"
      class="working-row"
      :class="{ selected: repo.view === 'working' }"
      data-testid="working-row"
      @click="repo.selectWorking()"
    >
      <span class="dot">●</span> Modifiche locali <span class="muted">({{ repo.changeCount }})</span>
    </div>
    <CommitList :root="root" />
  </section>
</template>

<style scoped>
.history { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--border); }
.search { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.search input { flex: 1; min-width: 0; }
.count { font-size: 12px; white-space: nowrap; }
.working-row { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 12px; border-bottom: 1px solid var(--border); cursor: default; font-weight: 600; }
.working-row:hover { background: var(--bg-hover); }
.working-row.selected { background: var(--accent); color: var(--accent-fg); }
.working-row.selected .muted { color: inherit; }
.dot { color: #bf8700; }
.working-row.selected .dot { color: inherit; }
</style>
