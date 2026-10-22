import { expect, test } from '@playwright/test'
import { launch } from './launch'

test('si avvia e mostra Merlino', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('Merlino')
  await expect(page.getByRole('heading', { name: 'Merlino' })).toBeVisible()
  await app.close()
})
