import { expect, test } from '@playwright/test'
import { makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Impostazioni: ⌘, apre, il tema arriva a nativeTheme, Esc chiude; senza "Riapri le tab" il riavvio parte vuoto', async () => {
  const repo = makeRepo(1)
  const { app, page, userData } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(1)

  await page.keyboard.press(`${mod}+Comma`)
  await expect(page.getByTestId('settings')).toBeVisible()
  await page.getByTestId('pref-theme').selectOption('dark')
  await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await page.getByTestId('pref-restoreTabs').uncheck()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings')).toBeHidden()
  await expect(page.getByTestId('commit-row')).toHaveCount(1)
  await app.close()

  const again = await launch([], userData)
  await expect(again.page.getByRole('button', { name: 'Apri repository…' })).toBeVisible()
  await expect(again.page.getByTestId('tab')).toHaveCount(0)
  expect(await again.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
  await again.app.close()
})
