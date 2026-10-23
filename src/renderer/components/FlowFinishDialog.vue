<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { FlowFinishInfo } from '../../shared/types'
import { t } from '../i18n'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const prs = usePullRequestStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const branch = repo.flowDialog?.kind === 'finish' ? repo.flowDialog.branch : ''
const info = shallowRef<FlowFinishInfo | null>(null)
const failed = ref<string | null>(null)
/** Preferenze del dialog, per repository (una comodità locale). */
const key = (name: string) => `merlino.flow:${props.root}:${name}`
const canPr = computed(() => prs.withAccount.length > 0)
const way = ref<'local' | 'pr'>(localStorage.getItem(key('way')) === 'pr' ? 'pr' : 'local')
const update = ref(true)
const tagMessage = ref('')
const deleteBranch = ref(true)
const deleteRemote = ref(true)
const push = ref(localStorage.getItem(key('push')) === '1')

const tracked = computed(() => info.value?.targets.filter((x) => x.upstream) ?? [])
const remote = computed(() => tracked.value[0]?.remote ?? null)
const names = (list: { branch: string }[]) => list.map((x) => x.branch).join(', ')
const kind = computed(() => (info.value?.type === 'release' ? 'Release' : 'Hotfix'))
/** I passi che farà il merge locale, con le opzioni scelte. */
const steps = computed(() => {
  const i = info.value
  if (!i) return []
  const lines: string[] = []
  if (update.value) for (const x of tracked.value) lines.push(t('flow.step.update', { branch: x.branch, upstream: x.upstream ?? '' }))
  // Come il Finish: merge nella prima destinazione, tag, poi il tag nelle altre
  const [first, ...rest] = i.targets
  if (first && !first.merged) lines.push(t('flow.step.merge', { branch: i.branch, into: first.branch }))
  if (i.tag && !i.tag.exists) lines.push(t('flow.step.tag', { tag: i.tag.name }))
  for (const x of rest) if (!x.merged) lines.push(t('flow.step.merge', { branch: i.tag?.name ?? i.branch, into: x.branch }))
  if (push.value && remote.value) lines.push(t('flow.step.push', { remote: remote.value }))
  if (deleteBranch.value) lines.push(t('flow.step.delete', { branch: i.branch }))
  return lines
})

onMounted(async () => {
  dialog.value?.showModal()
  const r = await window.api.flowFinishInfo(props.root, branch)
  if (!r.ok) {
    failed.value = r.error.message
    return
  }
  info.value = r.value
  tagMessage.value = `${r.value.type === 'release' ? 'Release' : 'Hotfix'} ${r.value.name}`
  if (!canPr.value) way.value = 'local'
})

function close() {
  repo.flowDialog = null
}

async function finish() {
  const i = info.value
  if (!i) return
  localStorage.setItem(key('way'), way.value)
  close()
  if (way.value === 'pr') {
    const first = i.targets[0]?.branch ?? ''
    prs.creating = { branch: i.branch, base: first, ...(i.tag ? { title: `${kind.value} ${i.name}` } : {}) }
    return
  }
  localStorage.setItem(key('push'), push.value ? '1' : '0')
  await repo.git({
    kind: 'flowFinish',
    branch: i.branch,
    update: update.value && tracked.value.length > 0,
    tagMessage: tagMessage.value,
    deleteBranch: deleteBranch.value,
    deleteRemote: deleteRemote.value && !!i.remote,
    push: push.value && !!remote.value,
  })
}
</script>

<template>
  <dialog ref="dialog" data-testid="flow-finish-dialog" @cancel.prevent="close">
    <form @submit.prevent="finish">
      <h2>{{ info ? t(`flow.finishTitle.${info.type}`, { name: info.name }) : branch }}</h2>
      <p v-if="failed" class="error">{{ failed }}</p>
      <template v-if="info">
        <div v-if="canPr" class="ways">
          <label class="check"><input v-model="way" type="radio" value="local" data-testid="flow-way-local" /> {{ t('flow.wayLocal') }}</label>
          <label class="check"><input v-model="way" type="radio" value="pr" data-testid="flow-way-pr" /> {{ t('flow.wayPr') }}</label>
        </div>
        <template v-if="way === 'local'">
          <label v-if="tracked.length && remote" class="check">
            <input v-model="update" type="checkbox" data-testid="flow-update" /> {{ t('flow.update', { branches: names(tracked), remote }) }}
          </label>
          <label v-if="info.tag && !info.tag.exists" class="field">
            <span>{{ t('flow.tagMessage') }} ({{ info.tag.name }})</span>
            <input v-model="tagMessage" data-testid="flow-tag-message" />
          </label>
          <div class="check">
            <label class="check"><input v-model="deleteBranch" type="checkbox" data-testid="flow-delete" /> {{ t('flow.deleteBranch') }}</label>
            <label v-if="deleteBranch && info.remote" class="check"><input v-model="deleteRemote" type="checkbox" data-testid="flow-delete-remote" /> {{ t('flow.deleteRemote', { remote: info.remote }) }}</label>
          </div>
          <label v-if="remote" class="check">
            <input v-model="push" type="checkbox" data-testid="flow-push" />
            {{ info.tag ? t('flow.pushTag', { branches: names(tracked), remote }) : t('flow.push', { branches: names(tracked), remote }) }}
          </label>
          <ol class="steps" data-testid="flow-steps">
            <li v-for="s in steps" :key="s">{{ s }}</li>
          </ol>
        </template>
        <p v-else-if="info.tag" class="hint">{{ t('flow.prHint', { tag: info.tag.name, develop: info.targets[1]?.branch ?? '' }) }}</p>
      </template>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="flow-finish" :disabled="!info || !!repo.busy">{{ way === 'pr' ? t('flow.continue') : t('flow.finish') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(540px, 92vw); }
.ways { display: flex; gap: 16px; margin-bottom: 12px; }
.check { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
div.check { gap: 14px; }
.steps { margin: 10px 0 0; padding: 8px 8px 8px 28px; font-size: 12px; color: var(--fg-muted); background: var(--bg-alt); border-radius: 5px; }
.hint { font-size: 12px; color: var(--fg-muted); }
.error { font-size: 12px; }
</style>
