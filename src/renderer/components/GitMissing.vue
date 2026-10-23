<script setup lang="ts">
import { t } from '../i18n'
import { ref } from 'vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const path = ref(app.git?.path ?? 'git')
const busy = ref(false)

async function retry() {
  busy.value = true
  try {
    await app.setGitPath(path.value.trim() || 'git')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="center">
    <h1>{{ t('gitMissing.title') }}</h1>
    <p class="error">{{ app.git?.error }}</p>
    <p>
      {{ t('gitMissing.installBefore') }}
      <a href="https://git-scm.com/downloads" target="_blank">git-scm.com/downloads</a>
      {{ t('gitMissing.installAfter') }}
    </p>
    <form @submit.prevent="retry">
      <input v-model="path" data-testid="git-path" placeholder="/usr/bin/git" />
      <button class="primary" :disabled="busy">{{ t('gitMissing.retry') }}</button>
    </form>
  </section>
</template>

<style scoped>
form { display: flex; gap: 8px; }
input { width: 320px; }
</style>
