import { describe, expect, it as test } from 'vitest'
import { en } from '../../src/shared/i18n/en'
import { it } from '../../src/shared/i18n/it'
import { type MessageKey, translate, translatePlural } from '../../src/shared/i18n'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n', () => {
  test('segnaposto sostituiti; un segnaposto senza valore resta com\'è', () => {
    expect(translate('en', 'language.en')).toBe('English')
    expect(translate('it', 'language.it')).toBe('Italiano')
    expect(translate('en', 'branch.renameTitle', { name: 'feature/login' })).toBe('Rename feature/login')
    expect(translate('it', 'branch.renameTitle', { name: 'feature/login' })).toBe('Rinomina feature/login')
    expect(translate('en', 'branch.renameTitle')).toBe('Rename {name}')
  })

  test('plurali secondo la lingua', () => {
    expect(translatePlural('en', 'history.commitCount', 1)).toBe('1 commit')
    expect(translatePlural('en', 'history.commitCount', 2881)).toBe('2881 commits')
    expect(translatePlural('it', 'history.commitCount', 2)).toBe('2 commit')
  })

  test("ogni chiave in italiano ha gli stessi segnaposto dell'inglese e nessun testo vuoto", () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(it[key].trim(), key).not.toBe('')
      expect(placeholders(it[key]), key).toEqual(placeholders(en[key]))
    }
  })
})
