// Screenshot del README, con la finestra nascosta (solo macOS: ridimensiona con sips).
// npx electron-vite build && MERLINO_SCREENSHOTS=1 npx playwright test test/e2e/readme-screenshots.spec.ts
import { expect, type Page, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fakeHosting, type FakePull } from './fake-hosting'
import { launch, tempUserData } from './launch'
import { chooseNextMenuItem } from './menu'

test.skip(!process.env.MERLINO_SCREENSHOTS, 'solo con MERLINO_SCREENSHOTS=1')

const OUT = join(__dirname, '..', '..', 'docs', 'assets', 'screenshots')
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const PEOPLE = [
  ['Ada Lovelace', 'ada@example.com'],
  ['Grace Hopper', 'grace@example.com'],
  ['Alan Turing', 'alan@example.com'],
  ['Katherine Johnson', 'katherine@example.com'],
] as const

const run = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' }).trim()

/** Un progetto web di prova con storia, branch, merge, tag, un remote e qualche modifica locale. Nomi tutti fittizi. */
function demoApp() {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'merlino-shots-')))
  const repo = join(parent, 'demo-app')
  const bare = join(parent, 'demo-app.git')
  mkdirSync(repo)
  run(repo, ['init', '-q', '-b', 'main'])
  let clock = Date.UTC(2026, 8, 1, 7) / 1000
  const commit = (who: number, message: string, files: Record<string, string>) => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, file)), { recursive: true })
      writeFileSync(join(repo, file), content)
    }
    clock += 5 * 3600
    const [name, email] = PEOPLE[who] ?? PEOPLE[0]
    const date = `${clock} +0200`
    run(repo, ['add', '.'])
    run(repo, ['commit', '-q', '-m', message], {
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    })
  }
  const merge = (who: number, branch: string) => {
    clock += 3600
    const [name, email] = PEOPLE[who] ?? PEOPLE[0]
    const date = `${clock} +0200`
    run(repo, ['merge', '-q', '--no-ff', '-m', `Merge branch '${branch}'`, branch], {
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    })
  }
  const app = (extra: string) => `import { renderHeader } from './header'\nimport { renderList } from './list'\n\nexport function start(root: HTMLElement) {\n  renderHeader(root)\n  renderList(root)\n${extra}}\n`

  commit(0, 'Initial commit', { 'README.md': '# demo-app\n\nA small web app.\n', 'package.json': '{\n  "name": "demo-app",\n  "version": "0.1.0"\n}\n' })
  commit(0, 'Add the app shell', { 'src/app.ts': app(''), 'src/header.ts': 'export function renderHeader(root: HTMLElement) {\n  root.append(document.createElement("header"))\n}\n' })
  commit(2, 'Set up the test runner', { 'test/app.test.ts': "import { test } from 'vitest'\n\ntest('starts', () => {})\n" })
  run(repo, ['tag', 'v0.1.0'])
  run(repo, ['switch', '-q', '-c', 'feature/login'])
  commit(1, 'Add the login form', { 'src/login.ts': 'export function renderLogin(root: HTMLElement) {\n  const form = document.createElement("form")\n  form.innerHTML = `<input name="email"><button>Sign in</button>`\n  root.append(form)\n}\n' })
  commit(1, 'Validate the email field', {
    'src/login.ts':
      'const EMAIL = /^[^@\\s]+@[^@\\s]+$/\n\nexport function renderLogin(root: HTMLElement) {\n  const form = document.createElement("form")\n  form.innerHTML = `<input name="email" type="email" required><button>Sign in</button>`\n  form.addEventListener("submit", (e) => {\n    const email = new FormData(form).get("email")\n    if (!EMAIL.test(String(email))) {\n      e.preventDefault()\n      form.classList.add("invalid")\n    }\n  })\n  root.append(form)\n}\n',
  })
  run(repo, ['switch', '-q', 'main'])
  commit(3, 'Fix the header on small screens', { 'src/header.ts': 'export function renderHeader(root: HTMLElement) {\n  const header = document.createElement("header")\n  header.className = "compact"\n  root.append(header)\n}\n' })
  merge(0, 'feature/login')
  run(repo, ['switch', '-q', '-c', 'feature/search'])
  commit(2, 'Add search to the toolbar', { 'src/search.ts': 'export function search(items: string[], query: string) {\n  return items.filter((item) => item.includes(query))\n}\n' })
  commit(2, 'Highlight search results', { 'src/search.ts': 'export function search(items: string[], query: string) {\n  const q = query.toLowerCase()\n  return items.filter((item) => item.toLowerCase().includes(q))\n}\n\nexport const highlight = (text: string, q: string) => text.replaceAll(q, `<mark>${q}</mark>`)\n' })
  run(repo, ['switch', '-q', 'main'])
  commit(3, 'Update dependencies', { 'package.json': '{\n  "name": "demo-app",\n  "version": "0.2.0"\n}\n' })
  merge(0, 'feature/search')
  run(repo, ['tag', 'v0.2.0'])
  commit(0, 'Add keyboard shortcuts', { 'src/keys.ts': 'export const shortcuts = { search: "/", newItem: "c" }\n' })
  run(repo, ['switch', '-q', '-c', 'feature/dark-mode'])
  commit(1, 'Add dark mode', { 'src/theme.ts': 'export const themes = ["light", "dark"] as const\n' })
  commit(1, 'Respect the system theme', { 'src/theme.ts': 'export const themes = ["light", "dark", "system"] as const\n' })
  run(repo, ['switch', '-q', 'main'])
  run(repo, ['switch', '-q', '-c', 'fix/settings-typo'])
  commit(3, 'Fix a typo in the settings page', { 'src/settings.ts': 'export const title = "Settings"\n' })
  run(repo, ['switch', '-q', 'main'])
  commit(2, 'Show the version in the about box', { 'src/about.ts': 'export const about = () => `demo-app ${VERSION}`\n' })
  commit(0, 'Add the profile page skeleton', { 'src/profile.ts': 'export function renderProfile(root: HTMLElement) {}\n' })
  commit(3, 'Polish the empty states', { 'src/list.ts': 'export function renderList(root: HTMLElement) {\n  root.append("Nothing here yet")\n}\n' })
  commit(1, 'Document the shortcuts', { 'README.md': '# demo-app\n\nA small web app.\n\nPress / to search and c to create an item.\n' })

  // Un "server": origin ha l'URL di GitLab (finto), riscritto sul repo bare; main ha un commit non pubblicato
  run(parent, ['init', '-q', '--bare', '-b', 'main', bare])
  const url = 'https://gitlab.example.com/acme/demo-app.git'
  run(repo, ['remote', 'add', 'origin', url])
  run(repo, ['config', `url.${bare}.insteadOf`, url])
  run(repo, ['push', '-q', '-u', 'origin', 'main~1:refs/heads/main', 'feature/dark-mode', 'fix/settings-typo', '--tags'])
  run(repo, ['branch', '-q', '--set-upstream-to=origin/main', 'main'])
  run(repo, ['fetch', '-q', 'origin'])

  // Modifiche locali: un file cambiato, uno in stage, uno nuovo
  writeFileSync(join(repo, 'src/app.ts'), app('  renderShortcuts(root)\n  renderFooter(root)\n').replace("import { renderList } from './list'\n", "import { renderList } from './list'\nimport { renderFooter, renderShortcuts } from './footer'\n"))
  writeFileSync(join(repo, 'src/footer.ts'), 'export function renderFooter(root: HTMLElement) {\n  root.append(document.createElement("footer"))\n}\n\nexport function renderShortcuts(root: HTMLElement) {}\n')
  writeFileSync(join(repo, 'src/profile.ts'), 'export function renderProfile(root: HTMLElement) {\n  root.append("Profile")\n}\n')
  run(repo, ['add', 'src/profile.ts'])
  return { repo, sha: (ref: string) => run(repo, ['rev-parse', ref]) }
}

