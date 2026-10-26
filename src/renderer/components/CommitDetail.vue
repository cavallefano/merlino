<script setup lang="ts">
import { t } from '../i18n'
import { computed } from 'vue'
import type { FileChange } from '../../shared/types'
import { commitFileTarget, fileMenu, openBlame, selectedFileTarget } from '../actions/files'
import { formatDate } from '../history/format'
import { useRepoStore } from '../stores/repo'
import { fileDragSource } from '../drag/drag'
import { SIZES, useLayout } from '../layout'
import DiffView from './DiffView.vue'
import FileContentView from './FileContentView.vue'
import FileTree from './FileTree.vue'
import PaneSplitter from './PaneSplitter.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const layout = useLayout()
const commit = computed(() => repo.detail?.commit)
const lines = computed(() => repo.detail?.message.split('\n') ?? [])
const body = computed(() => lines.value.slice(1).join('\n').trim())
const showCommitter = computed(
  () => commit.value && (commit.value.committer !== commit.value.author || commit.value.commitTime !== commit.value.authorTime),
)
const copy = (text: string) => navigator.clipboard.writeText(text)
const target = computed(() => selectedFileTarget(repo))

function menu(f: FileChange) {
  if (!commit.value) return
  void repo.selectFile(f)
  void fileMenu(repo, commitFileTarget(commit.value.sha, f))
}
</script>

<template>
  <section class="detail">
    <p v-if="!repo.detail || !commit" class="muted center">{{ t('detail.selectCommit') }}</p>
    <template v-else>
      <header class="head">
        <div class="message" data-testid="commit-message">
          <strong>{{ lines[0] }}</strong>
          <pre v-if="body">{{ body }}</pre>
        </div>
        <dl>
          <dt>{{ t('detail.author') }}</dt>
          <dd>{{ commit.author }} &lt;{{ commit.authorEmail }}&gt; · {{ formatDate(commit.authorTime) }}</dd>
          <template v-if="showCommitter">
            <dt>Committer</dt>
            <dd>{{ commit.committer }} &lt;{{ commit.committerEmail }}&gt; · {{ formatDate(commit.commitTime) }}</dd>
          </template>
          <dt>SHA</dt>
          <dd>
            <code>{{ commit.sha }}</code>
            <button class="small" data-testid="copy-sha" @click="copy(commit.sha)">{{ t('detail.copy') }}</button>
          </dd>
          <template v-if="commit.parents.length">
            <dt>{{ t('detail.parents') }}</dt>
            <dd>
              <a v-for="p in commit.parents" :key="p" href="#" class="parent" @click.prevent="repo.select(p)">{{ p.slice(0, 7) }}</a>
            </dd>
          </template>
        </dl>
      </header>
      <div class="mode">
        <button :aria-pressed="repo.detailMode === 'changes'" data-testid="detail-changes" @click="repo.setDetailMode('changes')">
          {{ t('detail.changes') }}
        </button>
        <button :aria-pressed="repo.detailMode === 'tree'" data-testid="detail-tree" @click="repo.setDetailMode('tree')">
          {{ t('detail.allFiles') }}
        </button>
      </div>
      <ul v-if="repo.detailMode === 'changes'" class="files" :style="{ height: `${layout.commitFiles}px` }">
        <li
          v-for="f in repo.detail.files"
          :key="f.path"
          :class="{ selected: f.path === repo.selectedFile?.path }"
          data-testid="file-row"
          v-bind="fileDragSource(repo, { kind: 'commitFile', sha: commit.sha, path: f.path }, { path: f.path, sha: commit.sha })"
          @click="repo.selectFile(f)"
          @dblclick="repo.diffDialog = 'commit'"
          @contextmenu.prevent="menu(f)"
        >
          <span class="status" :class="f.status">{{ f.status }}</span>
          <span class="path">{{ f.oldPath ? `${f.oldPath} → ${f.path}` : f.path }}</span>
          <span class="stat">
            <span class="plus">+{{ f.added ?? '–' }}</span>
            <span class="minus">−{{ f.deleted ?? '–' }}</span>
          </span>
        </li>
      </ul>
      <FileTree v-else :root="root" class="files" :style="{ height: `${layout.commitFiles}px` }" />
      <PaneSplitter
        v-model="layout.commitFiles"
        orientation="row"
        :default-value="SIZES.commitFiles.default"
        :min="SIZES.commitFiles.min"
        :min-after="120"
        :label="t('layout.resize')"
        data-testid="split-files"
      />
      <div v-if="repo.detailMode === 'changes'" class="diff-area">
        <div class="diff-bar">
          <span class="path muted">{{ repo.selectedFile?.path }}</span>
          <button data-testid="diff-popup" :aria-label="t('diff.expand')" :title="t('diff.expand')" @click="repo.diffDialog = 'commit'">⤢</button>
          <button data-testid="file-blame" :disabled="!target?.blame" @click="openBlame(repo, target)">Blame</button>
          <button data-testid="diff-split" @click="repo.toggleSplit()">{{ repo.diffOptions.split ? t('diff.unified') : t('diff.split') }}</button>
          <label>
            <input type="checkbox" data-testid="diff-whitespace" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
            {{ t('diff.ignoreWhitespace') }}
          </label>
        </div>
        <DiffView v-if="repo.diff" :diff="repo.diff" :split="repo.diffOptions.split" @force="repo.loadDiff(true)" />
      </div>
      <div v-else class="diff-area">
        <template v-if="repo.treeFile && repo.fileContent">
          <div class="diff-bar">
            <span class="path muted">{{ repo.treeFile.path }}</span>
            <button data-testid="file-blame" :disabled="!target?.blame" @click="openBlame(repo, target)">Blame</button>
          </div>
          <FileContentView :path="repo.treeFile.path" :content="repo.fileContent" @force="repo.loadFileContent(true)" />
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.head { max-height: 35%; overflow: auto; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.message pre { margin: 6px 0 0; white-space: pre-wrap; font-family: inherit; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 10px 0 0; font-size: 12px; }
dt { color: var(--fg-muted); }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.small { padding: 0 6px; font-size: 11px; }
.parent { margin-right: 8px; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
.mode { display: flex; padding: 6px 12px 2px; }
.mode button { padding: 1px 10px; font-size: 12px; border-radius: 0; }
.mode button:first-child { border-radius: 5px 0 0 5px; }
.mode button:last-child { border-radius: 0 5px 5px 0; border-left: 0; }
.mode button[aria-pressed='true'] { background: var(--selected-bg); font-weight: 600; }
.files { flex: 0 1 auto; min-height: 48px; margin: 0; padding: 4px 0; overflow: auto; list-style: none; }
.diff-area { flex: 1 1 0; min-height: 120px; display: flex; flex-direction: column; }
.files li { display: flex; align-items: center; gap: 8px; padding: 2px 12px; cursor: default; }
.files li:hover { background: var(--bg-hover); }
.files li.selected { background: var(--bg-hover); font-weight: 600; }
.status { width: 14px; font-weight: 700; text-align: center; }
.status.A { color: #2da44e; }
.status.D { color: var(--danger); }
.status.M { color: #bf8700; }
.status.R, .status.C { color: #8250df; }
.path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat { font-size: 11px; font-variant-numeric: tabular-nums; }
.plus { color: #2da44e; margin-right: 4px; }
.minus { color: var(--danger); }
.diff-bar { display: flex; align-items: center; gap: 10px; padding: 4px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.diff-bar .path { flex: 1; }
.diff-bar button { padding: 1px 8px; font-size: 12px; }
</style>
