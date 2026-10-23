# Merlino — Drag & drop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trascinare branch, commit, file e stash per merge, rebase, push, cherry-pick, stage, stash e così via, come in Tower, più trascinare i file verso altre app.

**Architecture:**
- La logica sta in una funzione pura, `dropAction(source, target, alt, context)`, che restituisce `{ label, operation }` oppure `null`.
- Il renderer usa il drag & drop HTML5, con un piccolo stato condiviso (`drag`) e un'etichetta che segue il cursore (`DropHint`).
- I file usano il drag nativo di Electron (`startDrag`) quando il main accetta il file; altrimenti restano un drag interno.
- Nel main ci sono quattro nuove varianti di `RepoCommand` (`pushBranch`, `fastForward`, `stashFiles`, `applyFileChanges`) e l'IPC sincrona `startDrag`.

**Tech Stack:** Electron 45 (`webContents.startDrag`, `nativeImage`), Vue 3, Pinia, TypeScript, Vitest, Playwright (`locator.dragTo`, `dispatchEvent`); git ≥ 2.35.

Spec: `docs/superpowers/specs/2026-10-22-merlino-drag-and-drop-design.md`. Branch: `feature/drag-and-drop`, che parte da `feature/impostazioni`.

## Global Constraints

- **Rilascio**: esegue subito. <kbd>⌥</kbd> (`altKey`) al momento del rilascio dà l'azione alternativa. Le conferme restano quelle già previste.
- **Etichette** dell'azione, in italiano: "Merge di X in Y", "Rebase di Y su X", "Cherry-pick di abc1234 in Y", "Revert di abc1234", "Push di X su R", "X segue R/Y", "Aggiorna X da R/Y (fast-forward)", "Nuovo branch da X…", "Nuovo tag su abc1234…", "Stage di …", "Unstage di …", "Stash di …", "Apply di stash@{n}", "Pop di stash@{n}", "Applica le modifiche di <file>".
- **Validazione**: le nuove varianti di `RepoCommand` usano `refName`, `sha` e `relPath`; gli elenchi di percorsi usano `list(…, relPath)`.
- **Messaggio per il fast-forward rifiutato**: "`<branch>` non si può aggiornare in fast-forward da `<from>`: fai checkout e merge".
- **Drag nativo**: un file di un commit si scrive in `os.tmpdir()/merlino-drag-<casuale>/<nome>`, al massimo 50 MB. Un file delle modifiche è il file vero, perché fuori dall'app Electron consente solo la copia.
- **Test**: sempre con la finestra nascosta (`MERLINO_E2E=1`, già impostato da `launch()`).
- **Dipendenze**: nessuna nuova.

---

### Task 1: Operazioni git nuove (push di un branch, fast-forward, stash di file, modifiche di un file)

**Files:**
- Modify: `src/shared/types.ts` (`RepoCommand`), `src/main/validate.ts` (`repoCommand`)
- Modify: `src/main/git/branches.ts`, `src/main/git/working.ts`
- Test: `test/integration/drag.test.ts` (nuovo), `test/unit/validate.test.ts`

**Interfaces:**
- Produces:
  - varianti di `RepoCommand`:
    - `{ kind: 'pushBranch'; remote; branch; remoteBranch }`
    - `{ kind: 'fastForward'; branch; from }`
    - `{ kind: 'stashFiles'; paths: string[]; untracked: boolean }`
    - `{ kind: 'applyFileChanges'; sha; path }`
  - funzioni `pushBranch(r, remote, branch, remoteBranch, onProgress)`, `fastForward(r, branch, from)`, `stashFiles(runner, paths, untracked)`, `applyFileChanges(runner, sha, path)`.

- [ ] **Step 1: Test di integrazione**

Crea `test/integration/drag.test.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fastForward, pushBranch } from '../../src/main/git/branches'
import { GitRunner } from '../../src/main/git/runner'
import { applyFileChanges, stashFiles } from '../../src/main/git/working'
import { git, makeRemotePair, makeRepo } from '../helpers/repo'

const runnerFor = (repo: string) => new GitRunner(() => 'git', repo, () => {})
const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}

describe('operazioni del drag & drop', () => {
  it('push di un branch non corrente, anche con un altro nome, con upstream', async () => {
    const { bare, clone: repo } = makeRemotePair()
    git(repo, 'branch', 'feature/a')
    await pushBranch(runnerFor(repo), 'origin', 'feature/a', 'feature/a', () => {})
    await pushBranch(runnerFor(repo), 'origin', 'feature/a', 'altro-nome', () => {})
    expect(git(bare, 'branch', '--list').split('\n').map((l) => l.trim())).toEqual(expect.arrayContaining(['feature/a', 'altro-nome']))
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'feature/a@{u}').trim()).toBe('origin/altro-nome')
  })

  it('fast-forward di un branch non corrente; se non si può, messaggio dedicato', async () => {
    const { clone: repo } = makeRemotePair()
    git(repo, 'branch', 'indietro')
    commitFile(repo, 'n.txt', 'n\n', 'nuovo')
    git(repo, 'push', '-q', 'origin', 'main')
    git(repo, 'switch', '-q', '-c', 'lavoro')
    await fastForward(runnerFor(repo), 'indietro', 'origin/main')
    expect(git(repo, 'log', '-1', '--format=%s', 'indietro').trim()).toBe('nuovo')

    git(repo, 'switch', '-q', 'indietro')
    commitFile(repo, 'l.txt', 'l\n', 'solo locale')
    git(repo, 'switch', '-q', 'lavoro')
    await expect(fastForward(runnerFor(repo), 'indietro', 'origin/main')).rejects.toThrow(/non si può aggiornare in fast-forward da origin\/main/)
  })

  it('stash solo dei file indicati, anche non tracciati', async () => {
    const repo = makeRepo(2)
    writeFileSync(join(repo, 'file1.txt'), 'cambiato 1\n')
    writeFileSync(join(repo, 'file2.txt'), 'cambiato 2\n')
    writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
    await stashFiles(runnerFor(repo), ['file1.txt'], false)
    expect(git(repo, 'status', '--porcelain').split('\n').filter(Boolean)).toEqual([' M file2.txt', '?? nuovo.txt'])
    await stashFiles(runnerFor(repo), ['nuovo.txt'], true)
    expect(git(repo, 'status', '--porcelain').trim()).toBe('M file2.txt')
    expect(git(repo, 'stash', 'list').trim().split('\n')).toHaveLength(2)
  })

  it('applica le modifiche di un solo file da un commit e da uno stash', async () => {
    const repo = makeRepo(1)
    git(repo, 'switch', '-q', '-c', 'altro')
    writeFileSync(join(repo, 'file1.txt'), '1\naltro\n')
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'due file')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()
    git(repo, 'switch', '-q', 'main')
    await applyFileChanges(runnerFor(repo), sha, 'file1.txt')
    expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('1\naltro\n')
    expect(git(repo, 'status', '--porcelain').trim()).toBe('M file1.txt')

    git(repo, 'stash', 'push', '-q')
    await applyFileChanges(runnerFor(repo), git(repo, 'rev-parse', 'stash@{0}').trim(), 'file1.txt')
    expect(readFileSync(join(repo, 'file1.txt'), 'utf8')).toBe('1\naltro\n')
    await expect(applyFileChanges(runnerFor(repo), sha, 'file1.txt')).rejects.toThrow()
  })
})
```

