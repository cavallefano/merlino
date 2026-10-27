import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch, tempUserData } from './launch'

test('apre il repo passato da riga di comando e segue il branch', async () => {
  const repo = makeRepo(1)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('repo-branch')).toHaveText('main')
  await expect(page.getByTestId('repo-name')).toHaveText(/merlino-/)
  // Con un solo repository la barra delle tab non c'è
  await expect(page.getByTestId('tab')).toHaveCount(0)
  git(repo, 'switch', '-q', '-c', 'feature/prova')
  await expect(page.getByTestId('repo-branch')).toHaveText('feature/prova')
  await app.close()
})

test('riapre le tab al riavvio', async () => {
  const repo = makeRepo(1)
  const first = await launch([repo])
  await expect(first.page.getByTestId('repo-branch')).toHaveText('main')
  await first.app.close()

  const second = await launch([], first.userData)
  await expect(second.page.getByTestId('repo-branch')).toHaveText('main')
  await second.app.close()
})

test('git non trovato: si può indicare il percorso', async () => {
  const userData = tempUserData()
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ gitPath: '/percorso/inesistente/git' }))
  const { app, page } = await launch([], userData)
  await expect(page.getByRole('heading', { name: 'Git not available' })).toBeVisible()
  await page.getByTestId('git-path').fill('git')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Open Repository…')).toBeVisible()
  await app.close()
})
