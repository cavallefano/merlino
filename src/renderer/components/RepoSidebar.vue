<script setup lang="ts">
import type { StashEntry } from '../../shared/types'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

function drop(stash: StashEntry) {
  if (window.confirm(`Eliminare lo stash "${stash.message}"? Non si può annullare.`)) void repo.stashAction('drop', stash.ref)
}
</script>

<template>
  <aside class="sidebar">
    <section>
      <h3>Stash <span class="muted">{{ repo.stashes.length }}</span></h3>
      <p v-if="!repo.stashes.length" class="muted empty">Nessuno stash</p>
      <ul>
        <li
          v-for="s in repo.stashes"
          :key="s.ref"
          :class="{ selected: repo.view === 'commit' && repo.selected === s.sha }"
          :title="s.message"
          data-testid="stash-item"
          @click="repo.select(s.sha)"
        >
          <span class="name">{{ s.message }}</span>
          <span class="actions" @click.stop>
            <button data-testid="stash-apply" title="Applica" @click="repo.stashAction('apply', s.ref)">Applica</button>
            <button data-testid="stash-pop" title="Applica ed elimina" @click="repo.stashAction('pop', s.ref)">Pop</button>
            <button data-testid="stash-drop" title="Elimina" @click="drop(s)">✕</button>
          </span>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.sidebar { min-width: 0; min-height: 0; overflow: auto; background: var(--bg-alt); border-right: 1px solid var(--border); }
h3 { margin: 0; padding: 8px 12px 4px; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fg-muted); }
ul { margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 4px; padding: 3px 8px 3px 16px; cursor: default; }
li:hover { background: var(--bg-hover); }
li.selected { background: var(--accent); color: var(--accent-fg); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Visibili al passaggio del mouse o al focus, senza togliere i pulsanti dal layout */
.actions { display: flex; gap: 2px; opacity: 0; }
li:hover .actions, li:focus-within .actions, li.selected .actions { opacity: 1; }
.actions button { padding: 0 5px; font-size: 11px; }
.empty { margin: 0; padding: 2px 16px 8px; font-size: 12px; }
</style>