In `test/unit/validate.test.ts`, dentro `describe('validazione degli argomenti dal renderer', …)`:

```ts
  it('comandi del drag & drop', () => {
    expect(repoCommand({ kind: 'pushBranch', remote: 'origin', branch: 'feature/a', remoteBranch: 'feature/a' })).toEqual({
      kind: 'pushBranch',
      remote: 'origin',
      branch: 'feature/a',
      remoteBranch: 'feature/a',
    })
    expect(repoCommand({ kind: 'stashFiles', paths: ['a.txt'], untracked: 1 })).toEqual({ kind: 'stashFiles', paths: ['a.txt'], untracked: false })
    for (const bad of [
      { kind: 'pushBranch', remote: 'origin', branch: 'a:b', remoteBranch: 'a' },
      { kind: 'fastForward', branch: '-x', from: 'origin/main' },
      { kind: 'stashFiles', paths: ['../fuori'] },
      { kind: 'stashFiles', paths: [] },
      { kind: 'applyFileChanges', sha: 'HEAD', path: 'a.txt' },
    ]) expect(() => repoCommand(bad)).toThrow()
  })
```

Run: `npx vitest run test/integration/drag.test.ts test/unit/validate.test.ts`
Expected: FAIL, perché le funzioni e le varianti non esistono.

- [ ] **Step 2: Tipi e validazione**

In `src/shared/types.ts`, dentro `RepoCommand`, prima di `| { kind: 'rebaseInteractive'; … }`:

```ts
  | { kind: 'pushBranch'; remote: string; branch: string; remoteBranch: string }
  | { kind: 'fastForward'; branch: string; from: string }
  | { kind: 'stashFiles'; paths: string[]; untracked: boolean }
  | { kind: 'applyFileChanges'; sha: string; path: string }
```

In `src/main/validate.ts`, dentro lo `switch` di `repoCommand`, prima di `case 'rebaseInteractive':`:

```ts
    case 'pushBranch':
      return { kind: 'pushBranch', remote: refName(v.remote), branch: refName(v.branch), remoteBranch: refName(v.remoteBranch) }
    case 'fastForward':
      return { kind: 'fastForward', branch: refName(v.branch), from: refName(v.from) }
    case 'stashFiles':
      return { kind: 'stashFiles', paths: list(v.paths, relPath), untracked: v.untracked === true }
    case 'applyFileChanges':
      return { kind: 'applyFileChanges', sha: sha(v.sha), path: relPath(v.path) }
```

- [ ] **Step 3: Funzioni git**

In `src/main/git/branches.ts`:
- importa `GitError` insieme a `GitRunner`: `import { GitError, GitRunner } from './runner'`;
- importa `applyFileChanges` e `stashFiles` da `./working`;
- dopo `push`:

```ts
/** Push di un branch qualsiasi (anche non corrente), con upstream. */
export const pushBranch = (r: GitRunner, remote: string, branch: string, remoteBranch: string, onProgress: Progress) =>
  run(r, ['push', '--progress', '-u', remote, `refs/heads/${branch}:refs/heads/${remoteBranch}`], onProgress)

/** Aggiorna un branch non corrente senza checkout, solo in fast-forward. */
export async function fastForward(r: GitRunner, branch: string, from: string): Promise<void> {
  try {
    await run(r, ['fetch', '.', `${from}:refs/heads/${branch}`])
  } catch (e) {
    // git lo segnala come "[rejected]", che explain() tradurrebbe in un push rifiutato
    if (e instanceof GitError && /rejected|non-fast-forward/.test(e.info.stderr)) {
      throw new GitError({ ...e.info, message: `${branch} non si può aggiornare in fast-forward da ${from}: fai checkout e merge` })
    }
    throw e
  }
}
```

- in `runCommand`, prima di `case 'rebaseInteractive':`:

```ts
    case 'pushBranch':
      return pushBranch(r, c.remote, c.branch, c.remoteBranch, onProgress)
    case 'fastForward':
      return fastForward(r, c.branch, c.from)
    case 'stashFiles':
      return stashFiles(r, c.paths, c.untracked)
    case 'applyFileChanges':
      return applyFileChanges(r, c.sha, c.path)
```

In `src/main/git/working.ts`, dopo `stashPush`:

```ts
/** Stash solo dei percorsi indicati (-u per includere i non tracciati). */
export async function stashFiles(runner: GitRunner, paths: string[], untracked: boolean): Promise<void> {
  await runner.run(['stash', 'push', ...(untracked ? ['-u'] : []), '--', ...paths], write)
}

/** Applica alla cartella di lavoro le modifiche di un file in un commit (o stash), rispetto al primo genitore. */
export async function applyFileChanges(runner: GitRunner, sha: string, path: string): Promise<void> {
  const patch = (await runner.run(['show', '--format=', '--binary', '--diff-merges=first-parent', sha, '--', path])).stdout
  if (!patch.trim()) throw new Error(`Nessuna modifica di ${path} da applicare`)
  await runner.run(['apply', '-'], { ...write, stdin: patch })
}
```

Run: `npx vitest run test/integration/drag.test.ts test/unit/validate.test.ts`
Expected: PASS.

