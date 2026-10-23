<script setup lang="ts">
import { drag } from '../drag/drag'
</script>

<template>
  <div v-if="drag.label" class="drop-hint" data-testid="drop-hint" :style="{ left: `${drag.x + 14}px`, top: `${drag.y + 16}px` }">
    {{ drag.label }}
  </div>
</template>

<style scoped>
.drop-hint { position: fixed; z-index: 50; padding: 3px 8px; font-size: 12px; white-space: nowrap; pointer-events: none; color: var(--accent-fg); background: var(--accent); border-radius: 5px; box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }
</style>
