<script setup lang="ts">
import { computed } from 'vue'
import type { TreeEntry } from '../../shared/types'
import { t } from '../i18n'
import { useRepoStore } from '../stores/repo'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)

/** Lo stato dei file cambiati nel commit, per segnarli nell'albero. */
const changed = computed(() => new Map(repo.detail?.files.map((f) => [f.path, f.status])))

/** Le voci visibili: la radice e, dentro, le cartelle aperte e già caricate. */
const rows = computed(() => {
  const out: { entry: TreeEntry; depth: number }[] = []
  const walk = (dir: string, depth: number) => {
    for (const entry of repo.treeDirs.get(dir) ?? []) {
      out.push({ entry, depth })
      if (entry.kind === 'folder' && repo.treeOpen.has(entry.path)) walk(entry.path, depth + 1)
    }
  }
  walk('', 0)
  return out
})

function click(entry: TreeEntry) {
  if (entry.kind === 'folder') void repo.toggleTreeDir(entry.path)
  else void repo.selectTreeFile(entry)
}
</script>

<template>
  <ul class="tree" data-testid="file-tree">
    <li v-if="repo.treeDirs.has('') && !rows.length" class="muted">{{ t('tree.empty') }}</li>
    <li
      v-for="{ entry, depth } in rows"
      :key="entry.path"
      :class="{ selected: entry.kind !== 'folder' && entry.path === repo.treeFile?.path }"
      :style="{ paddingLeft: `${12 + depth * 14}px` }"
      :title="entry.path"
      data-testid="tree-row"
      @click="click(entry)"
    >
      <span class="slot"><AppIcon v-if="entry.kind === 'folder'" name="chevron" class="chevron" :class="{ open: repo.treeOpen.has(entry.path) }" /></span>
      <AppIcon :name="entry.kind !== 'folder' ? 'file' : repo.treeOpen.has(entry.path) ? 'folderOpen' : 'folder'" class="kind" />
      <span class="name">{{ entry.name }}</span>
      <span v-if="changed.get(entry.path)" class="status" :class="changed.get(entry.path)">{{ changed.get(entry.path) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.tree { margin: 0; padding: 4px 0; list-style: none; user-select: none; }
li { display: flex; align-items: center; gap: 5px; padding: 2px 12px; cursor: default; }
li:hover { background: var(--bg-hover); }
li.selected { background: var(--bg-hover); font-weight: 600; }
/* La freccia in uno spazio fisso, come nella sidebar: le icone di una stessa profondità restano allineate */
.slot { display: flex; justify-content: center; width: 12px; flex: none; }
.chevron { width: 10px; height: 10px; transition: transform 0.12s; }
.chevron.open { transform: rotate(90deg); }
.kind { color: var(--fg-muted); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { width: 14px; font-weight: 700; text-align: center; }
.status.A { color: #2da44e; }
.status.D { color: var(--danger); }
.status.M { color: #bf8700; }
.status.R, .status.C { color: #8250df; }
</style>
