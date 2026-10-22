<script setup lang="ts">
import { computed } from 'vue'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

const head = computed(() => {
  const info = repo.info
  if (!info) return ''
  if (info.branch) return info.branch
  return info.headSha ? `HEAD staccato (${info.headSha.slice(0, 7)})` : 'nessun commit'
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
    <div class="body">
      <p v-if="repo.error" class="error">{{ repo.error }}</p>
      <p class="muted">{{ root }}</p>
    </div>
  </section>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.branch { padding: 1px 8px; border-radius: 10px; background: var(--bg-hover); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.body { padding: 12px; }
</style>
