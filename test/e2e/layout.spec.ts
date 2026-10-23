import { expect, type Page, test } from '@playwright/test'
import { makeRepo } from '../helpers/repo'
import { launch } from './launch'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Trascina il centro di un divisore di dx, dy px. */
async function drag(page: Page, testid: string, dx: number, dy: number) {
  const b = await page.getByTestId(testid).boundingBox()
  if (!b) throw new Error(`divisore non visibile: ${testid}`)
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

const width = async (page: Page, selector: string) => Math.round((await page.locator(selector).boundingBox())?.width ?? 0)

test('divisori: la sidebar si allarga, la misura resta dopo il reload e il doppio clic la riporta a 220 px', async () => {
  const repo = makeRepo(2)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  expect(await width(page, 'aside.sidebar')).toBe(220)

  await drag(page, 'split-sidebar', 80, 0)
  await expect.poll(() => width(page, 'aside.sidebar')).toBe(300)

  await page.reload()
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  expect(await width(page, 'aside.sidebar')).toBe(300)

  await page.getByTestId('split-sidebar').dblclick()
  await expect.poll(() => width(page, 'aside.sidebar')).toBe(220)
  await app.close()
})

test('layout verticale dalle impostazioni, ritorno all\'orizzontale dal pulsante della barra', async () => {
  const repo = makeRepo(2)
  const { app, page } = await launch([repo])
  await expect(page.getByTestId('commit-row')).toHaveCount(2)
  const box = async (selector: string) => (await page.locator(selector).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }

  await page.keyboard.press(`${mod}+Comma`)
  await page.getByTestId('pref-panelLayout').selectOption('vertical')
  await page.getByTestId('settings-close').click()
  // Il dettaglio sta sotto la lista, alla stessa x
  await expect.poll(async () => (await box('.detail')).y > (await box('.history')).y + 100).toBe(true)
  expect(Math.round((await box('.detail')).x)).toBe(Math.round((await box('.history')).x))

  await page.getByTestId('layout-toggle').click()
  await expect.poll(async () => (await box('.detail')).x > (await box('.history')).x + 100).toBe(true)
  await page.keyboard.press(`${mod}+Comma`)
  await expect(page.getByTestId('pref-panelLayout')).toHaveValue('horizontal')
  await app.close()
})