/** Le merge request del server finto: una con una pipeline in corso di 40 job su 3 stage. */
function pulls(sha: (ref: string) => string): FakePull[] {
  const at = (hour: number) => new Date(Date.UTC(2026, 9, 22, hour)).toISOString()
  const jobs = (stage: string, names: string[], state: (i: number) => 'success' | 'pending' | 'queued' | 'failure') =>
    names.map((name, i) => ({ name, stage, state: state(i) }))
  const tests = ['unit: core', 'unit: api', 'unit: ui', 'lint', 'typecheck', ...Array.from({ length: 19 }, (_, i) => `e2e: shard ${i + 1}/19`)]
  const base = sha('main~1')
  return [
    {
      number: 14,
      title: 'Add dark mode',
      body: 'Adds a **dark theme** and follows the system setting.\n\n- [x] Light and dark palettes\n- [x] System theme\n- [ ] Screenshots in the docs',
      author: 'grace',
      state: 'open',
      head: 'feature/dark-mode',
      headSha: sha('feature/dark-mode'),
      base: 'main',
      baseSha: base,
      comments: [
        { author: 'ada', body: 'Looks great. Can we keep the accent color the same in both themes?', at: at(9) },
        { author: 'grace', body: 'Done in the second commit.', at: at(10) },
      ],
      commits: [
        { sha: sha('feature/dark-mode~1'), message: 'Add dark mode', at: at(8) },
        { sha: sha('feature/dark-mode'), message: 'Respect the system theme', at: at(10) },
      ],
      checks: [
        ...jobs('build', ['install', 'compile', 'bundle', 'assets'], () => 'success'),
        ...jobs('test', tests, (i) => (i < 11 ? 'success' : i < 14 ? 'pending' : 'queued')),
        ...jobs('deploy', ['staging', 'smoke tests', ...Array.from({ length: 10 }, (_, i) => `region ${i + 1}`)], () => 'queued'),
      ],
      updatedAt: at(11),
    },
    {
      number: 13,
      title: 'Fix a typo in the settings page',
      body: '',
      author: 'katherine',
      state: 'open',
      head: 'fix/settings-typo',
      headSha: sha('fix/settings-typo'),
      base: 'main',
      baseSha: base,
      comments: [],
      commits: [{ sha: sha('fix/settings-typo'), message: 'Fix a typo in the settings page', at: at(7) }],
      checks: [{ name: 'build', state: 'success', stage: 'build' }, { name: 'test', state: 'success', stage: 'test' }],
      updatedAt: at(9),
    },
    {
      number: 12,
      title: 'Export the history as CSV',
      body: '',
      author: 'alan',
      state: 'open',
      draft: true,
      head: 'feature/export',
      headSha: 'e'.repeat(40),
      fork: 'alan',
      base: 'main',
      baseSha: base,
      comments: [],
      commits: [],
      checks: [{ name: 'build', state: 'success', stage: 'build' }, { name: 'unit: api', state: 'failure', stage: 'test' }],
      updatedAt: at(6),
    },
  ]
}