- [ ] **Step 4: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: push di un branch qualsiasi, fast-forward senza checkout, stash di alcuni file, modifiche di un file da un commit"
```

---

### Task 2: Drag nativo dei file (IPC `startDrag`)

**Files:**
- Create: `src/main/drag-file.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc-handlers.ts`
- Test: `test/integration/drag.test.ts`

**Interfaces:**
- Produces:
  - `dragFile(gitPath: string, root: string, item: { path: string; sha?: string }): string`, che restituisce il percorso del file da trascinare;
  - `Api.startDrag(root: string, item: { path: string; sha?: string }): Result<void>` (sincrona);
  - `Channels.startDrag = 'app:start-drag'`.

- [ ] **Step 1: Test di integrazione di `dragFile`**

In `test/integration/drag.test.ts` aggiungi l'import `import { dragFile } from '../../src/main/drag-file'` e:

```ts
describe('file da trascinare fuori', () => {
  it('modifiche: il file vero; commit: il contenuto di quel commit in una cartella temporanea', () => {
    const repo = makeRepo(1)
    const first = git(repo, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(repo, 'file1.txt'), 'dopo\n')
    expect(dragFile('git', repo, { path: 'file1.txt' })).toBe(join(repo, 'file1.txt'))
    const copy = dragFile('git', repo, { path: 'file1.txt', sha: first })
    expect(copy).not.toBe(join(repo, 'file1.txt'))
    expect(copy.endsWith('file1.txt')).toBe(true)
    expect(readFileSync(copy, 'utf8')).toBe('1\n')
    expect(() => dragFile('git', repo, { path: 'manca.txt' })).toThrow()
    expect(() => dragFile('git', repo, { path: 'manca.txt', sha: first })).toThrow()
  })
})
```

Run: `npx vitest run test/integration/drag.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/main/drag-file.ts`**

```ts
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const MAX_BYTES = 50 * 1024 * 1024

/**
 * Il file da passare a startDrag. Modifiche: il file vero (fuori dall'app Electron consente solo la copia).
 * Commit: il contenuto in quel commit, scritto in una cartella temporanea che resta finché il sistema non la pulisce
 * (serve all'app di destinazione anche dopo il rilascio). Sincrono: il drag nativo deve partire dentro il dragstart.
 */
