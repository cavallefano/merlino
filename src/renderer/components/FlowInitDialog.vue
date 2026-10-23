<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DEFAULT_FLOW_PREFIXES, FLOW_TYPES } from '../../shared/flow'
import { t } from '../i18n'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const branches = computed(() => repo.refs?.branches.map((b) => b.name) ?? [])
const current = repo.flow
const guessMain = () => ['main', 'master'].find((n) => branches.value.includes(n)) ?? repo.info?.branch ?? 'main'
const form = reactive({
  main: current?.main ?? guessMain(),
  develop: current?.develop ?? 'develop',
  prefixes: { ...(current?.prefixes ?? DEFAULT_FLOW_PREFIXES) },
  versionTag: current?.versionTag ?? 'v',
})
const developMissing = computed(() => !branches.value.includes(form.develop.trim()))
/** Da dove nasce develop: il suo branch remoto se c'è (lo seguirà), altrimenti la produzione. */
const developSource = computed(() => {
  const remote = repo.refs?.remotes.find((r) => r.branches.some((b) => b.name === form.develop.trim()))
  return remote ? `${remote.name}/${form.develop.trim()}` : form.main
})
onMounted(() => dialog.value?.showModal())

function close() {
  repo.flowDialog = null
}

async function save() {
  const then = repo.flowDialog?.kind === 'init' ? repo.flowDialog.then : undefined
  close()
  const ok = await repo.git({ kind: 'flowInit', main: form.main.trim(), develop: form.develop.trim(), prefixes: { ...form.prefixes }, versionTag: form.versionTag.trim() })
  if (ok && then) repo.openFlow(then)
}
</script>

<template>
  <dialog ref="dialog" data-testid="flow-init-dialog" @cancel.prevent="close">
    <form @submit.prevent="save">
      <h2>{{ t('flow.initTitle') }}</h2>
      <label class="field">
        <span>{{ t('flow.mainBranch') }}</span>
        <input v-model="form.main" list="flow-branches" data-testid="flow-main" />
      </label>
      <label class="field">
        <span>{{ t('flow.developBranch') }}</span>
        <input v-model="form.develop" list="flow-branches" data-testid="flow-develop" />
      </label>
      <p v-if="developMissing" class="hint">{{ t('flow.developMissing', { source: developSource }) }}</p>
      <datalist id="flow-branches"><option v-for="b in branches" :key="b" :value="b" /></datalist>
      <h3>{{ t('flow.prefixes') }}</h3>
      <div class="prefixes">
        <label v-for="type in FLOW_TYPES" :key="type" class="field">
          <span>{{ t(`flow.type.${type}`) }}</span>
          <input v-model="form.prefixes[type]" :data-testid="`flow-prefix-${type}`" />
        </label>
        <label class="field">
          <span>{{ t('flow.versionTag') }}</span>
          <input v-model="form.versionTag" data-testid="flow-version-tag" />
        </label>
      </div>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="flow-init-save" :disabled="!form.main.trim() || !form.develop.trim()">{{ t('flow.save') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(520px, 92vw); }
h3 { margin: 6px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-muted); }
.prefixes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 10px; }
.prefixes input { min-width: 0; }
.hint { margin: -4px 0 10px; font-size: 12px; color: var(--fg-muted); }
</style>
