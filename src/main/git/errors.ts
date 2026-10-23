import type { MessageKey } from '../../shared/i18n'
import { t } from '../i18n'

const CASES: [RegExp, MessageKey][] = [
  [/could not read Username|Authentication failed|terminal prompts disabled|Permission denied \(publickey/i, 'error.auth'],
  [/\[rejected\]|fetch first|non-fast-forward/, 'error.pushRejected'],
  [/index\.lock/, 'error.indexLock'],
  [/divergent branches/, 'error.divergent'],
  [/^CONFLICT/m, 'error.conflicts'],
]

export function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
}

/** Messaggio per l'utente: dedicato per i casi noti, altrimenti la prima riga utile (git a volte scrive l'errore su stdout). */
export function explain(stderr: string, stdout = ''): string | undefined {
  const all = `${stderr}\n${stdout}`
  for (const [pattern, key] of CASES) if (pattern.test(all)) return t(key)
  return firstLine(stderr) ?? firstLine(stdout)
}
