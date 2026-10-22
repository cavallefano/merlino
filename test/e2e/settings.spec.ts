import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeRepo } from '../helpers/repo'
import { launch, tempUserData } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Impostazioni: ⌘, apre, il tema arriva a nativeTheme, Esc chiude; senza "Riapri le tab" il riavvio parte vuoto', async () => {
  const repo = makeRepo(1)
  const { app, page, userData } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(1)

  await page.keyboard.press(`${mod}+Comma`)
  await expect(page.getByTestId('settings')).toBeVisible()
  // Playwright forza prefers-color-scheme: light; senza emulazione la pagina segue nativeTheme
  await page.emulateMedia({ colorScheme: null })
  type Win = { matchMedia: (query: string) => { matches: boolean } }
  const dark = () => page.evaluate(() => (globalThis as unknown as Win).matchMedia('(prefers-color-scheme: dark)').matches)
  await page.getByTestId('pref-theme').selectOption('light')
  await expect.poll(dark).toBe(false)
  await page.getByTestId('pref-theme').selectOption('dark')
  await expect.poll(dark).toBe(true)
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

test('sezione Git: nome ed email finiscono nella config globale (temporanea)', async () => {
  const global = join(mkdtempSync(join(tmpdir(), 'merlino-gc-')), 'gitconfig')
  writeFileSync(global, '')
  const { app, page } = await launch([], tempUserData(), { GIT_CONFIG_GLOBAL: global })
  // Prima che l'app abbia finito l'avvio la scorciatoia non è ancora registrata
  await expect(page.getByRole('button', { name: 'Apri repository…' })).toBeVisible()
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-git').click()
  await page.getByTestId('git-user.name').fill('Ada Lovelace')
  await page.getByTestId('git-user.name').press('Tab')
  await page.getByTestId('git-user.email').fill('ada@example.com')
  await page.getByTestId('git-user.email').press('Tab')
  await expect.poll(() => readFileSync(global, 'utf8')).toContain('name = Ada Lovelace')
  await expect.poll(() => readFileSync(global, 'utf8')).toContain('email = ada@example.com')
  await app.close()
})
