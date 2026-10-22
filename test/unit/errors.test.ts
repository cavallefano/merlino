import { describe, expect, it } from 'vitest'
import { explain } from '../../src/main/git/errors'

describe('explain', () => {
  it('messaggi dedicati per i casi noti', () => {
    expect(explain("fatal: could not read Username for 'https://x': terminal prompts disabled")).toMatch(/^Autenticazione non riuscita/)
    expect(explain('git@x: Permission denied (publickey).')).toMatch(/^Autenticazione non riuscita/)
    expect(explain(' ! [rejected]        main -> main (fetch first)')).toMatch(/^Push rifiutato/)
    expect(explain("fatal: Unable to create '/r/.git/index.lock': File exists.")).toMatch(/index\.lock/)
    expect(explain('fatal: Need to specify how to reconcile divergent branches.')).toMatch(/divergenti/)
    expect(explain('', 'CONFLICT (content): Merge conflict in f.txt\nAutomatic merge failed')).toMatch(/^Ci sono conflitti/)
  })

  it('altrimenti la prima riga utile, da stderr o da stdout', () => {
    expect(explain('\nfatal: qualcosa\naltro')).toBe('fatal: qualcosa')
    expect(explain('', 'nothing to commit, working tree clean')).toBe('nothing to commit, working tree clean')
    expect(explain('', '')).toBeUndefined()
  })
})
