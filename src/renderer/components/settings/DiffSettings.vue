<script setup lang="ts">
import type { DiffAlgorithm } from '../../../shared/types'
import { useAppStore } from '../../stores/app'
import PrefNumber from './PrefNumber.vue'

const app = useAppStore()
const ALGORITHMS: { value: DiffAlgorithm; label: string }[] = [
  { value: 'default', label: 'Quello di git (diff.algorithm)' },
  { value: 'myers', label: 'Myers' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'patience', label: 'Patience' },
  { value: 'histogram', label: 'Histogram' },
]
const value = (e: Event) => (e.target as HTMLSelectElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>All'apertura di un repo</h2>
    <label for="pref-diffSplit">Vista</label>
    <select
      id="pref-diffSplit"
      data-testid="pref-diffSplit"
      :value="app.preferences.diffSplit ? 'split' : 'unified'"
      @change="app.updatePreferences({ diffSplit: value($event) === 'split' })"
    >
      <option value="unified">Unificata</option>
      <option value="split">Affiancata</option>
    </select>
    <span />
    <label class="check">
      <input
        type="checkbox"
        data-testid="pref-diffIgnoreWhitespace"
        :checked="app.preferences.diffIgnoreWhitespace"
        @change="app.updatePreferences({ diffIgnoreWhitespace: checked($event) })"
      />
      Ignora gli spazi
    </label>

    <h2>Calcolo</h2>
    <label for="pref-diffContext">Righe di contesto</label>
    <PrefNumber id="pref-diffContext" field="diffContext" :min="1" :max="20" />
    <label for="pref-diffAlgorithm">Algoritmo</label>
    <select
      id="pref-diffAlgorithm"
      data-testid="pref-diffAlgorithm"
      :value="app.preferences.diffAlgorithm"
      @change="app.updatePreferences({ diffAlgorithm: value($event) as DiffAlgorithm })"
    >
      <option v-for="a in ALGORITHMS" :key="a.value" :value="a.value">{{ a.label }}</option>
    </select>
    <p class="hint">Patience e histogram allineano meglio i blocchi spostati; valgono dal prossimo diff aperto.</p>

    <h2>Testo</h2>
    <label for="pref-codeFontSize">Dimensione del carattere</label>
    <div class="row"><PrefNumber id="pref-codeFontSize" field="codeFontSize" :min="10" :max="20" /> <span class="muted">px</span></div>
    <label for="pref-tabSize">Larghezza del tab</label>
    <div class="row"><PrefNumber id="pref-tabSize" field="tabSize" :min="1" :max="8" /> <span class="muted">spazi</span></div>
  </form>
</template>
