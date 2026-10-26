<script setup lang="ts">
import { computed } from 'vue'
import type { FileContent } from '../../shared/types'
import { highlighter } from '../history/highlight'
import { t } from '../i18n'

const props = defineProps<{ path: string; content: FileContent }>()
const emit = defineEmits<{ force: [] }>()

const highlight = computed(() => highlighter(props.path))
// L'a capo finale non è una riga in più; un file vuoto non ha righe
const lines = computed(() => (props.content.text ? props.content.text.replace(/\n$/, '').split('\n') : []))
</script>

<template>
  <div class="content">
    <p v-if="content.binary" class="note muted">{{ t('diff.binary') }}</p>
    <p v-else-if="content.tooLarge" class="note">
      {{ t('file.tooLarge') }}
      <button @click="emit('force')">{{ t('diff.showAnyway') }}</button>
    </p>
    <template v-else>
      <div v-for="(text, i) in lines" :key="i" class="line" data-testid="content-line">
        <span class="no">{{ i + 1 }}</span>
        <!-- highlight.js e escapeHtml restituiscono HTML già sicuro -->
        <code v-html="highlight(text)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.content { flex: 1; min-height: 0; overflow: auto; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: var(--code-size, 12px); tab-size: var(--tab-size, 4); }
.note { padding: 12px; font-family: system-ui, sans-serif; }
.line { display: grid; grid-template-columns: 44px 1fr; line-height: 18px; content-visibility: auto; contain-intrinsic-size: auto 18px; }
.line code { white-space: pre; font-size: inherit; }
.no { padding-right: 8px; color: var(--fg-muted); text-align: right; user-select: none; }
</style>
