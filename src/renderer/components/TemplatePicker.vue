<script setup lang="ts">
import { t } from '../i18n'
import { computed, onMounted, ref, watch } from 'vue'
import type { CommitTemplate } from '../../shared/types'
import { fuzzy } from '../actions/registry'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'

// filter assente: il selettore ha il suo campo di ricerca; altrimenti cerca con il testo dopo la "/" dell'oggetto
const props = defineProps<{ root: string; filter?: string }>()
const emit = defineEmits<{ choose: [template: CommitTemplate]; close: [] }>()
const app = useAppStore()
const repo = useRepoStore(props.root)
const search = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)

const items = computed(() => {
  const all = [...(app.settings?.commitTemplates ?? []), ...(repo.gitTemplate ? [repo.gitTemplate] : [])]
  return all.filter((t) => fuzzy(props.filter ?? search.value, t.name))
})
watch(
  () => props.filter ?? search.value,
  () => {
    index.value = 0
  },
)
onMounted(() => input.value?.focus())

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') index.value = Math.min(index.value + 1, items.value.length - 1)
  else if (e.key === 'ArrowUp') index.value = Math.max(index.value - 1, 0)
  else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
    const t = items.value[index.value]
    if (t) emit('choose', t)
  } else if (e.key === 'Escape') emit('close')
  else return
  e.preventDefault()
  e.stopPropagation()
}
defineExpose({ onKey })

function manage() {
  emit('close')
  app.settingsSection = 'commit'
}
</script>

<template>
  <div class="picker" data-testid="template-picker">
    <input
      v-if="filter === undefined"
      ref="input"
      v-model="search"
      data-testid="template-search"
      :placeholder="t('template.search')"
      @keydown="onKey"
      @blur="emit('close')"
    />
    <ul>
      <li
        v-for="(tpl, i) in items"
        :key="tpl.id"
        :class="{ active: i === index }"
        data-testid="template-item"
        @mousedown.prevent="emit('choose', tpl)"
        @mousemove="index = i"
      >
        <span class="name">{{ tpl.name }}</span>
        <span v-if="tpl.id === repo.defaultTemplate?.id" class="muted">{{ t('template.default') }}</span>
      </li>
      <li v-if="!items.length" class="muted">{{ t('template.none') }}</li>
    </ul>
    <button type="button" class="manage" data-testid="template-manage" @mousedown.prevent="manage">{{ t('template.manage') }}</button>
  </div>
</template>

<style scoped>
.picker { position: absolute; top: calc(100% + 4px); left: 0; right: 32px; z-index: 5; overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.2); }
input { width: 100%; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; }
input:focus { outline: none; }
ul { max-height: 240px; margin: 0; padding: 4px; overflow: auto; list-style: none; }
li { display: flex; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 4px; cursor: default; }
li.active { background: var(--selected-bg); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.manage { width: 100%; border: 0; border-top: 1px solid var(--border); border-radius: 0; text-align: left; }
</style>
