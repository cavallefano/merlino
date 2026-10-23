<script setup lang="ts">
import { t } from '../i18n'
import { computed, onMounted, ref, watch } from 'vue'
import { registry } from '../actions/builtin'
import { fuzzy } from '../actions/registry'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)

const items = computed(() => registry.enabled().filter((a) => a.id !== 'palette.open' && fuzzy(query.value, a.title)))

watch(query, () => {
  index.value = 0
})
onMounted(() => input.value?.focus())

function close() {
  app.paletteOpen = false
}

function runAt(i: number) {
  const action = items.value[i]
  if (!action) return
  close()
  registry.run(action.id)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') index.value = Math.min(index.value + 1, items.value.length - 1)
  else if (e.key === 'ArrowUp') index.value = Math.max(index.value - 1, 0)
  else if (e.key === 'Enter') runAt(index.value)
  else if (e.key === 'Escape') close()
  else return
  e.preventDefault()
}
</script>

<template>
  <div class="backdrop" @mousedown.self="close">
    <div class="palette">
      <input ref="input" v-model="query" data-testid="palette-input" :placeholder="t('palette.placeholder')" @keydown="onKey" />
      <ul>
        <li
          v-for="(a, i) in items"
          :key="a.id"
          :class="{ selected: i === index }"
          @mousedown.prevent="runAt(i)"
          @mousemove="index = i"
        >
          <span>{{ a.title }}</span>
          <kbd v-if="a.keys">{{ registry.keyLabel(a.keys) }}</kbd>
        </li>
        <li v-if="!items.length" class="muted">{{ t('palette.empty') }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 10; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; background: rgb(0 0 0 / 0.25); }
.palette { width: min(560px, 90vw); overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 12px 40px rgb(0 0 0 / 0.3); }
input { width: 100%; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; font-size: 14px; }
input:focus { outline: none; }
ul { max-height: 50vh; margin: 0; padding: 4px; overflow: auto; list-style: none; }
li { display: flex; justify-content: space-between; padding: 6px 8px; border-radius: 5px; cursor: default; }
li.selected { background: var(--accent); color: var(--accent-fg); }
kbd { opacity: 0.8; }
</style>
