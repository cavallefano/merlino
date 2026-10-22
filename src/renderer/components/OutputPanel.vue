<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const list = ref<HTMLElement | null>(null)
const time = (t: number) => new Date(t).toLocaleTimeString()

watch(
  () => app.log.length,
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
  { immediate: true },
)
</script>

<template>
  <section class="output" data-testid="output-panel">
    <header>
      <strong>Output</strong>
      <span class="spacer" />
      <button aria-label="Chiudi output" @click="app.outputOpen = false">×</button>
    </header>
    <ol ref="list">
      <li v-for="e in app.log" :key="e.id" :class="{ failed: !e.ok }">
        <span class="muted">{{ time(e.startedAt) }}</span>
        <code>{{ e.args.length ? `git ${e.args.join(' ')}` : 'errore interfaccia' }}</code>
        <span class="muted">{{ e.durationMs }} ms</span>
        <span v-if="!e.ok && e.exitCode !== null" class="error">exit {{ e.exitCode }}</span>
        <pre v-if="!e.ok && e.stderr">{{ e.stderr }}</pre>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.output { display: flex; flex-direction: column; height: 220px; background: var(--bg-alt); border-top: 1px solid var(--border); }
header { display: flex; align-items: center; padding: 4px 12px; border-bottom: 1px solid var(--border); }
header button { border: 0; background: transparent; }
ol { flex: 1; margin: 0; padding: 4px 12px; overflow: auto; list-style: none; }
li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; padding: 2px 0; }
li.failed code { color: var(--danger); }
pre { flex-basis: 100%; margin: 2px 0 4px; white-space: pre-wrap; color: var(--danger); }
</style>
