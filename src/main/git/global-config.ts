import type { GitConfigKey } from '../../shared/types'
import type { GitRunner } from './runner'

export const GIT_CONFIG_KEYS = [
  'user.name',
  'user.email',
  'commit.gpgsign',
  'gpg.format',
  'user.signingkey',
  'pull.rebase',
  'init.defaultBranch',
] as const satisfies readonly GitConfigKey[]

const PATTERN = `^(${GIT_CONFIG_KEYS.map((k) => k.replace('.', '\\.')).join('|')})$`

/** Le chiavi gestite dalla sezione Git; '' se non impostate. */
export async function readGlobalConfig(runner: GitRunner): Promise<Record<GitConfigKey, string>> {
  // exit 1: nessuna chiave trovata (anche se il file globale non esiste)
  const out = await runner.run(['config', '--global', '-z', '--get-regexp', PATTERN], { okCodes: [0, 1] })
  const found = new Map<string, string>()
  for (const entry of out.stdout.split('\0')) {
    const nl = entry.indexOf('\n')
    if (nl > 0) found.set(entry.slice(0, nl).toLowerCase(), entry.slice(nl + 1))
  }
  // git restituisce i nomi delle chiavi in minuscolo (init.defaultbranch)
  return Object.fromEntries(GIT_CONFIG_KEYS.map((k) => [k, found.get(k.toLowerCase()) ?? ''])) as Record<GitConfigKey, string>
}

/** '' toglie la chiave; exit 5 = era già assente. */
export async function setGlobalConfig(runner: GitRunner, key: GitConfigKey, value: string): Promise<void> {
  if (value === '') await runner.run(['config', '--global', '--unset-all', key], { write: true, okCodes: [0, 5] })
  else await runner.run(['config', '--global', key, value], { write: true })
}
