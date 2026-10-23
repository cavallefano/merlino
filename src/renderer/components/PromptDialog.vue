<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { type PromptRequest, type PromptValues, useAppStore } from '../stores/app'

const props = defineProps<{ request: PromptRequest }>()
const app = useAppStore()
const values = reactive<PromptValues>(
  Object.fromEntries(props.request.fields.map((f) => [f.key, f.value ?? (f.type === 'checkbox' ? false : '')])),
)
const dialog = ref<HTMLDialogElement | null>(null)
// showModal: focus sul primo campo, tab bloccato nel dialog, Esc come annulla
onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" data-testid="prompt-dialog" @cancel.prevent="app.closePrompt(null)">
    <form @submit.prevent="app.closePrompt({ ...values })">
      <h2>{{ request.title }}</h2>
      <template v-for="f in request.fields" :key="f.key">
        <label v-if="f.type === 'checkbox'" class="check">
          <input v-model="values[f.key]" type="checkbox" :data-testid="`prompt-field-${f.key}`" />
          {{ f.label }}
        </label>
        <label v-else class="text">
          <span>{{ f.label }}</span>
          <input v-model="values[f.key]" :data-testid="`prompt-field-${f.key}`" />
        </label>
      </template>
      <footer>
        <button type="button" data-testid="prompt-cancel" @click="app.closePrompt(null)">Annulla</button>
        <button class="primary" data-testid="prompt-ok">{{ request.confirm }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(440px, 90vw); }
.text { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 12px; }
.check { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
</style>
