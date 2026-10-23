<script setup lang="ts">
import { type Lang, LANGUAGES } from '../../../shared/i18n'
import type { ThemePreference } from '../../../shared/types'
import { useAppStore } from '../../stores/app'
import { t } from '../../i18n'
import PrefNumber from './PrefNumber.vue'

const app = useAppStore()
const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Come il sistema' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
]
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>Aspetto</h2>
    <label for="pref-language">{{ t('setting.language') }}</label>
    <select
      id="pref-language"
      data-testid="pref-language"
      :value="app.preferences.language"
      @change="app.updatePreferences({ language: ($event.target as HTMLSelectElement).value as Lang })"
    >
      <!-- Ogni lingua col suo nome nella sua lingua -->
      <option v-for="l in LANGUAGES" :key="l" :value="l">{{ t(`language.${l}`) }}</option>
    </select>
    <label for="pref-theme">Tema</label>
    <select
      id="pref-theme"
      data-testid="pref-theme"
      :value="app.preferences.theme"
      @change="app.updatePreferences({ theme: ($event.target as HTMLSelectElement).value as ThemePreference })"
    >
      <option v-for="t in THEMES" :key="t.value" :value="t.value">{{ t.label }}</option>
    </select>

    <h2>Fetch</h2>
    <label for="pref-autoFetchMinutes">Fetch automatico</label>
    <div class="row">
      <PrefNumber id="pref-autoFetchMinutes" field="autoFetchMinutes" :min="0" :max="60" />
      <span class="muted">minuti (0 = spento)</span>
    </div>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-fetchPrune"
        :checked="app.preferences.fetchPrune"
        @change="app.updatePreferences({ fetchPrune: checked($event) })"
      />
      Togli i branch remoti cancellati sul server (--prune)
    </label>

    <h2>Avvio</h2>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-restoreTabs"
        :checked="app.preferences.restoreTabs"
        @change="app.updatePreferences({ restoreTabs: checked($event) })"
      />
      Riapri le tab all'avvio
    </label>
  </form>
</template>