export function dragFile(gitPath: string, root: string, item: { path: string; sha?: string }): string {
  if (!item.sha) {
    const file = join(root, item.path)
    if (!existsSync(file)) throw new Error(`${item.path} non esiste nella cartella di lavoro`)
    return file
  }
  const content = execFileSync(gitPath, ['cat-file', 'blob', `${item.sha}:${item.path}`], {
    cwd: root,
    maxBuffer: MAX_BYTES,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const file = join(mkdtempSync(join(tmpdir(), 'merlino-drag-')), basename(item.path))
  writeFileSync(file, content)
  return file
}
```

Run: `npx vitest run test/integration/drag.test.ts`
Expected: PASS.

- [ ] **Step 3: IPC sincrona**

In `src/shared/ipc.ts`:
- in `Channels` aggiungi `startDrag: 'app:start-drag',`;
- nell'`Api`:

```ts
  /** Avvia il drag nativo di un file (anche verso altre app); sincrona perché va chiamata dentro il dragstart. */
  startDrag(root: string, item: { path: string; sha?: string }): Result<void>
```

In `src/preload/index.ts`:

```ts
  startDrag: (root, item) => ipcRenderer.sendSync(Channels.startDrag, root, item),
```

In `src/main/ipc-handlers.ts`:
- aggiungi `nativeImage` all'import da `electron` e `dragFile` da `./drag-file`;
- in cima al file, dopo le costanti:

```ts
// Icona del drag nativo (macOS la vuole non vuota): un quadrato grigio 16×16
const DRAG_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR4nGPomjzvPyWYYdSAUQNGDRguBgAAche6HxUly5oAAAAASUVORK5CYII=',
)
```

- dopo l'handler di `openInTerminal`:

```ts
  ipcMain.on(Channels.startDrag, (e, root: unknown, item: unknown) => {
    try {
      const session = sessions.get(str(root, 'root'))
      if (!session) throw new Error('Repository non aperto')
      const v = (typeof item === 'object' && item !== null ? item : {}) as { path?: unknown; sha?: unknown }
      const target = v.sha === undefined ? { path: relPath(v.path) } : { path: relPath(v.path), sha: sha(v.sha) }
      e.sender.startDrag({ file: dragFile(gitPath(), session.root, target), icon: DRAG_ICON })
      e.returnValue = { ok: true, value: undefined }
    } catch (err) {
      e.returnValue = fail(err)
    }
  })
```

- [ ] **Step 4: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde.

```bash
git add src test
git commit -m "feat: drag nativo dei file verso altre app (file vero o contenuto di un commit)"
```

---

### Task 3: `dropAction`, la tabella dei gesti

**Files:**
- Create: `src/renderer/drag/drop-actions.ts`
- Test: `test/unit/drop-actions.test.ts`

**Interfaces:**
- Produces: i tipi `DragSource`, `DropTarget`, `DropOperation`, `DropContext` e `DropAction`, e la funzione `dropAction(source, target, alt, ctx): DropAction | null`.

- [ ] **Step 1: Test unit**

Crea `test/unit/drop-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { type DragSource, dropAction, type DropContext, type DropTarget } from '../../src/renderer/drag/drop-actions'
import type { WorkingFile } from '../../src/shared/types'

const ctx: DropContext = {
  currentBranch: 'main',
  remotes: [{ name: 'origin', url: 'x', branches: [{ name: 'feature/a', fullName: 'origin/feature/a', sha: 'a1' }, { name: 'main', fullName: 'origin/main', sha: 'b2' }] }],
}
const branch = (name: string): DragSource => ({ kind: 'branch', name })
const remoteBranch = (name: string): DragSource & DropTarget => ({ kind: 'remoteBranch', remote: 'origin', name, fullName: `origin/${name}` })
const commit: DragSource = { kind: 'commit', sha: 'abcdef1234' }
const file = (path: string): WorkingFile => ({ path, status: 'M' })
const act = (s: DragSource, t: DropTarget, alt = false) => dropAction(s, t, alt, ctx)

describe('dropAction', () => {
  it('branch sul corrente: merge; con ⌥ rebase', () => {
    expect(act(branch('feature/a'), { kind: 'branch', name: 'main' })).toEqual({
      label: 'Merge di feature/a in main',
      operation: { type: 'git', command: { kind: 'merge', ref: 'feature/a', noFf: false } },
    })
    expect(act(remoteBranch('feature/a'), { kind: 'branch', name: 'main' }, true)?.operation).toEqual({ type: 'git', command: { kind: 'rebase', onto: 'origin/feature/a' } })
  })

  it('branch remoto su un locale non corrente: fast-forward; con ⌥ upstream', () => {
    expect(act(remoteBranch('feature/a'), { kind: 'branch', name: 'feature/a' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'fastForward', branch: 'feature/a', from: 'origin/feature/a' },
    })
    expect(act(remoteBranch('feature/a'), { kind: 'branch', name: 'feature/a' }, true)?.label).toBe('feature/a segue origin/feature/a')
  })

  it('branch locale su un remote: push; con ⌥ upstream solo se il branch remoto esiste', () => {
    expect(act(branch('feature/a'), { kind: 'remote', name: 'origin' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'pushBranch', remote: 'origin', branch: 'feature/a', remoteBranch: 'feature/a' },
    })
    expect(act(branch('feature/a'), { kind: 'remote', name: 'origin' }, true)?.operation).toEqual({
      type: 'git',
      command: { kind: 'setUpstream', branch: 'feature/a', upstream: 'origin/feature/a' },
    })
    expect(act(branch('nuovo'), { kind: 'remote', name: 'origin' }, true)).toBeNull()
  })

  it('branch locale su un branch remoto: push lì; con ⌥ upstream', () => {
    expect(act(branch('feature/a'), remoteBranch('main'))?.operation).toEqual({
      type: 'git',
      command: { kind: 'pushBranch', remote: 'origin', branch: 'feature/a', remoteBranch: 'main' },
    })
    expect(act(branch('feature/a'), remoteBranch('main'), true)?.label).toBe('feature/a segue origin/main')
  })

  it('intestazioni: nuovo branch da branch, tag o commit; nuovo tag da un commit; stash dei file', () => {
    expect(act({ kind: 'tag', name: 'v1' }, { kind: 'branchesHeader' })).toEqual({ label: 'Nuovo branch da v1…', operation: { type: 'createBranch', start: 'v1' } })
    expect(act(commit, { kind: 'branchesHeader' })?.operation).toEqual({ type: 'createBranch', start: 'abcdef1234' })
    expect(act(commit, { kind: 'tagsHeader' })).toEqual({ label: 'Nuovo tag su abcdef1…', operation: { type: 'createTag', sha: 'abcdef1234' } })
    expect(act({ kind: 'files', area: 'untracked', files: [file('n.txt')] }, { kind: 'stashHeader' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'stashFiles', paths: ['n.txt'], untracked: true },
    })
    expect(act({ kind: 'files', area: 'staged', files: [{ path: 'b', oldPath: 'a', status: 'R' }] }, { kind: 'stashHeader' })?.operation).toEqual({
      type: 'git',
      command: { kind: 'stashFiles', paths: ['a', 'b'], untracked: false },
    })
  })

  it('commit sul corrente o sulle modifiche locali: cherry-pick; con ⌥ revert', () => {
    expect(act(commit, { kind: 'branch', name: 'main' })?.label).toBe('Cherry-pick di abcdef1 in main')
    expect(act(commit, { kind: 'working' }, true)?.operation).toEqual({ type: 'git', command: { kind: 'revert', sha: 'abcdef1234' } })
  })

  it('stash e file di un commit sulle modifiche locali; file fra le sezioni', () => {
    expect(act({ kind: 'stash', ref: 'stash@{0}', sha: 's' }, { kind: 'working' }, true)).toEqual({
      label: 'Pop di stash@{0}',
      operation: { type: 'stash', action: 'pop', ref: 'stash@{0}' },
    })
    expect(act({ kind: 'commitFile', sha: 'abc1234', path: 'src/a.ts' }, { kind: 'working' })?.label).toBe('Applica le modifiche di a.ts')
    expect(act({ kind: 'files', area: 'unstaged', files: [file('a')] }, { kind: 'area', area: 'staged' })?.label).toBe('Stage di a')
    expect(act({ kind: 'files', area: 'staged', files: [file('a'), file('b')] }, { kind: 'area', area: 'unstaged' })?.label).toBe('Unstage di 2 file')
  })

  it('rilasci non ammessi', () => {
    const none: [DragSource, DropTarget][] = [
      [branch('main'), { kind: 'branch', name: 'main' }],
      [branch('feature/a'), { kind: 'branch', name: 'feature/b' }],
      [commit, { kind: 'branch', name: 'feature/a' }],
      [{ kind: 'files', area: 'unstaged', files: [file('a')] }, { kind: 'remote', name: 'origin' }],
      [{ kind: 'files', area: 'unstaged', files: [file('a')] }, { kind: 'area', area: 'unstaged' }],
      [{ kind: 'files', area: 'conflicted', files: [file('a')] }, { kind: 'stashHeader' }],
      [{ kind: 'tag', name: 'v1' }, { kind: 'remote', name: 'origin' }],
      [{ kind: 'stash', ref: 'stash@{0}', sha: 's' }, { kind: 'branch', name: 'main' }],
      [remoteBranch('main'), { kind: 'remote', name: 'origin' }],
    ]
    for (const [s, t] of none) expect(act(s, t)).toBeNull()
    expect(dropAction(commit, { kind: 'branch', name: 'main' }, false, { ...ctx, currentBranch: null })).toBeNull()
  })
})
```

Run: `npx vitest run test/unit/drop-actions.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 2: `src/renderer/drag/drop-actions.ts`**

```ts
import type { RemoteInfo, RepoCommand, WorkingArea, WorkingFile } from '../../shared/types'

export type DragSource =
  | { kind: 'branch'; name: string }
  | { kind: 'remoteBranch'; remote: string; name: string; fullName: string }
  | { kind: 'tag'; name: string }
  | { kind: 'commit'; sha: string }
  | { kind: 'files'; area: WorkingArea; files: WorkingFile[] }
  | { kind: 'stash'; ref: string; sha: string }
  | { kind: 'commitFile'; sha: string; path: string }

export type DropTarget =
  | { kind: 'branch'; name: string }
  | { kind: 'remote'; name: string }
  | { kind: 'remoteBranch'; remote: string; name: string; fullName: string }
  | { kind: 'branchesHeader' }
  | { kind: 'tagsHeader' }
  | { kind: 'stashHeader' }
  | { kind: 'working' }
  | { kind: 'area'; area: 'staged' | 'unstaged' }

export type DropOperation =
  | { type: 'git'; command: RepoCommand }
  | { type: 'createBranch'; start: string }
  | { type: 'createTag'; sha: string }
  | { type: 'stage' | 'unstage'; files: WorkingFile[] }
  | { type: 'stash'; action: 'apply' | 'pop'; ref: string }

export interface DropContext {
  /** null con HEAD staccato. */
  currentBranch: string | null
  remotes: RemoteInfo[]
}

export interface DropAction {
  label: string
  operation: DropOperation
}

const short = (sha: string) => sha.slice(0, 7)
const git = (label: string, command: RepoCommand): DropAction => ({ label, operation: { type: 'git', command } })
const fileLabel = (files: WorkingFile[]) => (files.length === 1 ? (files[0]?.path ?? '') : `${files.length} file`)

/** Il commit sul branch corrente o sulle modifiche locali: cherry-pick, con ⌥ revert. */
function commitOnHead(sha: string, alt: boolean, current: string | null): DropAction {
  return alt
    ? git(`Revert di ${short(sha)}`, { kind: 'revert', sha })
    : git(`Cherry-pick di ${short(sha)}${current ? ` in ${current}` : ''}`, { kind: 'cherryPick', sha })
}

/** Cosa succede rilasciando source su target (alt: ⌥ tenuto); null se il rilascio non è ammesso. Vedi la spec, tabella dei gesti. */
export function dropAction(source: DragSource, target: DropTarget, alt: boolean, ctx: DropContext): DropAction | null {
  const current = ctx.currentBranch
  switch (target.kind) {
    case 'branch': {
      if (target.name === current) {
        if (source.kind === 'commit') return commitOnHead(source.sha, alt, current)
        if (source.kind !== 'branch' && source.kind !== 'remoteBranch') return null
        const from = source.kind === 'branch' ? source.name : source.fullName
        if (from === current) return null
        return alt
          ? git(`Rebase di ${current} su ${from}`, { kind: 'rebase', onto: from })
          : git(`Merge di ${from} in ${current}`, { kind: 'merge', ref: from, noFf: false })
      }
      if (source.kind !== 'remoteBranch') return null
      return alt
        ? git(`${target.name} segue ${source.fullName}`, { kind: 'setUpstream', branch: target.name, upstream: source.fullName })
        : git(`Aggiorna ${target.name} da ${source.fullName} (fast-forward)`, { kind: 'fastForward', branch: target.name, from: source.fullName })
    }
    case 'remote': {
      if (source.kind !== 'branch') return null
      if (!alt) return git(`Push di ${source.name} su ${target.name}`, { kind: 'pushBranch', remote: target.name, branch: source.name, remoteBranch: source.name })
      const upstream = `${target.name}/${source.name}`
      const exists = ctx.remotes.some((r) => r.name === target.name && r.branches.some((b) => b.fullName === upstream))
      return exists ? git(`${source.name} segue ${upstream}`, { kind: 'setUpstream', branch: source.name, upstream }) : null
    }
    case 'remoteBranch':
      if (source.kind !== 'branch') return null
      return alt
        ? git(`${source.name} segue ${target.fullName}`, { kind: 'setUpstream', branch: source.name, upstream: target.fullName })
        : git(`Push di ${source.name} su ${target.fullName}`, { kind: 'pushBranch', remote: target.remote, branch: source.name, remoteBranch: target.name })
    case 'branchesHeader': {
      const start =
        source.kind === 'branch' || source.kind === 'tag' ? source.name : source.kind === 'remoteBranch' ? source.fullName : source.kind === 'commit' ? source.sha : null
      if (!start) return null
      return { label: `Nuovo branch da ${source.kind === 'commit' ? short(start) : start}…`, operation: { type: 'createBranch', start } }
    }
    case 'tagsHeader':
      return source.kind === 'commit' ? { label: `Nuovo tag su ${short(source.sha)}…`, operation: { type: 'createTag', sha: source.sha } } : null
    case 'stashHeader': {
      if (source.kind !== 'files' || source.area === 'conflicted') return null
      const paths = source.files.flatMap((f) => (f.oldPath ? [f.oldPath, f.path] : [f.path]))
      return git(`Stash di ${fileLabel(source.files)}`, { kind: 'stashFiles', paths, untracked: source.area === 'untracked' })
    }
    case 'working':
      if (source.kind === 'commit') return commitOnHead(source.sha, alt, current)
      if (source.kind === 'stash') {
        const action = alt ? 'pop' : 'apply'
        return { label: `${alt ? 'Pop' : 'Apply'} di ${source.ref}`, operation: { type: 'stash', action, ref: source.ref } }
      }
      if (source.kind === 'commitFile') {
        const name = source.path.split('/').pop() ?? source.path
        return git(`Applica le modifiche di ${name}`, { kind: 'applyFileChanges', sha: source.sha, path: source.path })
      }
      return null
    case 'area':
      if (source.kind !== 'files') return null
      if (target.area === 'staged' && (source.area === 'unstaged' || source.area === 'untracked')) {
        return { label: `Stage di ${fileLabel(source.files)}`, operation: { type: 'stage', files: source.files } }
      }
      if (target.area === 'unstaged' && source.area === 'staged') {
        return { label: `Unstage di ${fileLabel(source.files)}`, operation: { type: 'unstage', files: source.files } }
      }
      return null
  }
}
```

Nota: un commit sulla riga "Modifiche locali" funziona anche con HEAD staccato. Sul branch corrente invece serve un branch corrente, e lo garantisce il controllo `target.name === current`.

Run: `npx vitest run test/unit/drop-actions.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/drag test/unit/drop-actions.test.ts
git commit -m "feat: tabella dei gesti del drag & drop (dropAction)"
```

---

### Task 4: Origini, destinazioni ed etichetta nell'interfaccia

**Files:**
- Create: `src/renderer/drag/drag.ts`, `src/renderer/components/DropHint.vue`
- Modify: `src/renderer/actions/branches.ts` (`performDrop`, `createTag` esportata)
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/components/RepoSidebar.vue`, `CommitList.vue`, `WorkingView.vue`, `CommitDetail.vue`
- Test: `test/e2e/drag.spec.ts`

**Interfaces:**
- Consumes: `dropAction` e i tipi (Task 3); `window.api.startDrag` (Task 2); le varianti di `RepoCommand` (Task 1).
- Produces:
  - `drag` (stato reattivo `{ source, hover, label, x, y }`), `resetDrag()`;
  - `dragSource(source)`, `fileDragSource(repo, source, item)`, `dropTarget(repo, target)`, che restituiscono oggetti da usare con `v-bind`;
  - `performDrop(repo, operation)`.

- [ ] **Step 1: Test E2E**

Crea `test/e2e/drag.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, makeRemotePair, makeRepo } from '../helpers/repo'
import { launch } from './launch'

