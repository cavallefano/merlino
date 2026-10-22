<script setup lang="ts">
import type { Preferences } from '../../../shared/types'
import { useAppStore } from '../../stores/app'

type NumberField = { [K in keyof Preferences]: Preferences[K] extends number ? K : never }[keyof Preferences]
const props = defineProps<{ field: NumberField; min: number; max: number }>()
const app = useAppStore()

async function save(e: Event) {
  const input = e.target as HTMLInputElement
  const saved = app.preferences[props.field]
  const n = Number(input.value)
  // Valore non valido o rifiutato dal main: il campo torna a quello salvato
  if (!Number.isInteger(n) || n < props.min || n > props.max) input.value = String(saved)
  else if (n !== saved && !(await app.updatePreferences({ [props.field]: n } as Partial<Preferences>))) input.value = String(saved)
}
</script>

<template>
  <input type="number" :min="min" :max="max" step="1" :value="app.preferences[field]" :data-testid="`pref-${field}`" @change="save" />
</template>
