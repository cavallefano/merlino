import { describe, expect, it } from 'vitest'
import { matchesPath, searchArgs } from '../../src/shared/search'

const FLAGS = ['--all-match', '-i', '-F']

describe('searchArgs', () => {
  it('vuota: nessuna opzione', () => {
    expect(searchArgs('  ')).toEqual({ args: [], paths: [] })
  })

  it('testo senza prefisso cerca nel messaggio, ogni parola in AND', () => {
    expect(searchArgs('fix login')).toEqual({ args: ['--grep=fix', '--grep=login', ...FLAGS], paths: [] })
  })

  it('prefissi e virgolette', () => {
    expect(searchArgs('author:mario message:"login page" contents:TODO path:src/app.ts')).toEqual({
      args: ['--author=mario', '--grep=login page', '-STODO', ...FLAGS],
      paths: ['src/app.ts'],
    })
  })

  it('solo percorsi: nessuna opzione di ricerca', () => {
    expect(searchArgs('path:a path:b')).toEqual({ args: [], paths: ['a', 'b'] })
  })
})

describe('matchesPath', () => {
  it('lo stesso percorso o un file dentro la cartella; nessun filtro, nessun file', () => {
    expect(matchesPath('src/app.ts', ['src/app.ts'])).toBe(true)
    expect(matchesPath('src/lib/util.ts', ['src'])).toBe(true)
    expect(matchesPath('src/lib/util.ts', ['src/'])).toBe(true)
    expect(matchesPath('src/application.ts', ['src/app'])).toBe(false)
    expect(matchesPath('src/app.ts', [])).toBe(false)
  })
})