const commitFile = (repo: string, file: string, content: string, message: string) => {
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', message)
}

/** Drag "interno" dei file: il drag nativo è disattivato, così parte quello HTML5 che Playwright sa simulare. */
async function internalFileDrags(app: Awaited<ReturnType<typeof launch>>['app']) {
  // Sul prototipo: vale per qualunque oggetto WebContents usi il main
  await app.evaluate(({ webContents }) => {
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as Electron.WebContents
    proto.startDrag = () => {
      throw new Error('drag nativo disattivato nel test')
    }
  })
}

const subjects = (repo: string) => git(repo, 'log', '--format=%s').trim().split('\n')
// Testo esatto: "a" non deve prendere anche "main" o "rebase-qui"
const branchItem = (page: Page, name: string) => page.getByTestId('branch-item').filter({ hasText: new RegExp(`^${name}$`) })

test('branch sul corrente: merge; con ⌥ rebase', async () => {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'feature/a')
  commitFile(repo, 'a.txt', 'a\n', 'su feature')
  git(repo, 'switch', '-q', 'main')
  commitFile(repo, 'm.txt', 'm\n', 'su main')
  git(repo, 'branch', 'rebase-qui', 'feature/a')
  const { app, page } = await launch([repo])
  await branchItem(page, 'a').dragTo(branchItem(page, 'main'))
  await expect.poll(() => subjects(repo)[0]).toBe("Merge branch 'feature/a'")

  git(repo, 'reset', '-q', '--hard', 'HEAD~1')
  await page.keyboard.down('Alt')
  await branchItem(page, 'rebase-qui').dragTo(branchItem(page, 'main'))
  await page.keyboard.up('Alt')
  await expect.poll(() => subjects(repo)).toEqual(['su main', 'su feature', 'commit 1'])
  await app.close()
})

