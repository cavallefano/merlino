import { expect, test } from '@playwright/test'
import { fakeHosting } from './fake-hosting'
import { launch, tempUserData } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Impostazioni → Account: token rifiutato, poi collegato; il server segue il servizio; rimozione', async () => {
  const server = await fakeHosting([])
  const { app, page } = await launch([], tempUserData(), { MERLINO_E2E_API: server.url })
  await expect(page.getByText('Open Repository…')).toBeVisible()
  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-accounts').click()
  await page.getByTestId('account-add').click()
  await expect(page.getByTestId('account-host')).toHaveValue('github.com')
  await page.getByTestId('account-service').selectOption('gitlab')
  await expect(page.getByTestId('account-host')).toHaveValue('gitlab.com')
  await page.getByTestId('account-host').fill('gitlab.example.com')
  await page.getByTestId('account-token').fill('wrong')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-error')).toHaveText('The token for gitlab.example.com is not valid or has expired')
  await page.getByTestId('account-token').fill('good-token')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-connected')).toHaveText('Connected as ada (gitlab.example.com)')
  await expect(page.getByTestId('account-row')).toHaveText([/GitLab.*ada@gitlab\.example\.com/])
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('account-remove').click()
  await expect(page.getByTestId('account-row')).toHaveCount(0)
  await app.close()
  await server.close()
})
