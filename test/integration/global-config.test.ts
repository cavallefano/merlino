import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readGlobalConfig, setGlobalConfig } from '../../src/main/git/global-config'
import { GitRunner } from '../../src/main/git/runner'

// Mai la config vera dell'utente: un file temporaneo al posto di ~/.gitconfig
const useTempGlobal = () => {
  const file = join(mkdtempSync(join(tmpdir(), 'merlino-gc-')), 'gitconfig')
  process.env.GIT_CONFIG_GLOBAL = file
  return file
}
afterEach(() => {
  process.env.GIT_CONFIG_GLOBAL = devNull
})
const runner = () => new GitRunner(() => 'git', tmpdir())

describe('config globale di git', () => {
  it('file mancante: tutte le chiavi vuote', async () => {
    useTempGlobal()
    expect(Object.values(await readGlobalConfig(runner())).every((v) => v === '')).toBe(true)
  })

  it('scrive, rilegge (anche init.defaultBranch, che git restituisce in minuscolo) e toglie', async () => {
    const file = useTempGlobal()
    writeFileSync(file, '[core]\n\teditor = vim\n')
    const r = runner()
    await setGlobalConfig(r, 'user.name', 'Ada Lovelace')
    await setGlobalConfig(r, 'init.defaultBranch', 'main')
    await setGlobalConfig(r, 'commit.gpgsign', 'true')
    expect(await readGlobalConfig(r)).toMatchObject({ 'user.name': 'Ada Lovelace', 'init.defaultBranch': 'main', 'commit.gpgsign': 'true', 'user.email': '' })
    await setGlobalConfig(r, 'user.name', '')
    await setGlobalConfig(r, 'user.email', '') // già assente: nessun errore
    expect((await readGlobalConfig(r))['user.name']).toBe('')
    expect(readFileSync(file, 'utf8')).toContain('editor = vim')
  })
})