test('commit sul tag: nuovo tag; commit sul corrente: cherry-pick', async () => {
  const repo = makeRepo(1)
  git(repo, 'switch', '-q', '-c', 'altro')
  commitFile(repo, 'x.txt', 'x\n', 'da prendere')
  git(repo, 'switch', '-q', 'main')
  const { app, page } = await launch([repo])
  const row = page.getByTestId('commit-row').filter({ hasText: 'da prendere' })
  await row.dragTo(page.getByTestId('tags-header'))
  await page.getByTestId('prompt-field-name').fill('v-drag')
  await page.getByTestId('prompt-ok').click()
  await expect(page.getByTestId('tag-item')).toHaveText('v-drag')

  await row.dragTo(branchItem(page, 'main'))
  await expect.poll(() => subjects(repo)[0]).toBe('da prendere')
  await app.close()
})

test('file fra le sezioni, su Stash, poi lo stash sulle modifiche locali', async () => {
  const repo = makeRepo(2)
  writeFileSync(join(repo, 'file1.txt'), 'uno\n')
  writeFileSync(join(repo, 'file2.txt'), 'due\n')
  const { app, page } = await launch([repo])
  await internalFileDrags(app)
  await page.getByTestId('working-row').click()
  const file1 = page.getByTestId('section-unstaged').getByTestId('working-file').filter({ hasText: 'file1.txt' })
  await file1.dragTo(page.getByTestId('commit-subject'))
  await expect(page.getByTestId('section-unstaged').getByTestId('working-file')).toHaveCount(2)

  await file1.dragTo(page.getByTestId('section-unstaged'))
  await expect(page.getByTestId('section-unstaged').getByTestId('working-file')).toHaveCount(2)

  await page.getByTestId('section-unstaged').getByTestId('working-file').filter({ hasText: 'file1.txt' }).dragTo(page.getByTestId('stash-header'))
  await expect(page.getByTestId('stash-item')).toHaveCount(1)
  expect(git(repo, 'status', '--porcelain').trim()).toBe('M file2.txt')

  await page.getByTestId('stash-item').dragTo(page.getByTestId('working-row'))
  await expect.poll(() => git(repo, 'diff', '--name-only').trim().split('\n')).toEqual(['file1.txt', 'file2.txt'])
  await app.close()
})

test('stage trascinando un file in "In stage"', async () => {
  const repo = makeRepo(1)
  writeFileSync(join(repo, 'file1.txt'), 'uno\n')
  writeFileSync(join(repo, 'nuovo.txt'), 'n\n')
  git(repo, 'add', 'nuovo.txt')
  const { app, page } = await launch([repo])
  await internalFileDrags(app)
  await page.getByTestId('working-row').click()
  await page.getByTestId('section-unstaged').getByTestId('working-file').dragTo(page.getByTestId('section-staged'))
  await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim().split('\n')).toEqual(['file1.txt', 'nuovo.txt'])
  await app.close()
})

test('branch locale su origin: push con upstream', async () => {
  const { bare, clone } = makeRemotePair()
  git(clone, 'branch', 'feature/push')
  const { app, page } = await launch([clone])
  await branchItem(page, 'push').dragTo(page.getByTestId('remote-item').filter({ hasText: 'origin' }))
  await expect.poll(() => git(bare, 'branch', '--list', 'feature/push').trim()).toBe('feature/push')
  expect(git(clone, 'rev-parse', '--abbrev-ref', 'feature/push@{u}').trim()).toBe('origin/feature/push')
  await app.close()
})

