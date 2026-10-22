<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { registerBuiltinActions, registry } from './actions/builtin'
import CommandPalette from './components/CommandPalette.vue'
import GitMissing from './components/GitMissing.vue'
import OutputPanel from './components/OutputPanel.vue'
import RepoView from './components/RepoView.vue'
import TabBar from './components/TabBar.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { useAppStore } from './stores/app'

const app = useAppStore()
registerBuiltinActions()

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
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.main { flex: 1; min-height: 0; overflow: auto; }
.error-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--danger-bg); color: var(--danger); border-bottom: 1px solid var(--border); }
.error-bar span { flex: 1; }
</style>
