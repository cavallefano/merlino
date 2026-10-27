<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import AppIcon from './AppIcon.vue'

const app = useAppStore()
const dialog = ref<HTMLDialogElement | null>(null)
// showModal: sopra a tutto, anche a un altro dialog aperto; il focus va su OK (autofocus), Esc chiude
onMounted(() => dialog.value?.showModal())

function showOutput() {
  app.outputOpen = true
  app.error = null
}
</script>

<template>
  <dialog ref="dialog" data-testid="error-dialog" @cancel.prevent="app.error = null">
    <form @submit.prevent="app.error = null">
      <h2><AppIcon name="warning" /> {{ t('errorDialog.title') }}</h2>
      <pre data-testid="error-message">{{ app.error }}</pre>
      <footer>
        <button type="button" data-testid="error-output" @click="showOutput">{{ t('errorDialog.showOutput') }}</button>
        <button class="primary" data-testid="error-ok" autofocus>{{ t('common.ok') }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(520px, 90vw); }
h2 { display: flex; align-items: center; gap: 8px; }
h2 .icon { width: 18px; height: 18px; color: var(--danger); }
pre { max-height: 40vh; margin: 0; padding: 8px 10px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 5px; }
</style>
