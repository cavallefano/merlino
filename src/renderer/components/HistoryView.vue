<script setup lang="ts">
import { t, tn } from '../i18n'
import { ref, watch } from 'vue'
import { useRepoStore } from '../stores/repo'
import CommitList from './CommitList.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const text = ref(repo.query)
// La ricerca può cambiare anche da fuori (Storia del file)
watch(() => repo.query, (q) => (text.value = q))

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
        :placeholder="t('history.searchPlaceholder')"
        @keydown="onKey"
      />
      <span class="muted count">{{ tn('history.commitCount', repo.history.total) }}</span>
    </div>
    <CommitList :root="root" />
  </section>
</template>

<style scoped>
.history { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.search { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.search input { flex: 1; min-width: 0; }
.count { font-size: 12px; white-space: nowrap; }
</style>
