<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../i18n'
import { registry } from '../actions/builtin'
import { flowMenu } from '../actions/flow'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import AppIcon from './AppIcon.vue'

const app = useAppStore()
/** Su macOS la toolbar è la barra del titolo: lascia spazio ai semafori e trascina la finestra. */
const mac = window.api.platform === 'darwin'
/** Il repository della tab attiva; nelle impostazioni nessuno, così restano solo il titolo e la bacchetta. */
const repo = computed(() => (app.active && !app.settingsSection ? useRepoStore(app.active) : null))

const head = computed(() => {
  const info = repo.value?.info
  if (!info) return ''
  if (info.branch) return info.branch
  return info.headSha ? t('repo.detachedHead', { sha: info.headSha.slice(0, 7) }) : t('repo.noCommits')
})

/** Pulsante di un'azione del registro: nome e scorciatoia nel tooltip, disattivo quando l'azione non si può eseguire. */
function tool(id: string) {
  const action = registry.get(id)
  const name = action?.title ?? id
  return {
    title: action?.keys ? `${name} (${registry.keyLabel(action.keys)})` : name,
    'aria-label': name,
    disabled: !registry.available(id),
    onClick: () => registry.run(id),
  }
}
</script>

<template>
  <header class="toolbar" :class="{ mac }">
    <div class="title">
      <strong data-testid="repo-name">{{ repo?.info?.name ?? 'Merlino' }}</strong>
      <span v-if="repo" class="subtitle">
        <span data-testid="repo-branch">{{ head }}</span>
        <span v-if="repo.busy && repo.progress" class="progress" data-testid="progress">{{ repo.progress }}</span>
      </span>
    </div>
    <span class="spacer" />
    <div class="group">
      <button data-testid="palette-button" v-bind="tool('palette.open')"><AppIcon name="wand" /></button>
    </div>
    <template v-if="repo">
      <div class="group">
        <button data-testid="fetch" v-bind="tool('remote.fetch')"><AppIcon name="fetch" /></button>
        <button data-testid="pull" v-bind="tool('remote.pull')">
          <AppIcon name="pull" />
          <span v-if="repo.status?.behind" class="badge" data-testid="pull-badge">{{ repo.status.behind }}</span>
        </button>
        <button data-testid="push" v-bind="tool('remote.push')">
          <AppIcon name="push" />
          <span v-if="repo.status?.ahead" class="badge" data-testid="push-badge">{{ repo.status.ahead }}</span>
        </button>
      </div>
      <div class="group">
        <button data-testid="stash-button" v-bind="tool('stash.push')"><AppIcon name="stash" /></button>
        <button data-testid="pop-button" v-bind="tool('stash.pop')"><AppIcon name="pop" /></button>
      </div>
      <div class="group">
        <button data-testid="branch-button" v-bind="tool('branch.create')"><AppIcon name="branchAdd" /></button>
        <button
          data-testid="flow-button"
          :title="t('flow.button')"
          :aria-label="t('flow.button')"
          :disabled="!!repo.busy"
          @click="flowMenu(repo)"
        ><AppIcon name="flow" /></button>
      </div>
      <div class="group">
        <button data-testid="search-button" v-bind="tool('history.search')"><AppIcon name="search" /></button>
        <button data-testid="layout-toggle" v-bind="tool('layout.toggle')">
          <AppIcon :name="app.preferences.panelLayout === 'vertical' ? 'columns' : 'rows'" />
        </button>
        <button data-testid="repo-refresh" v-bind="tool('repo.refresh')"><AppIcon name="refresh" /></button>
      </div>
    </template>
  </header>
</template>

<style scoped>
.toolbar { display: flex; flex: none; align-items: center; gap: 8px; height: 52px; padding: 0 12px; background: var(--bg-alt); border-bottom: 1px solid var(--border); user-select: none; }
/* I semafori stanno nei primi 80px (trafficLightPosition in src/main/index.ts) */
.toolbar.mac { padding-left: 84px; -webkit-app-region: drag; }
.toolbar.mac button { -webkit-app-region: no-drag; }
.title { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subtitle { display: flex; gap: 8px; min-width: 0; font-size: 11px; color: var(--fg-muted); white-space: nowrap; }
.progress { overflow: hidden; text-overflow: ellipsis; }
.group { display: flex; flex: none; overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: 7px; }
.group button { position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 28px; padding: 0; border: 0; border-radius: 0; background: transparent; }
.group button + button { border-left: 1px solid var(--border); }
.group button:hover:not(:disabled) { background: var(--bg-hover); }
.group .icon { width: 16px; height: 16px; }
.badge { position: absolute; top: 1px; right: 1px; min-width: 14px; padding: 0 3px; border-radius: 7px; background: var(--accent); color: var(--accent-fg); font-size: 9px; font-weight: 600; line-height: 14px; font-variant-numeric: tabular-nums; }
</style>
