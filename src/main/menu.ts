import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { MessageKey } from '../shared/i18n'
import { shortcuts, toAccelerator } from '../shared/shortcuts'
import { t } from './i18n'

/** Barra dei menu: ogni voce manda al renderer l'id di un'azione del registro. Le scorciatoie le gestisce il renderer. */
export function buildMenu(run: (actionId: string) => void): void {
  const isMac = process.platform === 'darwin'
  // Stessa etichetta della palette (chiave action.<id>), salvo dove indicato
  const action = (id: string, label = t(`action.${id}` as MessageKey)): MenuItemConstructorOptions => ({
    id,
    label,
    accelerator: shortcuts[id] && toAccelerator(shortcuts[id]),
    // La scorciatoia l'ha già eseguita il renderer: qui solo i clic, altrimenti l'azione partirebbe due volte
    click: (_item, _win, event) => {
      if (!event?.triggeredByAccelerator) run(id)
    },
  })
  const quit: MenuItemConstructorOptions[] = isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: t('menu.quit') }]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Merlino',
            submenu: [
              { role: 'about', label: t('menu.about') },
              { type: 'separator' },
              action('settings.open'),
              { type: 'separator' },
              { role: 'services', label: t('menu.services') },
              { type: 'separator' },
              { role: 'hide', label: t('menu.hide') },
              { role: 'hideOthers', label: t('menu.hideOthers') },
              { role: 'unhide', label: t('menu.unhide') },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quitMac') },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: t('menu.file'),
      submenu: [
        action('repo.open'),
        action('repo.init'),
        action('repo.clone'),
        action('repo.openTerminal'),
        { type: 'separator' },
        action('tab.close'),
        ...(isMac ? [] : [{ type: 'separator' } as MenuItemConstructorOptions, action('settings.open')]),
        ...quit,
      ],
    },
    { role: 'editMenu' },
    {
      label: t('menu.view'),
      submenu: [
        action('palette.open'),
        action('history.search'),
        action('output.toggle', t('menu.output')),
        action('repo.refresh'),
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: t('menu.window'),
      role: 'window',
      submenu: [action('tab.next'), action('tab.prev'), { type: 'separator' }, { role: 'minimize' }, { role: 'zoom' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
