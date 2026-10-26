import { describe, expect, it } from 'vitest'
import { parseBlame, unquotePath } from '../../src/main/git/blame'

const A = 'a'.repeat(40)
const Z = '0'.repeat(40)
const person = (name: string, mail: string, time: number) =>
  ['author', 'committer'].flatMap((who) => [`${who} ${name}`, `${who}-mail <${mail}>`, `${who}-time ${time}`, `${who}-tz +0100`])

const out = [
  `${A} 1 1 2`,
  ...person('Ada Lovelace', 'ada@example.com', 1700000000),
  'summary primo',
  'boundary',
  'filename src/app.ts',
  '\tuno',
  `${A} 2 2`,
  '\tdue',
  `${Z} 3 3 1`,
  ...person('Not Committed Yet', 'not.committed.yet', 1700000100),
  'summary Version of src/app.ts from src/app.ts',
  `previous ${A} "src/citt\\303\\240 \\"q\\".ts"`,
  'filename src/app.ts',
  '\t\tindentata',
  '',
].join('\n')

describe('parseBlame', () => {
  it('blocchi, dati del commit una volta sola, righe non nel commit e previous tra virgolette', () => {
    const b = parseBlame(out, 'src/app.ts')
    expect(b.path).toBe('src/app.ts')
    expect(b.binary).toBe(false)
    expect(b.lines).toEqual([
      { sha: A, text: 'uno' },
      { sha: A, text: 'due' },
      { sha: Z, text: '\tindentata' },
    ])
    expect(b.commits[A]).toEqual({ sha: A, author: 'Ada Lovelace', authorEmail: 'ada@example.com', authorTime: 1700000000, summary: 'primo' })
    expect(b.commits[Z].previous).toEqual({ sha: A, path: 'src/città "q".ts' })
  })

  it('binario: nessuna riga', () => {
    expect(parseBlame(`${A} 1 1 1\nsummary x\n\t\0bin\n`, 'b.dat')).toMatchObject({ binary: true, lines: [] })
  })
})

describe('unquotePath', () => {
  it('senza virgolette resta com è; escape in stile C, UTF-8 in ottale o diretto', () => {
    expect(unquotePath('src/a b.txt')).toBe('src/a b.txt')
    expect(unquotePath('"a\\tb\\\\c\\"d"')).toBe('a\tb\\c"d')
    expect(unquotePath('"citt\\303\\240"')).toBe('città')
    expect(unquotePath('"città \\"x\\""')).toBe('città "x"')
  })
})
