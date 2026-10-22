import type { ElectronApplication } from '@playwright/test'

/** Il prossimo menu contestuale nativo sceglie da solo la voce indicata (i menu nativi non si cliccano da Playwright). */
export async function chooseNextMenuItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, wanted) => {
    const original = Menu.prototype.popup
    Menu.prototype.popup = function (this: Electron.Menu, options?: Electron.PopupOptions) {
      Menu.prototype.popup = original
      const item = this.items.find((i) => i.label === wanted)
      if (!item) throw new Error(`voce di menu non trovata: ${wanted}`)
      item.click()
      options?.callback?.()
    }
  }, label)
}
