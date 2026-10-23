<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { HostingRepo, MergeMethod } from '../../shared/types'
import { t } from '../i18n'
import { defaultMergeMessage } from '../pull-requests/model'
import { usePullRequestStore } from '../stores/pull-requests'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const pr = computed(() => prs.detail)
const settings = shallowRef<HostingRepo | null>(null)
const method = ref<MergeMethod>('merge')
const squash = ref(false)
const message = ref('')
const deleteBranch = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
const service = computed(() => prs.current?.account?.service ?? 'github')
const ci = computed(() => (pr.value ? prs.ci.get(pr.value.head.sha) : undefined))
// Il messaggio serve solo se il merge crea un commit
const showMessage = computed(() => method.value === 'merge' || method.value === 'squash' || squash.value)

/** Messaggio proposto dal metodo scelto (e dallo squash di GitLab). */
function fill() {
  if (pr.value) message.value = defaultMergeMessage(service.value, method.value, squash.value, pr.value)
}
watch([method, squash], fill)

function close() {
  prs.merging = false
}

onMounted(async () => {
  dialog.value?.showModal()
  const r = await window.api.prRepo(props.root, prs.remote ?? '')
  if (!r.ok) {
    prs.error = r.error
    close()
    return
  }
  settings.value = r.value
  method.value = r.value.methods[0] ?? 'merge'
  squash.value = r.value.squash === 'always' || r.value.squash === 'default'
  deleteBranch.value = r.value.deleteBranch
  fill()
})

async function submit() {
  const p = pr.value
  if (!p || !settings.value || p.mergeBlock) return
  close()
  await prs.merge({
    method: method.value,
    // Lo SHA mostrato: se nel frattempo la PR è cambiata, il servizio rifiuta
    sha: p.head.sha,
    message: showMessage.value ? message.value : '',
    squash: squash.value,
    deleteBranch: deleteBranch.value && !p.fork,
  })
}
</script>

<template>
  <dialog ref="dialog" data-testid="merge-dialog" @cancel.prevent="close">
    <form v-if="pr" @submit.prevent="submit">
      <h2>{{ t('merge.title', { number: pr.number }) }}</h2>
      <p v-if="pr.mergeBlock" class="error" data-testid="merge-block">{{ t(`merge.block.${pr.mergeBlock}`) }}</p>
      <p v-else-if="ci?.summary === 'failed'" class="warning" data-testid="merge-warning">{{ t('merge.optionalFailed') }}</p>
      <template v-if="settings">
        <label v-if="settings.methods.length > 1" class="field">
          <span>{{ t('merge.methodLabel') }}</span>
          <select v-model="method" data-testid="merge-method">
            <option v-for="m in settings.methods" :key="m" :value="m">{{ t(`merge.method.${m}`) }}</option>
          </select>
        </label>
        <label v-if="settings.squash && settings.squash !== 'never'" class="check">
          <input v-model="squash" type="checkbox" :disabled="settings.squash === 'always'" data-testid="merge-squash" />
          {{ t('merge.squash') }}
        </label>
        <label v-if="showMessage" class="field">
          <span>{{ t('merge.message') }}</span>
          <textarea v-model="message" rows="6" data-testid="merge-message" />
        </label>
        <label v-if="!pr.fork" class="check">
          <input v-model="deleteBranch" type="checkbox" data-testid="merge-delete-branch" />
          {{ t('merge.deleteBranch', { branch: pr.head.branch }) }}
        </label>
      </template>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="merge-confirm" :disabled="!settings || !!pr.mergeBlock || prs.busy">{{ t('merge.confirm') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(560px, 92vw); }
.field textarea { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; }
.warning { color: #bf8700; }
p { margin: 0 0 10px; font-size: 12px; }
</style>