/** Screenshot della finestra (1280×820), in JPEG largo 1600 px. */
async function shot(page: Page, name: string) {
  // Il mouse fuori dalle liste: niente righe evidenziate al passaggio
  await page.mouse.move(640, 5)
  await page.waitForTimeout(400)
  const file = join(OUT, `${name}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 })
  execFileSync('sips', ['-Z', '1600', file], { stdio: 'ignore' })
}

test('screenshot del README', async () => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  const demo = demoApp()
  const server = await fakeHosting(pulls(demo.sha))
  const { app, page } = await launch([demo.repo], tempUserData(), { MERLINO_E2E_API: server.url })
  await page.evaluate(() => (globalThis as unknown as { api: { addAccount(s: string, h: string, t: string): Promise<unknown> } }).api.addAccount('gitlab', 'gitlab.example.com', 'good-token'))

  // Storia, chiara e scura, con un commit aperto
  await page.getByTestId('commit-row').filter({ hasText: 'Validate the email field' }).click()
  await expect(page.getByTestId('diff-line-add').first()).toBeVisible()
  // La lista è scesa fino al commit: torna in cima, dove ci sono main e le modifiche locali
  // In stringa: i tipi dei test non hanno il DOM
  await page.evaluate(`(() => {
    let el = document.querySelector('[data-testid="commit-row"]')?.parentElement
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement
    if (el) el.scrollTop = 0
  })()`)
  await page.emulateMedia({ colorScheme: 'light' })
  await shot(page, 'history-light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await shot(page, 'history-dark')

  // Modifiche locali con due righe scelte e il messaggio
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-unstaged').getByTestId('working-file').filter({ hasText: 'app.ts' }).click()
  await page.getByTestId('stage-line').filter({ hasText: 'renderShortcuts(root)' }).click()
  await page.getByTestId('stage-line').filter({ hasText: 'renderFooter(root)' }).first().click({ modifiers: ['Shift'] })
  await page.getByTestId('commit-subject').fill('Add the footer')
  await shot(page, 'changes-light')

  // Pull request: la merge request con la pipeline in corso, sulla scheda Controlli
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.keyboard.press(`${mod}+2`)
  await expect(page.getByTestId('ci-progress').first()).toBeVisible()
  await page.getByTestId('pr-row').first().getByTestId('ci-progress').click()
  await expect(page.getByTestId('ci-job').first()).toBeVisible()
  await shot(page, 'pull-requests-dark')

  // Rebase interattivo
  await page.keyboard.press(`${mod}+1`)
  await chooseNextMenuItem(app, 'Interactive Rebase from Here…')
  await page.getByTestId('commit-row').filter({ hasText: 'Add keyboard shortcuts' }).click({ button: 'right' })
  const rows = page.getByTestId('rebase-row')
  await rows.filter({ hasText: 'Polish the empty states' }).getByTestId('rebase-action').selectOption('squash')
  await rows.filter({ hasText: 'Document the shortcuts' }).getByTestId('rebase-action').selectOption('reword')
  await rows.filter({ hasText: 'Document the shortcuts' }).getByTestId('rebase-message').fill('Document the keyboard shortcuts')
  await shot(page, 'rebase-dark')
  await page.keyboard.press('Escape')

  // Palette dei comandi
  await page.emulateMedia({ colorScheme: 'light' })
  await page.keyboard.press(`${mod}+Shift+P`)
  await page.keyboard.type('pull')
  await shot(page, 'palette-light')

  await app.close()
  await server.close()
})
