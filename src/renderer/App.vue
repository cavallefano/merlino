<script setup lang="ts">
import { t } from './i18n'
import { onMounted, onUnmounted, watchEffect } from 'vue'
import { registerBranchActions } from './actions/branches'
import { registerBuiltinActions, registry } from './actions/builtin'
import { registerHistoryActions } from './actions/history'
import { registerPullRequestActions } from './actions/pull-requests'
import { registerWorkingActions } from './actions/working'
import CommandPalette from './components/CommandPalette.vue'
import DropHint from './components/DropHint.vue'
import GitMissing from './components/GitMissing.vue'
import OutputPanel from './components/OutputPanel.vue'
import PromptDialog from './components/PromptDialog.vue'
import SettingsView from './components/SettingsView.vue'
import RepoView from './components/RepoView.vue'
import TabBar from './components/TabBar.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { drag, resetDrag } from './drag/drag'
import { useAppStore } from './stores/app'

const app = useAppStore()
registerBuiltinActions()
registerHistoryActions()
registerWorkingActions()
registerBranchActions()
registerPullRequestActions()

// Carattere e tab del codice nei diff, dalle preferenze
watchEffect(() => {
  document.documentElement.lang = app.preferences.language
  const root = document.documentElement.style
  root.setProperty('--code-size', `${app.preferences.codeFontSize}px`)
  root.setProperty('--tab-size', String(app.preferences.tabSize))
})

function onKey(e: KeyboardEvent) {
  const action = registry.match(e)
  if (!action) return
  e.preventDefault()
  registry.run(action.id)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  // Un drag di Merlino fuori da una destinazione: cursore "vietato" invece di "apri come repository"
  if (drag.source && e.dataTransfer) e.dataTransfer.dropEffect = 'none'
}

function onDrop(e: DragEvent) {
  // Il drag nativo dei file di Merlino arriva come un drag di file: non va aperto come repository
  if (drag.source) {
    resetDrag()
    return
  }
  const file = e.dataTransfer?.files[0]
  if (file) void app.open(window.api.pathForFile(file))
}

// Il sistema non manda dragend dopo un drag nativo: il primo movimento del mouse dopo il rilascio azzera lo stato
const onMouseMove = () => {
  if (drag.source) resetDrag()
}

let offMenu: () => void = () => {}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousemove', onMouseMove)
  offMenu = window.api.onMenuAction((id) => registry.run(id))
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousemove', onMouseMove)
  offMenu()
})
</script>

<template>
  <div class="app" @dragover="onDragOver" @drop.prevent="onDrop">
    <div v-if="!app.git" class="center muted">{{ t('app.starting') }}</div>
    <SettingsView v-else-if="app.settingsSection" />
    <GitMissing v-else-if="!app.git.ok" />
    <template v-else>
      <TabBar />
      <div v-if="app.cloneProgress" class="clone-bar muted" data-testid="clone-progress">{{ app.cloneProgress }}</div>
      <div v-if="app.error" class="error-bar">
        <span>{{ app.error }}</span>
        <button :aria-label="t('common.closeError')" @click="app.error = null">×</button>
      </div>
      <main class="main">
        <RepoView v-if="app.active" :key="app.active" :root="app.active" />
        <WelcomeScreen v-else />
      </main>
    </template>
    <OutputPanel v-if="app.outputOpen" />
    <CommandPalette v-if="app.paletteOpen" />
    <PromptDialog v-if="app.promptRequest" :request="app.promptRequest" />
    <DropHint />
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.main { flex: 1; min-height: 0; overflow: hidden; }
.error-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.error-bar span { flex: 1; }
.clone-bar { padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
