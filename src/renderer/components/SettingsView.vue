<script setup lang="ts">
import { type Component, computed, onMounted, onUnmounted } from 'vue'
import { type SettingsSection, useAppStore } from '../stores/app'
import DiffSettings from './settings/DiffSettings.vue'
import GeneralSettings from './settings/GeneralSettings.vue'
import GitSettings from './settings/GitSettings.vue'

const app = useAppStore()
const SECTIONS: { id: SettingsSection; title: string; component: Component }[] = [
  { id: 'general', title: 'Generale', component: GeneralSettings },
  { id: 'diff', title: 'Diff', component: DiffSettings },
  { id: 'git', title: 'Git', component: GitSettings },
]
const current = computed(() => SECTIONS.find((s) => s.id === app.settingsSection) ?? SECTIONS[0])

// Esc chiude, a meno che sia aperto un dialog (che usa Esc per sé)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) app.settingsSection = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="settings" data-testid="settings">
    <nav>
      <h1>Impostazioni</h1>
      <button
        v-for="s in SECTIONS"
        :key="s.id"
        :class="{ active: current?.id === s.id }"
        :data-testid="`settings-${s.id}`"
        @click="app.settingsSection = s.id"
      >{{ s.title }}</button>
    </nav>
    <div class="content">
      <header>
        <h2>{{ current?.title }}</h2>
        <button class="close" aria-label="Chiudi le impostazioni" data-testid="settings-close" @click="app.settingsSection = null">×</button>
      </header>
      <p v-if="app.error" class="error message">
        <span>{{ app.error }}</span>
        <button aria-label="Chiudi errore" @click="app.error = null">×</button>
      </p>
      <component :is="current?.component" />
    </div>
  </section>
</template>

<style scoped>
.settings { display: grid; grid-template-columns: 200px minmax(0, 1fr); height: 100%; }
nav { display: flex; flex-direction: column; gap: 2px; padding: 16px 10px; background: var(--bg-alt); border-right: 1px solid var(--border); }
nav h1 { margin: 0 8px 12px; font-size: 15px; }
nav button { text-align: left; border: 0; background: transparent; padding: 6px 10px; }
nav button:hover { background: var(--bg-hover); }
nav button.active { background: var(--selected-bg); font-weight: 600; }
.content { min-height: 0; overflow: auto; padding: 16px 24px 32px; }
header { display: flex; align-items: center; margin-bottom: 16px; }
header h2 { flex: 1; margin: 0; font-size: 18px; }
.close { border: 0; background: transparent; font-size: 18px; padding: 2px 8px; }
.message { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 6px 10px; background: var(--danger-bg); border-radius: 5px; }
.message span { flex: 1; }
.message button { border: 0; background: transparent; }
</style>
