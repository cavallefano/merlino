<script setup lang="ts">
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { computed } from 'vue'

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
// Le immagini diventano link: la CSP non carica immagini remote (img-src 'self' data:)
const marked = new Marked({ gfm: true, breaks: true, renderer: { image: ({ href, text }) => `<a href="${escape(href)}">${escape(text || href)}</a>` } })
// I link si aprono nel browser: window.open passa da setWindowOpenHandler del main, che apre solo http(s)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const props = defineProps<{ source: string }>()
const html = computed(() => DOMPurify.sanitize(marked.parse(props.source, { async: false })))
</script>

<template>
  <!-- HTML passato da DOMPurify -->
  <div class="markdown" v-html="html" />
</template>

<style scoped>
.markdown { overflow-wrap: anywhere; }
.markdown :deep(> :first-child) { margin-top: 0; }
.markdown :deep(> :last-child) { margin-bottom: 0; }
.markdown :deep(p), .markdown :deep(ul), .markdown :deep(ol), .markdown :deep(pre), .markdown :deep(blockquote), .markdown :deep(table) { margin: 6px 0; }
.markdown :deep(ul), .markdown :deep(ol) { padding-left: 22px; }
.markdown :deep(pre) { padding: 8px 10px; overflow: auto; background: var(--bg-alt); border-radius: 5px; }
.markdown :deep(code) { padding: 1px 4px; background: var(--bg-alt); border-radius: 4px; }
.markdown :deep(pre code) { padding: 0; background: none; }
.markdown :deep(blockquote) { padding-left: 10px; color: var(--fg-muted); border-left: 3px solid var(--border); }
.markdown :deep(h1), .markdown :deep(h2), .markdown :deep(h3) { margin: 10px 0 6px; font-size: 14px; }
.markdown :deep(table) { border-collapse: collapse; }
.markdown :deep(th), .markdown :deep(td) { padding: 3px 8px; border: 1px solid var(--border); }
</style>
