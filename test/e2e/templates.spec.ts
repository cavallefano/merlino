import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

test('template creato nelle Impostazioni, applicato con "/" e {ticket}; da predefinito precompila dopo il commit', async () => {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'feature/7hq2xk4mp-login')
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(1)

  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-commit').click()
  await page.getByTestId('template-add').click()
  await page.getByTestId('template-name').fill('Feature')
  await page.getByTestId('template-subject').fill('[{ticket}] feat: ')
  await page.getByTestId('template-body').fill('Perché:\n# da togliere\nBranch {branch}')
  await page.getByTestId('settings-close').click()

  await page.getByTestId('working-row').click()
  await page.getByTestId('commit-subject').fill('/fea')
  await expect(page.getByTestId('template-item')).toHaveText(['Feature'])
  await page.getByTestId('commit-subject').press('Enter')
  await expect(page.getByTestId('commit-subject')).toHaveValue('[7hq2xk4mp] feat: ')
  await expect(page.getByTestId('commit-body')).toHaveValue('Perché:\nBranch feature/7hq2xk4mp-login')

  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('settings-commit').click()
  await page.getByTestId('template-default').check()
  await page.getByTestId('settings-close').click()
  await page.getByTestId('commit-subject').fill('[7hq2xk4mp] feat: login')
  await page.getByTestId('commit-body').fill('')
  await page.getByTestId('section-unstaged').getByTestId('stage-file').click()
  await page.getByTestId('commit-button').click()
  await expect(page.getByTestId('commit-row').first()).toContainText('[7hq2xk4mp] feat: login')
  await expect(page.getByTestId('commit-subject')).toHaveValue('[7hq2xk4mp] feat: ')
  await app.close()
})

test('commit.template di git: precompila senza le righe # e compare nel selettore', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, '.gitmessage'), '# Scrivi un oggetto breve\nfix: \n\n# Perché?\nDettagli\n')
  git(repo, 'config', 'commit.template', '.gitmessage')
  writeFileSync(join(repo, 'file1.txt'), 'x\n')
  const { app, page } = await launch([repo])
  await page.getByTestId('working-row').click()
  await expect(page.getByTestId('commit-subject')).toHaveValue('fix: ')
  await expect(page.getByTestId('commit-body')).toHaveValue('Dettagli')

  await page.getByTestId('commit-subject').fill('')
  await page.getByTestId('commit-body').fill('')
  await page.getByTestId('template-toggle').click()
  await expect(page.getByTestId('template-item')).toHaveText([/commit\.template \(git\)/])
  await page.getByTestId('template-item').click()
  await expect(page.getByTestId('commit-subject')).toHaveValue('fix: ')
  await app.close()
})
