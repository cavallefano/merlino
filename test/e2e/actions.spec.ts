import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { makeRepo } from '../helpers/repo'
import { launch, tempUserData } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('palette, output, menu e scorciatoie delle tab', async () => {
  const a = makeRepo(1)
  const b = makeRepo(1)
  const userData = tempUserData()
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ openRepos: [a, b], activeRepo: a }))
  const { app, page } = await launch([], userData)

  await expect(page.getByTestId('tab')).toHaveCount(2)
  await expect(page.locator('.tab.active')).toContainText(basename(a))
  await page.keyboard.press('Control+Tab')
  await expect(page.locator('.tab.active')).toContainText(basename(b))

  await page.keyboard.press(`${mod}+Shift+P`)
  await page.getByTestId('palette-input').fill('output')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('output-panel')).toContainText('git rev-parse --show-toplevel')

  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('output.toggle')?.click())
  await expect(page.getByTestId('output-panel')).toBeHidden()

  await page.keyboard.press(`${mod}+W`)
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await app.close()
})