test('file di un commit verso altre app: startDrag riceve il contenuto di quel commit', async () => {
  const repo = makeRepo(1)
  commitFile(repo, 'file1.txt', 'versione due\n', 'seconda')
  const { app, page } = await launch([repo])
  await app.evaluate(({ webContents }) => {
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as Electron.WebContents
    proto.startDrag = (item) => {
      ;(globalThis as unknown as { dragged: string }).dragged = item.file
    }
  })
  await page.getByTestId('commit-row').filter({ hasText: 'commit 1' }).click()
  await page.getByTestId('file-row').dispatchEvent('dragstart')
  const dragged = await app.evaluate(() => (globalThis as unknown as { dragged?: string }).dragged)
  expect(dragged && readFileSync(dragged, 'utf8')).toBe('1\n')
  await app.close()
})
```

Note sui test:
- Trascinare `file1.txt` sull'oggetto del commit non deve fare niente: lì non c'è una destinazione.
- Trascinarlo sulla sua stessa sezione non è ammesso.

Run: `npx electron-vite build && npx playwright test test/e2e/drag.spec.ts`
Expected: FAIL, perché gli elementi non sono ancora trascinabili e mancano `tags-header`, `stash-header` e `remote-item`.

- [ ] **Step 2: `performDrop` in `actions/branches.ts`**

In `src/renderer/actions/branches.ts`:
- importa il tipo `DropOperation` da `../drag/drop-actions`;
- rendi esportata `createTag`: `export async function createTag(…)`;
- aggiungi:

```ts
/** Esegue l'operazione di un rilascio con le stesse funzioni dei menu (dialog, errori, aggiornamento). */
export async function performDrop(repo: Repo, op: DropOperation): Promise<unknown> {
  switch (op.type) {
    case 'git':
      return repo.git(op.command)
    case 'createBranch':
      return createBranch(repo, op.start)
    case 'createTag':
      return createTag(repo, op.sha)
    case 'stage':
      return repo.stage(op.files)
    case 'unstage':
      return repo.unstage(op.files)
    case 'stash':
      return repo.stashAction(op.action, op.ref)
  }
}
```

- [ ] **Step 3: `src/renderer/drag/drag.ts`**

```ts
import { reactive } from 'vue'
import { performDrop } from '../actions/branches'
import type { useRepoStore } from '../stores/repo'
import { type DragSource, dropAction, type DropTarget } from './drop-actions'

type Repo = ReturnType<typeof useRepoStore>
const MIME = 'application/x-merlino'

/** Trascinamento in corso. Durante il dragover Chromium non lascia leggere i dati, quindi l'origine sta qui. */
export const drag = reactive<{ source: DragSource | null; hover: string | null; label: string | null; x: number; y: number }>({
  source: null,
  hover: null,
  label: null,
  x: 0,
  y: 0,
})

export function resetDrag(): void {
  drag.source = null
  drag.hover = null
  drag.label = null
}

/** Elemento trascinabile dentro Merlino (drag HTML5). */
export function dragSource(source: DragSource) {
  return {
    draggable: 'true',
    onDragstart: (e: DragEvent) => {
      drag.source = source
      e.dataTransfer?.setData(MIME, '')
    },
    onDragend: resetDrag,
  }
}

/**
 * File trascinabile anche fuori da Merlino: se il main accetta il file, il drag diventa nativo (Electron startDrag) e nella
 * finestra arriva come un drag di file; altrimenti (file cancellato, troppo grande) resta un drag HTML5 interno.
 */
export function fileDragSource(repo: Repo, source: DragSource, item: { path: string; sha?: string }) {
  return {
    draggable: 'true',
    onDragstart: (e: DragEvent) => {
      drag.source = source
      if (window.api.startDrag(repo.root, item).ok) e.preventDefault()
      else e.dataTransfer?.setData(MIME, '')
    },
    onDragend: resetDrag,
  }
}

/** Destinazione: accetta il rilascio solo se dropAction lo ammette, mostra l'etichetta e al rilascio esegue. */
export function dropTarget(repo: Repo, target: DropTarget) {
  const key = JSON.stringify(target)
  const action = (e: DragEvent) =>
    drag.source ? dropAction(drag.source, target, e.altKey, { currentBranch: repo.info?.branch ?? null, remotes: repo.refs?.remotes ?? [] }) : null
  return {
    class: { 'drop-hover': drag.hover === key },
    onDragover: (e: DragEvent) => {
      const a = action(e)
      if (!a) return
      e.preventDefault()
      e.stopPropagation()
      drag.hover = key
      drag.label = a.label
      drag.x = e.clientX
      drag.y = e.clientY
    },
    onDragleave: () => {
      if (drag.hover !== key) return
      drag.hover = null
      drag.label = null
    },
    onDrop: (e: DragEvent) => {
      const a = action(e)
      resetDrag()
      if (!a) return
      e.preventDefault()
      e.stopPropagation()
      void performDrop(repo, a.operation)
    },
  }
}
```

- [ ] **Step 4: `DropHint.vue` e `App.vue`**

Crea `src/renderer/components/DropHint.vue`:

```vue
<script setup lang="ts">
import { drag } from '../drag/drag'
</script>

<template>
  <div v-if="drag.label" class="drop-hint" data-testid="drop-hint" :style="{ left: `${drag.x + 14}px`, top: `${drag.y + 16}px` }">
    {{ drag.label }}
  </div>
</template>

<style scoped>
.drop-hint { position: fixed; z-index: 50; padding: 3px 8px; font-size: 12px; white-space: nowrap; pointer-events: none; color: var(--accent-fg); background: var(--accent); border-radius: 5px; box-shadow: 0 4px 12px rgb(0 0 0 / 0.2); }
</style>
```

In `src/renderer/styles.css`, in fondo:

```css
/* Destinazione del drag & drop sotto il puntatore */
.drop-hover { outline: 2px solid var(--accent); outline-offset: -2px; background: var(--selected-bg) !important; }
```

In `src/renderer/App.vue`:
- importa `DropHint` e `{ drag, resetDrag }` da `./drag/drag`;
- sostituisci `onDrop` e aggiungi `onDragOver`:

```ts
function onDragOver(e: DragEvent) {
  e.preventDefault()
  // Un drag di Merlino fuori da una destinazione: cursore "vietato" invece di "apri come repository"
  if (drag.source && e.dataTransfer) e.dataTransfer.dropEffect = 'none'
}

function onDrop(e: DragEvent) {
  // Il drag nativo dei file di Merlino arriva come un drag di file: non va aperto come repository
  if (drag.source) {
    resetDrag()
    return
  }
  const file = e.dataTransfer?.files[0]
  if (file) void app.open(window.api.pathForFile(file))
}

