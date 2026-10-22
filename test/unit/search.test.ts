import { describe, expect, it } from 'vitest'
import { searchArgs } from '../../src/main/git/search'

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
