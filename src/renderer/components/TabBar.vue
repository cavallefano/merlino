<script setup lang="ts">
import { shortcuts } from '../../shared/shortcuts'
import { registry } from '../actions/builtin'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'

const app = useAppStore()
const name = (root: string) => useRepoStore(root).info?.name ?? root
const paletteKeys = registry.keyLabel(shortcuts['palette.open'])
</script>

<template>
  <nav class="tabs">
    <div
      v-for="root in app.tabs"
      :key="root"
      class="tab"
      :class="{ active: root === app.active }"
      :title="root"
      data-testid="tab"
      @click="app.activate(root)"
    >
      <span>{{ name(root) }}</span>
      <button class="close" aria-label="Chiudi tab" @click.stop="app.close(root)">×</button>
    </div>
    <button class="add" aria-label="Apri repository" @click="app.pickAndOpen()">+</button>
    <span class="spacer" />
    <button class="palette" data-testid="palette-button" @click="app.paletteOpen = true">
      Comandi <kbd>{{ paletteKeys }}</kbd>
    </button>
  </nav>
</template>

<style scoped>
.tabs { display: flex; align-items: stretch; min-height: 34px; background: var(--bg-alt); border-bottom: 1px solid var(--border); }
.tab { display: flex; align-items: center; gap: 6px; max-width: 220px; padding: 0 6px 0 12px; border-right: 1px solid var(--border); cursor: default; }
.tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab.active { background: var(--bg); box-shadow: inset 0 -2px var(--accent); }
.close, .add { border: 0; background: transparent; padding: 2px 6px; }
.palette { align-self: center; margin: 0 8px; padding: 2px 8px; }
.palette kbd { color: var(--fg-muted); }
</style>
