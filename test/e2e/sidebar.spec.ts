import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRemotePair, makeRepo } from '../helpers/repo'
import { launch } from './launch'

test('si evidenzia solo la riga cliccata, non il branch remoto sullo stesso commit; HEAD sul branch corrente', async () => {
  const { clone } = makeRemotePair()
  const { app, page } = await launch([clone])
  const local = page.getByTestId('branch-item').filter({ hasText: 'main' })
  const remote = page.getByTestId('remote-branch-item').filter({ hasText: 'main' })
  await expect(local.getByTestId('head-badge')).toHaveText('HEAD')
  await expect(remote.getByTestId('head-badge')).toHaveCount(0)

  await local.click()
  await expect(local).toHaveClass(/selected/)
  await expect(remote).not.toHaveClass(/selected/)
  await remote.click()
  await expect(remote).toHaveClass(/selected/)
  await expect(local).not.toHaveClass(/selected/)
  await app.close()
})

test('i tag partono chiusi, si aprono e restano aperti dopo il reload', async () => {
  const repo = makeRepo(1)
  git(repo, 'tag', 'v1.0')
  const { app, page } = await launch([repo])
  const header = page.getByTestId('tags-header')
  await expect(header).toContainText('1')
  await expect(page.getByTestId('tag-item')).toHaveCount(0)

  await header.click()
  await expect(page.getByTestId('tag-item')).toHaveText('v1.0')
  await page.reload()
  await expect(page.getByTestId('tag-item')).toHaveText('v1.0')
  await page.getByTestId('tags-header').click()
  await expect(page.getByTestId('tag-item')).toHaveCount(0)
  await app.close()
})

test('area di lavoro: Local Changes e History cambiano pannello e voce attiva', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'cambiato\n')
  const { app, page } = await launch([repo])
  const working = page.getByTestId('page-working')
  const history = page.getByTestId('page-history')
  await expect(working).toContainText('1')
  await expect(history).toHaveClass(/active/)

  await working.click()
  await expect(page.getByTestId('commit-subject')).toBeVisible()
  await expect(working).toHaveClass(/active/)
  await expect(history).not.toHaveClass(/active/)

  await history.click()
  await expect(page.getByTestId('commit-message')).toContainText('commit 1')
  await expect(history).toHaveClass(/active/)
  await expect(working).not.toHaveClass(/active/)
  await app.close()
})
