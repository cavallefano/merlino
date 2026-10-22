<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { registerBranchActions } from './actions/branches'
import { registerBuiltinActions, registry } from './actions/builtin'
import { registerHistoryActions } from './actions/history'
import { registerWorkingActions } from './actions/working'
import CommandPalette from './components/CommandPalette.vue'
import GitMissing from './components/GitMissing.vue'
import OutputPanel from './components/OutputPanel.vue'
import PromptDialog from './components/PromptDialog.vue'
import RepoView from './components/RepoView.vue'
import TabBar from './components/TabBar.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { useAppStore } from './stores/app'

const app = useAppStore()
registerBuiltinActions()
registerHistoryActions()
registerWorkingActions()
registerBranchActions()

function onKey(e: KeyboardEvent) {
  const action = registry.match(e)
  if (!action) return
  e.preventDefault()
  registry.run(action.id)
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0]
  if (file) void app.open(window.api.pathForFile(file))
}

let offMenu: () => void = () => {}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  offMenu = window.api.onMenuAction((id) => registry.run(id))
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  offMenu()
})
</script>

<template>
  <div class="app" @dragover.prevent @drop.prevent="onDrop">
    <div v-if="!app.git" class="center muted">Avvio…</div>
    <GitMissing v-else-if="!app.git.ok" />
    <template v-else>
      <TabBar />
      <div v-if="app.cloneProgress" class="clone-bar muted" data-testid="clone-progress">{{ app.cloneProgress }}</div>
      <div v-if="app.error" class="error-bar">
        <span>{{ app.error }}</span>
        <button aria-label="Chiudi errore" @click="app.error = null">×</button>
      </div>
      <main class="main">
        <RepoView v-if="app.active" :key="app.active" :root="app.active" />
        <WelcomeScreen v-else />
      </main>
    </template>
    <OutputPanel v-if="app.outputOpen" />
    <CommandPalette v-if="app.paletteOpen" />
    <PromptDialog v-if="app.promptRequest" :request="app.promptRequest" />
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.main { flex: 1; min-height: 0; overflow: hidden; }
.error-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.error-bar span { flex: 1; }
.clone-bar { padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
