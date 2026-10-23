<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { latestVersionTag, nextVersion } from '../../shared/flow'
import type { FlowType } from '../../shared/types'
import { t } from '../i18n'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const type: FlowType = repo.flowDialog?.kind === 'start' ? repo.flowDialog.type : 'feature'
const config = repo.flow
const tags = repo.refs?.tags.map((x) => x.name) ?? []
const versioned = type === 'release' || type === 'hotfix' || type === 'support'
const name = ref(config && versioned ? nextVersion(tags, config.versionTag, type) : '')
const local = repo.refs?.branches.map((b) => b.name) ?? []
/** Basi proposte: per i support qualunque tag o commit (testo libero con i tag come suggerimento). */
const bases = computed(() => {
  if (!config) return []
  if (type === 'release') return [config.develop]
  if (type === 'hotfix') return [config.main, ...local.filter((b) => b.startsWith(config.prefixes.support))]
  if (type === 'support') return tags
  return [config.develop, ...local.filter((b) => b !== config.develop)]
})
const base = ref(!config ? '' : type === 'hotfix' ? config.main : type === 'support' ? (latestVersionTag(tags, config.versionTag) ?? config.main) : config.develop)
const checkout = ref(true)
const remotes = repo.refs?.remotes.map((r) => r.name) ?? []
const remote = remotes.includes('origin') ? 'origin' : (remotes[0] ?? null)
const publish = ref(false)
const branch = computed(() => `${config?.prefixes[type] ?? ''}${name.value.trim()}`)
onMounted(() => dialog.value?.showModal())

function close() {
  repo.flowDialog = null
}

async function start() {
  if (!name.value.trim() || !base.value.trim()) return
  close()
  await repo.git({ kind: 'flowStart', type, name: name.value.trim(), base: base.value.trim(), checkout: checkout.value, publish: publish.value ? remote : null })
}
</script>

<template>
  <dialog ref="dialog" data-testid="flow-start-dialog" @cancel.prevent="close">
    <form @submit.prevent="start">
      <h2>{{ t(`flow.startTitle.${type}`) }}</h2>
      <label class="field">
        <span>{{ versioned ? t('flow.version') : t('flow.name') }}</span>
        <input v-model="name" data-testid="flow-name" />
      </label>
      <label class="field">
        <span>{{ t('flow.base') }}</span>
        <input v-if="type === 'support'" v-model="base" list="flow-bases" data-testid="flow-base" />
        <select v-else v-model="base" data-testid="flow-base">
          <option v-for="b in bases" :key="b" :value="b">{{ b }}</option>
        </select>
        <datalist id="flow-bases"><option v-for="b in bases" :key="b" :value="b" /></datalist>
      </label>
      <p v-if="name.trim()" class="hint">{{ t('flow.willCreate', { branch, base }) }}</p>
      <label class="check"><input v-model="checkout" type="checkbox" data-testid="flow-checkout" /> {{ t('branch.checkoutNew') }}</label>
      <label v-if="remote" class="check"><input v-model="publish" type="checkbox" data-testid="flow-publish" /> {{ t('flow.publish', { remote }) }}</label>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="flow-start" :disabled="!name.trim() || !base.trim() || !!repo.busy">{{ t('flow.start') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(460px, 92vw); }
.hint { margin: -4px 0 10px; font-size: 12px; color: var(--fg-muted); }
</style>
