<script setup lang="ts">
import { useAppStore } from '../stores/app'

const app = useAppStore()
</script>

<template>
  <section class="welcome">
    <h1>Merlino</h1>
    <div class="actions">
      <button class="primary" @click="app.pickAndOpen()">Apri repository…</button>
      <button @click="app.pickAndInit()">Nuovo repository…</button>
    </div>
    <p class="muted">Oppure trascina qui la cartella di un repository.</p>
    <template v-if="app.recent.length">
      <h2>Recenti</h2>
      <ul class="recent">
        <li v-for="path in app.recent" :key="path">
          <a href="#" @click.prevent="app.open(path)">{{ path }}</a>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.welcome { max-width: 640px; margin: 10vh auto 0; padding: 0 24px; }
h1 { margin: 0 0 16px; font-size: 28px; }
h2 { margin: 32px 0 8px; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fg-muted); }
.actions { display: flex; gap: 8px; }
.recent { margin: 0; padding: 0; list-style: none; }
.recent li { padding: 3px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
