<script setup lang="ts">
import { t } from '../i18n'
import { computed, onMounted, ref } from 'vue'
import type { RebaseAction } from '../../shared/types'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const ACTIONS: RebaseAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']

interface Row {
  sha: string
  subject: string
  action: RebaseAction
  message: string
}

// Come nella storia: il più recente in alto. Si applicano dal basso.
const rows = ref<Row[]>(repo.rebasePlan?.commits.map((c) => ({ sha: c.sha, subject: c.subject, action: 'pick', message: '' })) ?? [])
const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())

const problem = computed(() => {
  const first = rows.value.findLast((r) => r.action !== 'drop')
  if (first?.action === 'squash' || first?.action === 'fixup') return t('rebase.firstSquash')
  if (rows.value.some((r) => r.action === 'reword' && !r.message.trim())) return t('rebase.emptyReword')
  return null
})

function move(i: number, step: -1 | 1) {
  const next = [...rows.value]
  next.splice(i + step, 0, ...next.splice(i, 1))
  rows.value = next
}

async function setAction(row: Row, action: RebaseAction) {
  row.action = action
  if (action !== 'reword' || row.message) return
  row.message = row.subject
  // Il messaggio completo (con il corpo) arriva dal dettaglio; se intanto l'utente l'ha cambiato, resta il suo
  const r = await window.api.commitDetail(props.root, row.sha)
  if (r.ok && row.message === row.subject) row.message = r.value.message
}

function close() {
  repo.rebasePlan = null
}

async function start() {
  const plan = repo.rebasePlan
  if (!plan || problem.value) return
  const steps = rows.value.toReversed().map((r) => (r.action === 'reword' ? { sha: r.sha, action: r.action, message: r.message } : { sha: r.sha, action: r.action }))
  close()
  await repo.git({ kind: 'rebaseInteractive', sha: plan.sha, steps })
}
</script>

<template>
  <dialog ref="dialog" data-testid="rebase-dialog" @cancel.prevent="close">
    <form @submit.prevent="start">
      <h2>{{ t('rebase.title') }}</h2>
      <p class="muted">{{ t('rebase.hint') }}</p>
      <ol>
        <li v-for="(row, i) in rows" :key="row.sha" data-testid="rebase-row">
          <div class="line">
            <select
              :value="row.action"
              data-testid="rebase-action"
              @change="setAction(row, ($event.target as HTMLSelectElement).value as RebaseAction)"
            >
              <option v-for="a in ACTIONS" :key="a" :value="a">{{ a }}</option>
            </select>
            <code>{{ row.sha.slice(0, 7) }}</code>
            <span class="subject" :class="{ dropped: row.action === 'drop' }">{{ row.subject }}</span>
            <button type="button" :aria-label="t('rebase.moveUp')" :disabled="i === 0" @click="move(i, -1)">↑</button>
            <button type="button" :aria-label="t('rebase.moveDown')" :disabled="i === rows.length - 1" @click="move(i, 1)">↓</button>
          </div>
          <textarea v-if="row.action === 'reword'" v-model="row.message" data-testid="rebase-message" rows="3" />
        </li>
      </ol>
      <footer>
        <span class="error">{{ problem }}</span>
        <span class="spacer" />
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="rebase-start" :disabled="!!problem">{{ t('rebase.start') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(720px, 92vw); }
p { margin: 0 0 8px; font-size: 12px; }
ol { max-height: 55vh; margin: 0; padding: 0; overflow: auto; list-style: none; border: 1px solid var(--border); border-radius: 5px; }
li { padding: 4px 8px; border-bottom: 1px solid var(--border); }
li:last-child { border-bottom: 0; }
.line { display: flex; align-items: center; gap: 8px; }
select { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 2px 4px; }
.subject { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dropped { text-decoration: line-through; color: var(--fg-muted); }
.line button { padding: 0 7px; }
textarea { width: 100%; margin-top: 4px; font: 12px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; resize: vertical; }
footer .error { font-size: 12px; }
</style>
