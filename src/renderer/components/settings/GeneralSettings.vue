<script setup lang="ts">
import { type Lang, LANGUAGES, type MessageKey } from '../../../shared/i18n'
import type { ThemePreference } from '../../../shared/types'
import { useAppStore } from '../../stores/app'
import { t } from '../../i18n'
import PrefNumber from './PrefNumber.vue'

const app = useAppStore()
const THEMES: { value: ThemePreference; label: MessageKey }[] = [
  { value: 'system', label: 'theme.system' },
  { value: 'light', label: 'theme.light' },
  { value: 'dark', label: 'theme.dark' },
]
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>{{ t('settings.appearance') }}</h2>
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
    <label for="pref-theme">{{ t('setting.theme') }}</label>
    <select
      id="pref-theme"
      data-testid="pref-theme"
      :value="app.preferences.theme"
      @change="app.updatePreferences({ theme: ($event.target as HTMLSelectElement).value as ThemePreference })"
    >
      <option v-for="theme in THEMES" :key="theme.value" :value="theme.value">{{ t(theme.label) }}</option>
    </select>

    <h2>Fetch</h2>
    <label for="pref-autoFetchMinutes">{{ t('setting.autoFetch') }}</label>
    <div class="row">
      <PrefNumber id="pref-autoFetchMinutes" field="autoFetchMinutes" :min="0" :max="60" />
      <span class="muted">{{ t('settings.minutesOff') }}</span>
    </div>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-fetchPrune"
        :checked="app.preferences.fetchPrune"
        @change="app.updatePreferences({ fetchPrune: checked($event) })"
      />
      {{ t('settings.pruneLabel') }}
    </label>

    <h2>{{ t('settings.startup') }}</h2>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-restoreTabs"
        :checked="app.preferences.restoreTabs"
        @change="app.updatePreferences({ restoreTabs: checked($event) })"
      />
      {{ t('setting.restoreTabs') }}
    </label>
  </form>
</template>
