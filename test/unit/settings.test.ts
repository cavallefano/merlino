import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addRecent, SettingsStore } from '../../src/main/settings'

const file = () => join(mkdtempSync(join(tmpdir(), 'merlino-settings-')), 'sub', 'settings.json')

describe('SettingsStore', () => {
  it('senza file usa i default', () => {
    expect(new SettingsStore(file()).get()).toEqual({ gitPath: 'git', openRepos: [], activeRepo: null, recentRepos: [] })
  })

  it('update salva su disco e una nuova istanza rilegge', () => {
    const f = file()
    new SettingsStore(f).update({ gitPath: '/usr/bin/git', openRepos: ['/a'] })
    expect(new SettingsStore(f).get()).toEqual({ gitPath: '/usr/bin/git', openRepos: ['/a'], activeRepo: null, recentRepos: [] })
  })

  it('file corrotto: si riparte dai default', () => {
    const f = file()
    new SettingsStore(f).update({})
    writeFileSync(f, '{rotto')
    expect(new SettingsStore(f).get().gitPath).toBe('git')
  })

  it('get restituisce una copia', () => {
    const s = new SettingsStore(file())
    s.get().openRepos.push('/x')
    expect(s.get().openRepos).toEqual([])
  })
})

describe('addRecent', () => {
  it('mette in cima, senza doppioni, al massimo 10', () => {
    expect(addRecent(['/a', '/b'], '/b')).toEqual(['/b', '/a'])
    const full = Array.from({ length: 10 }, (_, i) => `/r${i}`)
    expect(addRecent(full, '/nuovo')).toHaveLength(10)
    expect(addRecent(full, '/nuovo')[0]).toBe('/nuovo')
  })
})
