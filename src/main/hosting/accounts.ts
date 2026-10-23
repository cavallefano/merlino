import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AppSettings, HostingAccount, HostingService } from '../../shared/types'
import { t } from '../i18n'
import { saveJson, type SettingsStore } from '../settings'

/** La parte di safeStorage di Electron che serve (nei test una finta). */
export interface Crypto {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(data: Buffer): string
}

/** Token degli account in tokens.json, cifrati con il portachiavi del sistema: { id: base64 }. */
export class TokenStore {
  constructor(
    private readonly file: string,
    private readonly crypto: Crypto,
  ) {}

  private read(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  get(id: string): string | null {
    const saved = this.read()[id]
    return saved ? this.crypto.decryptString(Buffer.from(saved, 'base64')) : null
  }

  set(id: string, token: string): void {
    if (!this.crypto.isEncryptionAvailable()) throw new Error(t('hosting.noKeychain'))
    saveJson(this.file, { ...this.read(), [id]: this.crypto.encryptString(token).toString('base64') }, 0o600)
  }

  delete(id: string): void {
    const data = this.read()
    delete data[id]
    saveJson(this.file, data, 0o600)
  }
}

/** Chiave di remoteAccounts: la stessa usata dal renderer per mostrare la scelta. */
export const accountKey = (root: string, remote: string): string => `${root}\n${remote}`

/** L'account di un remote: quello scelto dal menu del remote, altrimenti il primo con lo stesso server. */
export function accountFor(
  s: Pick<AppSettings, 'accounts' | 'remoteAccounts'>,
  root: string,
  remote: string,
  host: string | null,
): HostingAccount | null {
  const chosen = s.remoteAccounts[accountKey(root, remote)]
  return s.accounts.find((a) => a.id === chosen) ?? s.accounts.find((a) => a.host === host) ?? null
}

/** Aggiunge un account dopo aver verificato il token (verify dà il nome utente). Lo stesso utente sullo stesso server aggiorna il token. */
export async function addAccount(
  settings: SettingsStore,
  tokens: TokenStore,
  draft: { service: HostingService; host: string },
  token: string,
  verify: () => Promise<string>,
): Promise<{ settings: AppSettings; account: HostingAccount }> {
  const username = await verify()
  const { accounts } = settings.get()
  const existing = accounts.find((a) => a.service === draft.service && a.host === draft.host && a.username === username)
  const account = existing ?? { id: randomUUID(), ...draft, username }
  tokens.set(account.id, token)
  return { settings: existing ? settings.get() : settings.update({ accounts: [...accounts, account] }), account }
}

export function removeAccount(settings: SettingsStore, tokens: TokenStore, id: string): AppSettings {
  const { accounts, remoteAccounts } = settings.get()
  tokens.delete(id)
  return settings.update({
    accounts: accounts.filter((a) => a.id !== id),
    // I remote che usavano questo account tornano su "Automatico"
    remoteAccounts: Object.fromEntries(Object.entries(remoteAccounts).filter(([, v]) => v !== id)),
  })
}

/** id null: "Automatico", cioè il primo account dello stesso server. */
export function setRemoteAccount(settings: SettingsStore, root: string, remote: string, id: string | null): AppSettings {
  const { accounts, remoteAccounts } = settings.get()
  if (id !== null && !accounts.some((a) => a.id === id)) throw new Error(t('hosting.accountNotFound'))
  const key = accountKey(root, remote)
  if (id === null) delete remoteAccounts[key]
  else remoteAccounts[key] = id
  return settings.update({ remoteAccounts })
}
