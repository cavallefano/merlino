<script setup lang="ts">
import type { MessageKey } from '../../../shared/i18n'
import { t } from '../../i18n'
import { useAppStore } from '../../stores/app'

type AppField = 'editorApp' | 'terminalApp'
const app = useAppStore()
const ROWS: { field: AppField; label: MessageKey; fallback: MessageKey; hint: MessageKey }[] = [
  { field: 'editorApp', label: 'setting.editor', fallback: 'settings.systemDefaultApp', hint: 'settings.editorHint' },
  { field: 'terminalApp', label: 'setting.terminal', fallback: 'settings.defaultTerminal', hint: 'settings.terminalHint' },
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
      <label>{{ t(row.label) }}</label>
      <div class="row">
        <span :title="app.preferences[row.field] ?? ''" :data-testid="`pref-${row.field}`">
          {{ app.preferences[row.field] ? appName(app.preferences[row.field] as string) : t(row.fallback) }}
        </span>
        <button type="button" :data-testid="`pref-${row.field}-pick`" @click="pick(row.field)">{{ t('common.choose') }}</button>
        <button v-if="app.preferences[row.field]" type="button" @click="app.updatePreferences({ [row.field]: null })">{{ t('settings.useDefault') }}</button>
      </div>
      <p class="hint">{{ t(row.hint) }}</p>
    </template>
  </form>
</template>
