<script setup lang="ts">
import { t } from '../i18n'
import { computed } from 'vue'
import { formatDate } from '../history/format'
import { useRepoStore } from '../stores/repo'
import { fileDragSource } from '../drag/drag'
import DiffView from './DiffView.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const commit = computed(() => repo.detail?.commit)
const lines = computed(() => repo.detail?.message.split('\n') ?? [])
const body = computed(() => lines.value.slice(1).join('\n').trim())
const showCommitter = computed(
  () => commit.value && (commit.value.committer !== commit.value.author || commit.value.commitTime !== commit.value.authorTime),
)
const copy = (text: string) => navigator.clipboard.writeText(text)
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
      <ul class="files">
        <li
          v-for="f in repo.detail.files"
          :key="f.path"
          :class="{ selected: f.path === repo.selectedFile?.path }"
          data-testid="file-row"
          v-bind="fileDragSource(repo, { kind: 'commitFile', sha: commit.sha, path: f.path }, { path: f.path, sha: commit.sha })"
          @click="repo.selectFile(f)"
        >
          <span class="status" :class="f.status">{{ f.status }}</span>
          <span class="path">{{ f.oldPath ? `${f.oldPath} → ${f.path}` : f.path }}</span>
          <span class="stat">
            <span class="plus">+{{ f.added ?? '–' }}</span>
            <span class="minus">−{{ f.deleted ?? '–' }}</span>
          </span>
        </li>
      </ul>
      <div class="diff-bar">
        <span class="path muted">{{ repo.selectedFile?.path }}</span>
        <button data-testid="diff-split" @click="repo.toggleSplit()">{{ repo.diffOptions.split ? t('diff.unified') : t('diff.split') }}</button>
        <label>
          <input type="checkbox" data-testid="diff-whitespace" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
          {{ t('diff.ignoreWhitespace') }}
        </label>
      </div>
      <DiffView v-if="repo.diff" :diff="repo.diff" :split="repo.diffOptions.split" @force="repo.loadDiff(true)" />
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
.files { max-height: 25%; margin: 0; padding: 4px 0; overflow: auto; list-style: none; border-bottom: 1px solid var(--border); }
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
