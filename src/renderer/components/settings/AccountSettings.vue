<script setup lang="ts">
import { ref } from 'vue'
import type { HostingAccount } from '../../../shared/types'
import { t } from '../../i18n'
import { useAppStore } from '../../stores/app'
import AccountDialog from './AccountDialog.vue'

const app = useAppStore()
const SERVICE = { github: 'GitHub', gitlab: 'GitLab' } as const
/** Conferma dell'ultimo account collegato. */
const connected = ref<string | null>(null)

function add() {
  connected.value = null
  app.accountDialog = { service: 'github', host: 'github.com' }
}

const openSite = (a: HostingAccount) => window.open(`https://${a.host}`)

async function remove(a: HostingAccount) {
  if (!window.confirm(t('account.confirmRemove', { account: `${a.username}@${a.host}` }))) return
  const r = await window.api.removeAccount(a.id)
  if (r.ok) app.settings = r.value
  else app.error = r.error.message
}
</script>

<template>
  <div class="accounts">
    <p v-if="!app.settings?.accounts.length" class="muted">{{ t('account.none') }}</p>
    <ul v-else>
      <li v-for="a in app.settings.accounts" :key="a.id" data-testid="account-row">
        <strong>{{ SERVICE[a.service] }}</strong>
        <span class="name">{{ a.username }}@{{ a.host }}</span>
        <button type="button" @click="openSite(a)">{{ t('account.openInBrowser') }}</button>
        <button type="button" data-testid="account-remove" @click="remove(a)">{{ t('account.remove') }}</button>
      </li>
    </ul>
    <button type="button" data-testid="account-add" @click="add">{{ t('account.add') }}</button>
    <p v-if="connected" class="muted" data-testid="account-connected">{{ connected }}</p>
    <AccountDialog v-if="app.accountDialog" @saved="(a) => (connected = t('account.connected', { user: a.username, host: a.host }))" />
  </div>
</template>

<style scoped>
.accounts { max-width: 760px; }
ul { margin: 0 0 12px; padding: 0; list-style: none; border: 1px solid var(--border); border-radius: 5px; }
li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
li:last-child { border-bottom: 0; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li button { padding: 2px 8px; font-size: 12px; }
p { font-size: 12px; }
</style>
