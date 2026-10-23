<script setup lang="ts">
import { ref } from 'vue'
import { clamp } from '../layout'

const props = defineProps<{
  /** col: divisore fra due colonne, si sposta in orizzontale; row: fra due righe. */
  orientation: 'col' | 'row'
  /** px del pannello prima del divisore, oppure la sua frazione con fraction. */
  modelValue: number
  defaultValue: number
  fraction?: boolean
  /** px minimi del pannello prima e di quello dopo; max facoltativo per quello prima. */
  min: number
  minAfter: number
  max?: number
  label: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const el = ref<HTMLElement | null>(null)
const dragging = ref(false)

/** Le misure attuali dei due pannelli accanto (gli elementi fratelli del divisore). */
function sizes(): { before: number; total: number } {
  const dim = props.orientation === 'col' ? 'width' : 'height'
  const before = el.value?.previousElementSibling?.getBoundingClientRect()[dim] ?? 0
  const after = el.value?.nextElementSibling?.getBoundingClientRect()[dim] ?? 0
  return { before, total: before + after }
}

function resize(start: { before: number; total: number }, delta: number) {
  const px = clamp(start.before + delta, props.min, Math.min(props.max ?? Infinity, start.total - props.minAfter))
  emit('update:modelValue', props.fraction ? px / start.total : Math.round(px))
}

const coord = (e: PointerEvent) => (props.orientation === 'col' ? e.clientX : e.clientY)

function onPointerDown(e: PointerEvent) {
  const target = el.value
  if (e.button !== 0 || !target) return
  // Niente selezione del testo durante il trascinamento
  e.preventDefault()
  const start = sizes()
  const origin = coord(e)
  const move = (ev: PointerEvent) => resize(start, coord(ev) - origin)
  const end = () => {
    dragging.value = false
    target.removeEventListener('pointermove', move)
    target.removeEventListener('lostpointercapture', end)
  }
  target.setPointerCapture(e.pointerId)
  target.addEventListener('pointermove', move)
  target.addEventListener('lostpointercapture', end)
  dragging.value = true
}

function onKey(e: KeyboardEvent) {
  const keys = props.orientation === 'col' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
  const i = keys.indexOf(e.key)
  if (i < 0) return
  e.preventDefault()
  resize(sizes(), i === 0 ? -16 : 16)
}
</script>

<template>
  <div
    ref="el"
    class="splitter"
    :class="[orientation, { dragging }]"
    role="separator"
    :aria-orientation="orientation === 'col' ? 'vertical' : 'horizontal'"
    :aria-label="label"
    tabindex="0"
    @pointerdown="onPointerDown"
    @dblclick="emit('update:modelValue', defaultValue)"
    @keydown="onKey"
  />
</template>

<style scoped>
/* Fascia di presa di 5 px con una linea di 1 px al centro */
.splitter { position: relative; flex: none; touch-action: none; outline: none; }
.splitter.col { width: 5px; cursor: col-resize; }
.splitter.row { height: 5px; cursor: row-resize; }
.splitter::before { content: ''; position: absolute; background: var(--border); }
.splitter.col::before { top: 0; bottom: 0; left: 2px; width: 1px; }
.splitter.row::before { left: 0; right: 0; top: 2px; height: 1px; }
.splitter:hover::before, .splitter.dragging::before, .splitter:focus-visible::before { background: var(--accent); }
</style>
