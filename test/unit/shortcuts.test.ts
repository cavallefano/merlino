import { describe, expect, it } from 'vitest'
import { shortcuts, toAccelerator } from '../../src/shared/shortcuts'

describe('toAccelerator', () => {
  it('converte nel formato degli acceleratori di Electron', () => {
    expect(toAccelerator({ key: 'p', mod: true, shift: true })).toBe('CmdOrCtrl+Shift+P')
    expect(toAccelerator({ key: 'Tab', ctrl: true })).toBe('Ctrl+Tab')
    expect(toAccelerator({ key: 'w', mod: true })).toBe('CmdOrCtrl+W')
  })

  it('la command palette ha una scorciatoia', () => {
    expect(toAccelerator(shortcuts['palette.open'])).toBe('CmdOrCtrl+Shift+P')
  })
})
