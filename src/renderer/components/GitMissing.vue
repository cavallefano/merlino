<script setup lang="ts">
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
    <h1>Git non disponibile</h1>
    <p class="error">{{ app.git?.error }}</p>
    <p>
      Installa git 2.35 o successivo da
      <a href="https://git-scm.com/downloads" target="_blank">git-scm.com/downloads</a>
      oppure indica il percorso dell'eseguibile.
    </p>
    <form @submit.prevent="retry">
      <input v-model="path" data-testid="git-path" placeholder="/usr/bin/git" />
      <button class="primary" :disabled="busy">Riprova</button>
    </form>
  </section>
</template>

<style scoped>
form { display: flex; gap: 8px; }
input { width: 320px; }
</style>
