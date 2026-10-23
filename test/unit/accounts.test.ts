import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountFor, addAccount, type Crypto, removeAccount, setRemoteAccount, TokenStore } from '../../src/main/hosting/accounts'
import { SettingsStore } from '../../src/main/settings'

// "Cifratura" finta: il testo al contrario, così si vede che nel file non c'è in chiaro
const crypto = (available: boolean): Crypto => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...s].reverse().join('')),
  decryptString: (b) => [...b.toString()].reverse().join(''),
})

function stores(available = true) {
  const dir = mkdtempSync(join(tmpdir(), 'merlino-accounts-'))
  const file = join(dir, 'tokens.json')
  return { settings: new SettingsStore(join(dir, 'settings.json')), tokens: new TokenStore(file, crypto(available)), file }
}
const github = { service: 'github' as const, host: 'github.com' }

describe('account e token', () => {
  it('aggiunge dopo la verifica; il token è cifrato in tokens.json e non sta in settings.json', async () => {
    const { settings, tokens, file } = stores()
    const { account } = await addAccount(settings, tokens, github, 'tok-123', async () => 'ada')
    expect(settings.get().accounts).toEqual([{ id: account.id, service: 'github', host: 'github.com', username: 'ada' }])
    expect(tokens.get(account.id)).toBe('tok-123')
    expect(readFileSync(file, 'utf8')).not.toContain('tok-123')
    expect(JSON.stringify(settings.get())).not.toContain('tok-123')
  })

  it('stesso utente sullo stesso server: aggiorna il token, niente doppioni', async () => {
    const { settings, tokens } = stores()
    const first = await addAccount(settings, tokens, github, 'vecchio', async () => 'ada')
    const second = await addAccount(settings, tokens, github, 'nuovo', async () => 'ada')
    expect(second.account.id).toBe(first.account.id)
    expect(settings.get().accounts).toHaveLength(1)
    expect(tokens.get(first.account.id)).toBe('nuovo')
  })

  it('verifica fallita o portachiavi assente: non si salva niente', async () => {
    const a = stores()
    await expect(addAccount(a.settings, a.tokens, github, 't', () => Promise.reject(new Error('401')))).rejects.toThrow('401')
    const b = stores(false)
    await expect(addAccount(b.settings, b.tokens, github, 't', async () => 'ada')).rejects.toThrow(/keychain/)
    expect([...a.settings.get().accounts, ...b.settings.get().accounts]).toEqual([])
  })

  it('account di un remote: quello scelto, altrimenti il primo dello stesso server; rimuoverlo torna ad Automatico', async () => {
    const { settings, tokens } = stores()
    const ada = (await addAccount(settings, tokens, github, 'a', async () => 'ada')).account
    const grace = (await addAccount(settings, tokens, github, 'g', async () => 'grace')).account
    expect(accountFor(settings.get(), '/repo', 'origin', 'github.com')).toEqual(ada)
    expect(accountFor(settings.get(), '/repo', 'origin', 'gitlab.example.com')).toBeNull()
    setRemoteAccount(settings, '/repo', 'origin', grace.id)
    expect(accountFor(settings.get(), '/repo', 'origin', 'github.com')).toEqual(grace)
    // La scelta vale anche per un alias ssh con un altro nome di server
    expect(accountFor(settings.get(), '/repo', 'origin', 'github-lavoro')).toEqual(grace)
    expect(() => setRemoteAccount(settings, '/repo', 'origin', 'manca')).toThrow()
    removeAccount(settings, tokens, grace.id)
    expect(settings.get().remoteAccounts).toEqual({})
    expect(tokens.get(grace.id)).toBeNull()
    expect(accountFor(settings.get(), '/repo', 'origin', 'github.com')).toEqual(ada)
  })
})
