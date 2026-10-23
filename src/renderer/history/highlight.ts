import hljs from 'highlight.js/lib/common'
import { escapeHtml } from './diff-model'

const ALIASES: Record<string, string> = { vue: 'xml', svelte: 'xml', mjs: 'javascript', cjs: 'javascript' }

/** Colorazione per riga secondo l'estensione del file; testo semplice se il linguaggio non è noto. */
export function highlighter(path: string): (text: string) => string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const language = ALIASES[ext] ?? ext
  if (!path.includes('.') || !hljs.getLanguage(language)) return escapeHtml
  return (text) => hljs.highlight(text, { language, ignoreIllegals: true }).value
}
