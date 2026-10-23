import { describe, expect, it } from 'vitest'
import { expandTemplate, splitMessage, stripComments, ticketFromBranch } from '../../src/shared/commit-template'

describe('commit template', () => {
  it('toglie le righe di commento', () => {
    expect(stripComments('# guida\nfix: \n#altro\ncorpo')).toBe('fix: \ncorpo')
  })

  it('oggetto e corpo da un file commit.template', () => {
    expect(splitMessage('# Scrivi un oggetto\nfix: \n\n# Perché?\nDettagli\n')).toEqual({ subject: 'fix: ', body: 'Dettagli' })
    expect(splitMessage('# solo commenti\n')).toEqual({ subject: '', body: '' })
    expect(splitMessage('a\r\n\r\nb\r\n')).toEqual({ subject: 'a', body: 'b' })
  })

  it('{ticket}: ultimo pezzo dopo "/" fino al primo "-"; vuoto senza "/" o con HEAD staccato', () => {
    expect(ticketFromBranch('feature/7hq2xk4mp-login')).toBe('7hq2xk4mp')
    expect(ticketFromBranch('team/feature/7hq2xk4mp')).toBe('7hq2xk4mp')
    expect(ticketFromBranch('main')).toBe('')
    expect(ticketFromBranch(null)).toBe('')
  })

  it("sostituisce le variabili e toglie i commenti; lo spazio finale dell'oggetto resta", () => {
    const t = { subject: '[{ticket}] feat: ', body: 'Perché:\n# da togliere\nBranch {branch}' }
    expect(expandTemplate(t, 'feature/7hq2xk4mp-login')).toEqual({ subject: '[7hq2xk4mp] feat: ', body: 'Perché:\nBranch feature/7hq2xk4mp-login' })
    expect(expandTemplate(t, null)).toEqual({ subject: '[] feat: ', body: 'Perché:\nBranch' })
  })
})
