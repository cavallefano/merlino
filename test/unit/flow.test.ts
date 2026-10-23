import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOW_PREFIXES, flowName, flowTypeOf, latestVersionTag, nextVersion } from '../../src/shared/flow'
import type { FlowConfig } from '../../src/shared/types'

const config: FlowConfig = { main: 'main', develop: 'develop', prefixes: { ...DEFAULT_FLOW_PREFIXES, hotfix: 'fix/', support: 'fix/support/' }, versionTag: 'v', bases: {} }

describe('git flow, funzioni pure', () => {
  it('tipo di un branch: il prefisso più lungo; il solo prefisso o nessun prefisso non contano', () => {
    expect(flowTypeOf('feature/login', config)).toBe('feature')
    expect(flowTypeOf('fix/0.1.1', config)).toBe('hotfix')
    expect(flowTypeOf('fix/support/0.1.x', config)).toBe('support')
    expect(flowTypeOf('feature/', config)).toBeNull()
    expect(flowTypeOf('main', config)).toBeNull()
    expect(flowTypeOf('main', { ...config, prefixes: { ...config.prefixes, bugfix: '' } })).toBeNull()
    expect(flowName('release/0.2.0', config)).toBe('0.2.0')
    expect(flowName('main', config)).toBe('main')
  })

  it('versione proposta dall\'ultimo tag X.Y.Z con il prefisso', () => {
    const tags = ['v0.1.0', 'v0.10.2', 'v0.9.9', 'demo', 'v1.0.0-beta', 'x2.0.0']
    expect(latestVersionTag(tags, 'v')).toBe('v0.10.2')
    expect(nextVersion(tags, 'v', 'release')).toBe('0.11.0')
    expect(nextVersion(tags, 'v', 'hotfix')).toBe('0.10.3')
    expect(nextVersion(tags, 'v', 'support')).toBe('0.10.x')
    expect(nextVersion([], 'v', 'release')).toBe('0.1.0')
    expect(nextVersion([], 'v', 'hotfix')).toBe('0.0.1')
    expect(nextVersion(['1.2.3'], '', 'release')).toBe('1.3.0')
    expect(latestVersionTag([], 'v')).toBeNull()
  })
})