// Il sistema non manda dragend dopo un drag nativo: il primo movimento del mouse dopo il rilascio azzera lo stato
const onMouseMove = () => {
  if (drag.source) resetDrag()
}
```

- in `onMounted` aggiungi `window.addEventListener('mousemove', onMouseMove)` e in `onUnmounted` `window.removeEventListener('mousemove', onMouseMove)`;
- nel template sostituisci `<div class="app" @dragover.prevent @drop.prevent="onDrop">` con `<div class="app" @dragover="onDragOver" @drop.prevent="onDrop">` e aggiungi `<DropHint />` prima di `</div>` finale.

- [ ] **Step 5: Sidebar**

In `src/renderer/components/RepoSidebar.vue`:
- importa `dragSource` e `dropTarget` da `../drag/drag` e i tipi `DragSource` e `DropTarget` da `../drag/drop-actions`;
- in `interface Row` aggiungi:

```ts
  /** Origine del drag & drop. */
  drag?: DragSource
  /** Destinazione del drag & drop. */
  drop?: DropTarget
```

- in `branchRows`, nell'oggetto di ogni branch, aggiungi `drag: { kind: 'branch', name: b.name }, drop: { kind: 'branch', name: b.name },`;
- in `remoteRows`:
  - nell'intestazione del remote, `header`, aggiungi `testid: 'remote-item', drop: { kind: 'remote', name: remote.name }`;
  - nei branch remoti aggiungi `drag: { kind: 'remoteBranch', remote: remote.name, name: b.name, fullName: b.fullName }, drop: { kind: 'remoteBranch', remote: remote.name, name: b.name, fullName: b.fullName },`;
- in `tagRows` aggiungi `drag: { kind: 'tag', name: t.name }`;
- in `sections` dai a ogni sezione la sua destinazione e il `testid` dell'intestazione:

```ts
const sections = computed(() => [
  { title: 'Branch', rows: branchRows.value, empty: 'Nessun branch', drop: { kind: 'branchesHeader' } as DropTarget, testid: 'branches-header' },
  { title: 'Remote', rows: remoteRows.value, empty: 'Nessun remote', drop: undefined, testid: 'remotes-header' },
  { title: 'Tag', rows: tagRows.value, empty: 'Nessun tag', drop: { kind: 'tagsHeader' } as DropTarget, testid: 'tags-header' },
])

/** Attributi di drag & drop di una riga o di un'intestazione. */
const dnd = (source?: DragSource, target?: DropTarget) => ({ ...(source ? dragSource(source) : {}), ...(target ? dropTarget(repo, target) : {}) })
```

- nel template:
  - l'intestazione delle sezioni diventa `<h3 v-bind="dnd(undefined, s.drop)" :data-testid="s.testid" @click="toggle(s.title)">{{ s.title }}</h3>`;
  - il `<li>` delle righe prende `v-bind="dnd(row.drag, row.drop)"`;
  - l'intestazione dello stash diventa `<h3 v-bind="dnd(undefined, { kind: 'stashHeader' })" data-testid="stash-header" @click="toggle('Stash')">`;
  - il `<li>` di ogni stash prende `v-bind="dnd({ kind: 'stash', ref: s.ref, sha: s.sha })"`.

- [ ] **Step 6: Storia, modifiche locali, dettaglio**

In `CommitList.vue`:
- importa `dragSource` e `dropTarget` da `../drag/drag`;
- sulla riga (`<div v-for="{ r, commit } in visible" …>`) aggiungi:

```html
        v-bind="r === 0 ? dropTarget(repo, { kind: 'working' }) : commit ? dragSource({ kind: 'commit', sha: commit.sha }) : {}"
```

In `WorkingView.vue`:
- importa `dropTarget` e `fileDragSource` da `../drag/drag`;
- la `<section v-for="section in sections" …>` prende:

```html
        v-bind="section.area === 'conflicted' ? {} : dropTarget(repo, { kind: 'area', area: section.area === 'staged' ? 'staged' : 'unstaged' })"
```

- il `<li>` dei file (`data-testid="working-file"`) prende:

```html
            v-bind="fileDragSource(repo, { kind: 'files', area: section.area, files: [f] }, { path: f.path })"
```

In `CommitDetail.vue`:
- importa `fileDragSource` da `../drag/drag`;
- il `<li>` dei file (`data-testid="file-row"`) prende:

```html
          v-bind="fileDragSource(repo, { kind: 'commitFile', sha: commit.sha, path: f.path }, { path: f.path, sha: commit.sha })"
```

- [ ] **Step 7: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: tutto verde, `drag.spec.ts` compreso.

```bash
git add src test
git commit -m "feat: drag & drop di branch, commit, file e stash, con etichetta dell'azione e ⌥ per l'alternativa"
```

---

### Task 5: Verifica

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm test && npm run test:e2e`, con la finestra nascosta. Expected: tutto verde.
- [ ] **Step 2:** Screenshot con la finestra nascosta, su un repo di prova generato al momento, con nomi fittizi (branch, remote, tag e autori inventati): una destinazione evidenziata e l'etichetta durante un drag simulato (`dragover` creato nella pagina), in tema chiaro e scuro.
- [ ] **Step 3:** Annota l'esito in fondo a questo piano, insieme alla prova a mano che resta all'utente: un file trascinato davvero nel Finder o in un editor. Commit.

**Note dall'esecuzione:**
- **Task 1–3**: come da piano; i test scritti prima del codice fallivano per i motivi attesi.
- **Task 4**: `draggable` vale `true` e non `'true'`: i tipi di Vue vogliono un booleano.
- **E2E** con la finestra nascosta: tutti e 6 i test di `drag.spec.ts` verdi alla prima esecuzione completa. Totale: 143 unit e di integrazione (più 1 saltato), 29 E2E.
- **Task 5**:
  - screenshot con la finestra nascosta su un repo di prova generato con nomi fittizi: `demo-backend`, `feature/login`, `feature/pagamenti`, autrici Ada Lovelace e Grace Hopper;
  - quattro casi: branch su `main` (merge, in chiaro), con ⌥ (rebase, in scuro), commit sull'intestazione Tag (nuovo tag) e branch su `origin` (push);
  - in tutti la destinazione è evidenziata e l'etichetta segue il cursore.
- **Prova a mano che resta all'utente**: trascinare davvero un file nel Finder o in un editor. Con la finestra nascosta i test arrivano fino alla chiamata a `startDrag`.
