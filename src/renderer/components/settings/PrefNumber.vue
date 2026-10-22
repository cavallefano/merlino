<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Preferences } from '../../../shared/types'
import { useAppStore } from '../../stores/app'

type NumberField = { [K in keyof Preferences]: Preferences[K] extends number ? K : never }[keyof Preferences]
const props = defineProps<{ field: NumberField; min: number; max: number }>()
const app = useAppStore()
// Copia locale: un altro salvataggio che finisce mentre scrivi non riscrive il campo
const draft = ref(String(app.preferences[props.field]))
watch(
  () => app.preferences[props.field],
  (v) => {
    draft.value = String(v)
  },
)

async function save() {
  const saved = app.preferences[props.field]
  const n = Number(draft.value)
  // Valore non valido o rifiutato dal main: il campo torna a quello salvato
  if (!Number.isInteger(n) || n < props.min || n > props.max) draft.value = String(saved)
  else if (n !== saved && !(await app.updatePreferences({ [props.field]: n } as Partial<Preferences>))) draft.value = String(saved)
}
</script>

<template>
  <input v-model="draft" type="number" :min="min" :max="max" step="1" :data-testid="`pref-${field}`" @change="save" />
</template>
