import { describe, expect, it } from 'vitest'
import { ciSummary } from '../../src/main/hosting/provider'
import { parseRemoteUrl } from '../../src/main/hosting/remote-url'
import type { Check } from '../../src/shared/types'

describe('parseRemoteUrl', () => {
  it('https, con o senza .git, utente e porta', () => {
    expect(parseRemoteUrl('https://github.com/acme/demo-app.git')).toEqual({ host: 'github.com', path: 'acme/demo-app' })
    expect(parseRemoteUrl('https://ada:secret@GitLab.Example.com:8443/acme/demo-app/')).toEqual({ host: 'gitlab.example.com:8443', path: 'acme/demo-app' })
  })

  it('ssh in forma scp e come URL; la porta di ssh non conta', () => {
    expect(parseRemoteUrl('git@github.com:acme/demo-app.git')).toEqual({ host: 'github.com', path: 'acme/demo-app' })
    expect(parseRemoteUrl('ssh://git@gitlab.example.com:2222/acme/demo-app.git')).toEqual({ host: 'gitlab.example.com', path: 'acme/demo-app' })
    expect(parseRemoteUrl('gitlab.example.com:acme/demo-app')).toEqual({ host: 'gitlab.example.com', path: 'acme/demo-app' })
  })

  it('sottogruppi di GitLab', () => {
    expect(parseRemoteUrl('git@gitlab.example.com:acme/backend/demo-app.git')).toEqual({ host: 'gitlab.example.com', path: 'acme/backend/demo-app' })
  })

  it('cartelle locali e URL non riconosciuti: null', () => {
    for (const url of ['/srv/git/demo.git', '../demo', 'C:\\repos\\demo', 'C:/repos/demo', 'file:///srv/git/demo.git', 'https://github.com/solo-owner', 'ftp://example.com/a/b']) {
      expect(parseRemoteUrl(url), url).toBeNull()
    }
  })
})

describe('ciSummary', () => {
  const check = (state: Check['state']): Check => ({ name: state, state, url: null })
  it('fallito batte in corso, in corso batte superato; senza check: nessuno', () => {
    expect(ciSummary([check('passed'), check('running'), check('failed')])).toBe('failed')
    expect(ciSummary([check('passed'), check('running')])).toBe('running')
    expect(ciSummary([check('passed'), check('skipped'), check('cancelled')])).toBe('passed')
    expect(ciSummary([])).toBe('none')
  })
})
