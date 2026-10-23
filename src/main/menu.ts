import { Menu, type MenuItemConstructorOptions } from 'electron'
import { shortcuts, toAccelerator } from '../shared/shortcuts'

/** Barra dei menu: ogni voce manda al renderer l'id di un'azione del registro. Le scorciatoie le gestisce il renderer. */
export function buildMenu(run: (actionId: string) => void): void {
  const isMac = process.platform === 'darwin'
  const action = (label: string, id: string): MenuItemConstructorOptions => ({
    id,
    label,
    accelerator: shortcuts[id] && toAccelerator(shortcuts[id]),
    // La scorciatoia l'ha già eseguita il renderer: qui solo i clic, altrimenti l'azione partirebbe due volte
    click: (_item, _win, event) => {
      if (!event?.triggeredByAccelerator) run(id)
    },
  })
  const quit: MenuItemConstructorOptions[] = isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Esci' }]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Merlino',
            submenu: [
              { role: 'about', label: 'Informazioni su Merlino' },
              { type: 'separator' },
              action('Impostazioni…', 'settings.open'),
              { type: 'separator' },
              { role: 'services', label: 'Servizi' },
              { type: 'separator' },
              { role: 'hide', label: 'Nascondi Merlino' },
              { role: 'hideOthers', label: 'Nascondi altre' },
              { role: 'unhide', label: 'Mostra tutte' },
              { type: 'separator' },
              { role: 'quit', label: 'Esci da Merlino' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        action('Apri repository…', 'repo.open'),
        action('Nuovo repository…', 'repo.init'),
        action('Clona repository…', 'repo.clone'),
        action('Apri nel terminale', 'repo.openTerminal'),
        { type: 'separator' },
        action('Chiudi tab', 'tab.close'),
        ...(isMac ? [] : [{ type: 'separator' } as MenuItemConstructorOptions, action('Impostazioni…', 'settings.open')]),
        ...quit,
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Vista',
      submenu: [
        action('Command palette', 'palette.open'),
        action('Cerca nella storia', 'history.search'),
        action('Output', 'output.toggle'),
        action('Aggiorna', 'repo.refresh'),
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Finestra',
      role: 'window',
      submenu: [action('Tab successiva', 'tab.next'), action('Tab precedente', 'tab.prev'), { type: 'separator' }, { role: 'minimize' }, { role: 'zoom' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
