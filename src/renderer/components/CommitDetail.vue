<script setup lang="ts">
import { useRepoStore } from '../stores/repo'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
</script>

<template>
  <section class="detail">
    <p v-if="!repo.detail" class="muted">Seleziona un commit</p>
    <pre v-else data-testid="commit-message">{{ repo.detail.message }}</pre>
  </section>
</template>

<style scoped>
.detail { min-width: 0; min-height: 0; overflow: auto; padding: 12px; }
</style>
