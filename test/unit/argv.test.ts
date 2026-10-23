import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pathFromArgv } from '../../src/main/argv'

describe('pathFromArgv', () => {
  const app = resolve('/app')
  const dirs = new Set([resolve('/repo'), app, resolve('/work/sub')])
  const isDir = (p: string) => dirs.has(p)

  it('prende la cartella passata', () => {
    expect(pathFromArgv(['merlino', '/repo'], '/x', app, isDir)).toBe(resolve('/repo'))
  })

  it("ignora i flag e il percorso dell'app", () => {
    expect(pathFromArgv(['electron', '--inspect=0', '.', '/repo'], app, app, isDir)).toBe(resolve('/repo'))
  })

  it('risolve i percorsi relativi rispetto a cwd', () => {
    expect(pathFromArgv(['merlino', 'sub'], '/work', app, isDir)).toBe(resolve('/work/sub'))
  })

  it('null se non ci sono cartelle', () => {
    expect(pathFromArgv(['merlino', '.', 'file.txt'], app, app, isDir)).toBeNull()
  })
})
