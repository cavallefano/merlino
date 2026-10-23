<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../i18n'
import type { DiffAlgorithm } from '../../../shared/types'
import { useAppStore } from '../../stores/app'
import PrefNumber from './PrefNumber.vue'

const app = useAppStore()
const ALGORITHMS = computed<{ value: DiffAlgorithm; label: string }[]>(() => [
  { value: 'default', label: t('settings.algorithmGit') },
  { value: 'myers', label: 'Myers' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'patience', label: 'Patience' },
  { value: 'histogram', label: 'Histogram' },
])
const value = (e: Event) => (e.target as HTMLSelectElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>{{ t('settings.onOpen') }}</h2>
    <label for="pref-diffSplit">{{ t('settings.view') }}</label>
    <select
      id="pref-diffSplit"
      data-testid="pref-diffSplit"
      :value="app.preferences.diffSplit ? 'split' : 'unified'"
      @change="app.updatePreferences({ diffSplit: value($event) === 'split' })"
    >
      <option value="unified">{{ t('settings.viewUnified') }}</option>
      <option value="split">{{ t('settings.viewSplit') }}</option>
    </select>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-diffIgnoreWhitespace"
        :checked="app.preferences.diffIgnoreWhitespace"
        @change="app.updatePreferences({ diffIgnoreWhitespace: checked($event) })"
      />
      {{ t('setting.ignoreWhitespace') }}
    </label>

    <h2>{{ t('settings.computation') }}</h2>
    <label for="pref-diffContext">{{ t('setting.diffContext') }}</label>
    <PrefNumber id="pref-diffContext" field="diffContext" :min="1" :max="20" />
    <label for="pref-diffAlgorithm">{{ t('setting.diffAlgorithm') }}</label>
    <select
      id="pref-diffAlgorithm"
      data-testid="pref-diffAlgorithm"
      :value="app.preferences.diffAlgorithm"
      @change="app.updatePreferences({ diffAlgorithm: value($event) as DiffAlgorithm })"
    >
      <option v-for="a in ALGORITHMS" :key="a.value" :value="a.value">{{ a.label }}</option>
    </select>
    <p class="hint">{{ t('settings.algorithmHint') }}</p>

    <h2>{{ t('settings.text') }}</h2>
    <label for="pref-codeFontSize">{{ t('setting.codeFontSize') }}</label>
    <div class="row"><PrefNumber id="pref-codeFontSize" field="codeFontSize" :min="10" :max="20" /> <span class="muted">px</span></div>
    <label for="pref-tabSize">{{ t('setting.tabSize') }}</label>
    <div class="row"><PrefNumber id="pref-tabSize" field="tabSize" :min="1" :max="8" /> <span class="muted">{{ t('settings.spaces') }}</span></div>
  </form>
</template>
