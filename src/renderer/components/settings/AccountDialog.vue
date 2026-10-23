<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { HostingAccount, HostingService } from '../../../shared/types'
import { t } from '../../i18n'
import { useAppStore } from '../../stores/app'

const emit = defineEmits<{ saved: [account: HostingAccount] }>()
const app = useAppStore()
const DEFAULT_HOST: Record<HostingService, string> = { github: 'github.com', gitlab: 'gitlab.com' }
const service = ref<HostingService>(app.accountDialog?.service ?? 'github')
const host = ref(app.accountDialog?.host ?? DEFAULT_HOST[service.value])
const token = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())

function setService(next: HostingService) {
  // Il server predefinito segue il servizio, se l'utente non l'ha cambiato
  if (host.value === DEFAULT_HOST[service.value]) host.value = DEFAULT_HOST[next]
  service.value = next
}

/** Pagina del servizio per creare un token con i permessi giusti, già compilata (si apre nel browser). */
function createToken() {
  const h = host.value.trim() || DEFAULT_HOST[service.value]
  window.open(
    service.value === 'github'
      ? `https://${h}/settings/tokens/new?scopes=repo&description=Merlino`
      : `https://${h}/-/user_settings/personal_access_tokens?name=Merlino&scopes=api`,
  )
}

async function save() {
  busy.value = true
  error.value = null
  const r = await window.api.addAccount(service.value, host.value, token.value)
  busy.value = false
  if (!r.ok) {
    error.value = r.error.message
    return
  }
  app.settings = r.value.settings
  app.accountDialog = null
  emit('saved', r.value.account)
}
</script>

<template>
  <dialog ref="dialog" data-testid="account-dialog" @cancel.prevent="app.accountDialog = null">
    <form @submit.prevent="save">
      <h2>{{ t('account.title') }}</h2>
      <label class="field">
        <span>{{ t('account.service') }}</span>
        <select :value="service" data-testid="account-service" @change="setService(($event.target as HTMLSelectElement).value as HostingService)">
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('account.server') }}</span>
        <input v-model="host" data-testid="account-host" />
      </label>
      <label class="field">
        <span>{{ t('account.token') }}</span>
        <input v-model="token" type="password" autocomplete="off" data-testid="account-token" />
      </label>
      <p class="hint">
        {{ t('account.tokenHint', { scope: service === 'github' ? 'repo' : 'api' }) }}
        <button type="button" class="link" data-testid="account-create-token" @click="createToken">{{ t('account.createToken') }}</button>
      </p>
      <p v-if="error" class="error" data-testid="account-error">{{ error }}</p>
      <footer>
        <button type="button" @click="app.accountDialog = null">{{ t('common.cancel') }}</button>
        <button class="primary" data-testid="account-save" :disabled="busy || !host.trim() || !token.trim()">
          {{ busy ? t('account.checking') : t('account.save') }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(460px, 90vw); }
.hint { margin: -4px 0 10px; font-size: 12px; color: var(--fg-muted); }
.error { font-size: 12px; }
</style>
