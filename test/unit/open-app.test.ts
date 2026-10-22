import { describe, expect, it } from 'vitest'
import { editorLaunch, terminalLaunch } from '../../src/main/open-app'

describe('app esterne', () => {
  it("editor: open -a su macOS (aspettando l'esito), eseguibile diretto altrove", () => {
    expect(editorLaunch('darwin', '/Applications/Visual Studio Code.app', '/r/a.txt')).toEqual({
      command: 'open',
      args: ['-a', '/Applications/Visual Studio Code.app', '/r/a.txt'],
      wait: true,
    })
    expect(editorLaunch('win32', 'C:\\Code\\Code.exe', 'C:\\r\\a.txt')).toEqual({ command: 'C:\\Code\\Code.exe', args: ['C:\\r\\a.txt'], wait: false })
  })

  it('terminale: Terminal su macOS, cmd su Windows, x-terminal-emulator su Linux, oppure quello scelto', () => {
    expect(terminalLaunch('darwin', null, '/r')).toEqual({ command: 'open', args: ['-a', 'Terminal', '/r'], wait: true })
    expect(terminalLaunch('darwin', '/Applications/iTerm.app', '/r').args).toEqual(['-a', '/Applications/iTerm.app', '/r'])
    expect(terminalLaunch('win32', null, 'C:\\r')).toEqual({ command: 'cmd.exe', args: ['/c', 'start', 'cmd.exe'], cwd: 'C:\\r', wait: false })
    expect(terminalLaunch('linux', null, '/r')).toEqual({ command: 'x-terminal-emulator', args: [], cwd: '/r', wait: false })
    expect(terminalLaunch('linux', '/usr/bin/kitty', '/r').command).toBe('/usr/bin/kitty')
  })
})
