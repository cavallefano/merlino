<script setup lang="ts">
import { useAppStore } from '../../stores/app'

type AppField = 'editorApp' | 'terminalApp'
const app = useAppStore()
const ROWS: { field: AppField; label: string; fallback: string; hint: string }[] = [
  { field: 'editorApp', label: 'Editor', fallback: 'App predefinita del sistema', hint: 'Lo usa "Apri" sui file in conflitto.' },
  { field: 'terminalApp', label: 'Terminale', fallback: 'Terminale predefinito', hint: 'Lo usa "Apri nel terminale" (palette o menu File).' },
]
const appName = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.(app|exe)$/i, '') ?? path

async function pick(field: AppField) {
  const path = await window.api.pickApp()
  if (path) await app.updatePreferences({ [field]: path })
}
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <template v-for="row in ROWS" :key="row.field">
      <label>{{ row.label }}</label>
      <div class="row">
        <span :title="app.preferences[row.field] ?? ''" :data-testid="`pref-${row.field}`">
          {{ app.preferences[row.field] ? appName(app.preferences[row.field] as string) : row.fallback }}
        </span>
        <button type="button" :data-testid="`pref-${row.field}-pick`" @click="pick(row.field)">Scegli…</button>
        <button v-if="app.preferences[row.field]" type="button" @click="app.updatePreferences({ [row.field]: null })">Predefinito</button>
      </div>
      <p class="hint">{{ row.hint }}</p>
    </template>
  </form>
</template>
