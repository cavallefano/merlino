<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { BlameCommit, BlameResult } from '../../shared/types'
import { formatDate, formatShortDate } from '../history/format'
import { highlighter } from '../history/highlight'
import { t } from '../i18n'
import { useLayout } from '../layout'
import { type BlameTarget, useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const layout = useLayout()
const dialog = ref<HTMLDialogElement | null>(null)

/** Le revisioni viste, l'ultima in fondo: ← torna alla precedente. Il popup è montato solo con repo.blame impostato. */
const stack = ref<BlameTarget[]>(repo.blame ? [repo.blame] : [])
const current = computed(() => stack.value[stack.value.length - 1])
const ignoreWhitespace = ref(repo.diffOptions.ignoreWhitespace)
const result = shallowRef<BlameResult | null>(null)
const failure = ref<string | null>(null)
/** Il commit scelto con un clic sulla colonna. */
const picked = ref<string | null>(null)
let request = 0

/** Lo SHA di zeri: righe non ancora nel commit. */
const isLocal = (sha: string) => /^0+$/.test(sha)

async function load() {
  const target = current.value
  if (!target) return
  const id = ++request
  result.value = null
  failure.value = null
  picked.value = null
  const r = await window.api.blame(props.root, target.sha, target.path, ignoreWhitespace.value)
  if (id !== request) return
  if (r.ok) result.value = r.value
  else failure.value = r.error.message
}

const highlight = computed(() => highlighter(current.value?.path ?? ''))
const rows = computed(() => {
  const b = result.value
  if (!b) return []
  return b.lines.map((line, i) => ({
    no: i + 1,
    text: line.text,
    commit: b.commits[line.sha],
    /** Prima riga di un blocco: righe consecutive dello stesso commit. */
    first: i === 0 || b.lines[i - 1]?.sha !== line.sha,
  }))
})
const pickedCommit = computed(() => (picked.value ? result.value?.commits[picked.value] : undefined))

const tooltip = (c: BlameCommit) => (isLocal(c.sha) ? t('blame.notCommitted') : `${c.summary}\n${c.author} · ${formatDate(c.authorTime)}`)

function go(target: BlameTarget) {
  stack.value = [...stack.value, target]
  void load()
}

function back() {
  stack.value = stack.value.slice(0, -1)
  void load()
}

function close() {
  repo.blame = null
}

function showCommit(sha: string) {
  close()
  repo.page = 'history'
  void repo.select(sha)
}

onMounted(() => {
  const el = dialog.value
  if (!el) return
  // Stessa misura e posizione del popup del diff
  const width = Math.min(layout.dialog?.width ?? window.innerWidth * 0.85, window.innerWidth - 16)
  const height = Math.min(layout.dialog?.height ?? window.innerHeight * 0.85, window.innerHeight - 16)
  Object.assign(el.style, {
    width: `${width}px`,
    height: `${height}px`,
    left: `${(window.innerWidth - width) / 2}px`,
    top: `${(window.innerHeight - height) / 2}px`,
  })
  el.showModal()
  el.focus()
  void load()
})

onBeforeUnmount(() => {
  const el = dialog.value
  if (el) layout.dialog = { width: el.offsetWidth, height: el.offsetHeight }
  repo.blame = null
})
</script>

<template>
  <dialog ref="dialog" class="blame-dialog" data-testid="blame-dialog" tabindex="-1" @cancel.prevent="close">
    <header class="bar">
      <button data-testid="blame-back" :aria-label="t('blame.back')" :title="t('blame.back')" :disabled="stack.length < 2" @click="back">←</button>
      <strong class="path" data-testid="blame-path">{{ current?.path }}</strong>
      <code class="muted" data-testid="blame-revision">{{ current?.sha ? current.sha.slice(0, 7) : t('blame.localVersion') }}</code>
      <span class="spacer" />
      <label>
        <input v-model="ignoreWhitespace" type="checkbox" data-testid="blame-whitespace" @change="load" />
        {{ t('diff.ignoreWhitespace') }}
      </label>
      <button class="close" data-testid="blame-close" :aria-label="t('common.close')" @click="close">×</button>
    </header>
    <p v-if="failure" class="note error">{{ failure }}</p>
    <p v-else-if="!result" class="note muted">{{ t('blame.loading') }}</p>
    <p v-else-if="result.binary" class="note muted">{{ t('diff.binary') }}</p>
    <div v-else class="lines">
      <div
        v-for="row in rows"
        :key="row.no"
        class="line"
        :class="{ first: row.first, picked: !!row.commit && row.commit.sha === picked }"
        data-testid="blame-line"
      >
        <span class="who" :title="row.commit && tooltip(row.commit)" data-testid="blame-commit" @click="picked = row.commit?.sha ?? null">
          <template v-if="row.first && row.commit">
            <template v-if="isLocal(row.commit.sha)">{{ t('blame.notCommitted') }}</template>
            <template v-else>
              <code>{{ row.commit.sha.slice(0, 7) }}</code>
              <span class="author">{{ row.commit.author }}</span>
              <span class="date">{{ formatShortDate(row.commit.authorTime) }}</span>
            </template>
          </template>
        </span>
        <span class="no">{{ row.no }}</span>
        <!-- highlight.js e escapeHtml restituiscono HTML già sicuro -->
        <code class="text" v-html="highlight(row.text)" />
      </div>
    </div>
    <footer v-if="pickedCommit" class="commit" data-testid="blame-picked">
      <div class="info">
        <template v-if="isLocal(pickedCommit.sha)">
          <strong>{{ t('blame.notCommitted') }}</strong>
        </template>
        <template v-else>
          <strong>{{ pickedCommit.summary }}</strong>
          <span class="muted">{{ pickedCommit.author }} &lt;{{ pickedCommit.authorEmail }}&gt; · {{ formatDate(pickedCommit.authorTime) }}</span>
          <code class="muted">{{ pickedCommit.sha }}</code>
        </template>
      </div>
      <button data-testid="blame-show-commit" :disabled="isLocal(pickedCommit.sha)" @click="showCommit(pickedCommit.sha)">{{ t('blame.showCommit') }}</button>
      <button data-testid="blame-parent" :disabled="!pickedCommit.previous" @click="pickedCommit.previous && go(pickedCommit.previous)">
        {{ t('blame.parent') }}
      </button>
    </footer>
  </dialog>
</template>

<style scoped>
/* Misura e posizione in px (onMounted), come il popup del diff; resize: both dall'angolo in basso a destra */
.blame-dialog { inset: auto; margin: 0; padding: 0; max-width: none; max-height: none; min-width: 480px; min-height: 300px; overflow: hidden; resize: both; }
.blame-dialog[open] { display: flex; flex-direction: column; }
.blame-dialog:focus { outline: none; }
.bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 12px; }
.bar button { padding: 1px 8px; font-size: 12px; }
.path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.close { border: 0; background: transparent; font-size: 16px; }
.note { padding: 12px; }
.lines { flex: 1; min-height: 0; overflow: auto; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: var(--code-size, 12px); tab-size: var(--tab-size, 4); }
.line { display: grid; grid-template-columns: 230px 44px 1fr; line-height: 18px; content-visibility: auto; contain-intrinsic-size: auto 18px; }
.line.first:not(:first-child) { border-top: 1px solid var(--border); }
.line.picked { background: var(--selected-bg); }
.who { display: flex; gap: 6px; min-width: 0; padding: 0 8px; overflow: hidden; white-space: nowrap; background: var(--bg-alt); color: var(--fg-muted); font-family: system-ui, sans-serif; font-size: 11px; cursor: pointer; }
.who code { font-size: 11px; }
.author { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.date { font-variant-numeric: tabular-nums; }
.no { padding-right: 8px; color: var(--fg-muted); text-align: right; user-select: none; }
.text { white-space: pre; font-size: inherit; }
.commit { display: flex; align-items: center; gap: 8px; justify-content: flex-start; margin: 0; padding: 8px 10px; border-top: 1px solid var(--border); font-size: 12px; }
.commit button { padding: 2px 10px; font-size: 12px; }
.info { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.info > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
