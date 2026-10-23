<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { splitUpstream } from '../pull-requests/model'
import { usePullRequestStore } from '../stores/pull-requests'
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const prs = usePullRequestStore(props.root)
const repo = useRepoStore(props.root)
const dialog = ref<HTMLDialogElement | null>(null)
const targets = computed(() => prs.withAccount.map((r) => r.name))
const target = ref(prs.remote && targets.value.includes(prs.remote) ? prs.remote : (targets.value[0] ?? ''))
const head = ref(prs.creating?.branch || repo.info?.branch || '')
const base = ref(prs.creating?.base ?? '')
const title = ref(prs.creating?.title ?? '')
const body = ref('')
const draft = ref(false)
/** L'utente ha scritto titolo o descrizione: non si propongono più. */
const edited = ref(!!prs.creating?.title)
const failed = ref<string | null>(null)

const remoteNames = computed(() => repo.refs?.remotes.map((r) => r.name) ?? [])
const branch = computed(() => repo.refs?.branches.find((b) => b.name === head.value))
const upstream = computed(() => splitUpstream(branch.value?.upstream ?? null, remoteNames.value))
// Il branch va sul remote del suo upstream; senza upstream su origin (di solito il proprio fork), altrimenti sulla destinazione
const headRemote = computed(() => upstream.value?.remote ?? (remoteNames.value.includes('origin') ? 'origin' : target.value))
const headBranch = computed(() => upstream.value?.branch ?? head.value)
const needsPush = computed(() => !!branch.value && (!upstream.value || branch.value.gone || branch.value.ahead > 0))
const bases = computed(() => repo.refs?.remotes.find((r) => r.name === target.value)?.branches.map((b) => b.name) ?? [])

/** Branch principale del repository di destinazione. */
async function loadBase() {
  const r = await window.api.prRepo(props.root, target.value)
  if (r.ok) base.value = r.value.defaultBranch
}

/** Titolo e descrizione: dal commit se il branch ne ha uno solo in più, altrimenti il nome del branch. */
async function propose() {
  if (edited.value || !base.value || !head.value) return
  const r = await window.api.prBranchSummary(props.root, `${target.value}/${base.value}`, head.value)
  if (edited.value) return
  const [subject = '', ...rest] = r.ok && r.value.count === 1 ? r.value.message.split('\n') : [head.value]
  title.value = subject
  body.value = rest.join('\n').trim()
}

watch(target, loadBase)
watch([base, head], propose)
onMounted(() => {
  dialog.value?.showModal()
  // Con una destinazione proposta (es. dal Finish di git flow) non si parte dal branch principale del server
  if (base.value) void propose()
  else void loadBase()
})

function close() {
  prs.creating = null
}

async function submit() {
  if (!title.value.trim() || !base.value || !head.value) return
  failed.value = null
  const ok = await prs.create(
    { remote: target.value, base: base.value, headRemote: headRemote.value, head: headBranch.value, title: title.value, body: body.value, draft: draft.value },
    needsPush.value ? { remote: headRemote.value, branch: head.value, remoteBranch: headBranch.value } : null,
  )
  if (ok) close()
  else failed.value = prs.error?.message ?? repo.error
}
</script>

<template>
  <dialog ref="dialog" data-testid="create-dialog" @cancel.prevent="close">
    <form @submit.prevent="submit">
      <h2>{{ t('create.title') }}</h2>
      <label class="field">
        <span>{{ t('create.remote') }}</span>
        <select v-model="target" data-testid="create-remote">
          <option v-for="name in targets" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('create.base') }}</span>
        <input v-model="base" list="create-bases" data-testid="create-base" />
        <datalist id="create-bases">
          <option v-for="b in bases" :key="b" :value="b" />
        </datalist>
      </label>
      <label class="field">
        <span>{{ t('create.head') }}</span>
        <select v-model="head" data-testid="create-head">
          <option v-for="b in repo.refs?.branches ?? []" :key="b.name" :value="b.name">{{ b.name }}</option>
        </select>
      </label>
      <p v-if="needsPush" class="muted" data-testid="create-push">{{ t('create.push', { branch: head, remote: headRemote }) }}</p>
      <label class="field">
        <span>{{ t('create.titleField') }}</span>
        <input v-model="title" data-testid="create-title" @input="edited = true" />
      </label>
      <label class="field">
        <span>{{ t('create.body') }}</span>
        <textarea v-model="body" rows="6" data-testid="create-body" @input="edited = true" />
      </label>
      <label class="check">
        <input v-model="draft" type="checkbox" data-testid="create-draft" />
        {{ t('create.draft') }}
      </label>
      <p v-if="failed" class="error" data-testid="create-error">{{ failed }}</p>
      <footer>
        <button type="button" @click="close">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="create-confirm" :disabled="!title.trim() || !base || !head || !!repo.busy">{{ t('create.confirm') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(560px, 92vw); }
p { margin: -4px 0 10px; font-size: 12px; }
</style>
