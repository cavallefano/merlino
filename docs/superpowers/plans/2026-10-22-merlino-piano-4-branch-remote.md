# Merlino — Piano 4: Branch e remote — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le operazioni di collaborazione:
- **Sidebar**: branch locali raggruppati in cartelle, con commit avanti/indietro; remote e i loro branch; tag; stash.
- **Branch**: crea, checkout (anche da un branch remoto, creando quello locale che lo segue), rinomina, elimina, imposta o toglie l'upstream.
- **Integrazione**: merge, rebase, cherry-pick, revert, reset soft/mixed/hard, rebase interattivo (pick, reword, edit, squash, fixup, drop, riordino).
- **Tag**: crea (leggero o annotato), elimina, push.
- **Remote**: clone, fetch, pull e push con avanzamento; push forzato con `--force-with-lease`; aggiungi e rimuovi remote.
- **Operazioni in corso**: barra con Continua, Salta e Annulla; file in conflitto con "Segna come risolto" e "Apri nell'editor".

**Architecture:**
- **Main**:
  - comandi git in coda di scrittura;
  - menu contestuali nativi (`Menu.popup`) richiesti dal renderer via IPC, che restituiscono l'id della voce scelta;
  - l'avanzamento di fetch, pull e push arriva da stderr (`--progress`) come evento `repo:progress`.
- **Rebase interattivo**: la lista delle operazioni viene scritta in un file temporaneo. `GIT_SEQUENCE_EDITOR` è `cp '<file>'` e i reword diventano righe `exec git commit --amend -F <file>`, quindi non serve uno script editor.
- **Renderer**: dialog di input nostro (`PromptDialog`), perché Electron non implementa `window.prompt`; le conferme usano `window.confirm`.

Spec: parte 4. Parte dal branch `feature/piano-3-modifiche-locali`.

## Global Constraints

Valgono quelle dei piani 1–3, più:
- **Editor**: ogni processo git parte con `GIT_EDITOR=true`, così un editor non resta mai aperto in attesa (messaggi di merge, `--continue`, squash).
- **Nomi di branch, tag e remote**: mai con `-` iniziale; devono superare `git check-ref-format`. Gli URL non iniziano con `-` e nel clone vanno dopo `--`.
- **Conferma** obbligatoria per: reset hard, eliminazione di un branch non mergiato (`-D` solo dopo conferma), eliminazione di un branch remoto, push forzato.
- **Messaggi d'errore dedicati** per i casi noti: credenziali mancanti, push rifiutato, `index.lock`, conflitti, branch divergenti in pull.
- **Rebase interattivo**: solo su intervalli senza merge; il main controlla che gli SHA ricevuti siano esattamente quelli dell'intervallo.

## Task 1: Runner, errori comprensibili, ref e operazioni in corso

- `GitRunner`:
  - `GIT_EDITOR=true` nell'ambiente di base;
  - `RunOptions.onProgress?: (line: string) => void`, chiamata con l'ultima riga di stderr (righe separate da `\r` o `\n`);
  - `GitError.info.message` passa da `explain(stderr)`.
- `explain(stderr): string`, in `src/main/git/errors.ts`, per i casi:
  - autenticazione (`could not read Username`, `Authentication failed`, `terminal prompts disabled`, `Permission denied (publickey)`);
  - push rifiutato (`[rejected]`, `fetch first`, `non-fast-forward`);
  - `index.lock`;
  - conflitti (`CONFLICT`);
  - pull divergente (`divergent branches`);
  - altrimenti la prima riga.
- `readRefs(runner): Promise<RefsSnapshot>`, in `src/main/git/refs.ts`:
  - comandi: `for-each-ref --format=%(refname)%00%(objectname)%00%(*objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(HEAD) refs/heads refs/remotes refs/tags` più `config --get-regexp ^remote\..*\.url$` (exit 1 se non ci sono remote);
  - tipi: `BranchInfo { name, sha, upstream, ahead, behind, gone, current }`, `RemoteInfo { name, url, branches: { name, fullName, sha }[] }`, `TagInfo { name, sha }`;
  - `origin/HEAD` è escluso.
- `WorkingStatus.operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null`. Si ricava dai file in `rev-parse --absolute-git-dir`: `MERGE_HEAD`, `rebase-merge/`, `rebase-apply/`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`.
- `treeRows(names, collapsed)` in `src/renderer/history/branch-tree.ts`: righe cartella e branch con profondità, per la sidebar.
- Test:
  - unit: `explain`, `parseRefs`, `treeRows`, `parseStatus` (con `operation: null`);
  - integrazione: `onProgress` (git fetch da un remote locale), `readRefs` con remote locale e tag annotato, `operation` durante un merge con conflitto.

## Task 2: Operazioni su branch, tag, remote e storia (main)

`src/main/git/branches.ts`, tutte con coda di scrittura:

| Funzione | Comando |
|---|---|
| `createBranch(r, name, start, checkout)` | `branch -- name start` / `switch -c name start` |
| `checkoutBranch(r, name)` | `switch name` |
| `checkoutRemote(r, fullName)` | `switch --track fullName`; se il branch locale esiste già: `switch <locale>` |
| `checkoutDetached(r, sha)` | `switch --detach sha` |
| `renameBranch(r, old, new)` | `branch -m old new` |
| `deleteBranch(r, name, force)` | `branch -d|-D name` |
| `deleteRemoteBranch(r, remote, name)` | `push remote --delete name` |
| `setUpstream(r, branch, upstream \| null)` | `branch --set-upstream-to=upstream branch` / `branch --unset-upstream branch` |
| `merge(r, ref, noFf)` | `merge [--no-ff] ref` |
| `rebase(r, onto)` | `rebase onto` |
| `cherryPick(r, sha, isMerge)` | `cherry-pick [-m 1] sha` |
| `revert(r, sha, isMerge)` | `revert --no-edit [-m 1] sha` |
| `reset(r, sha, mode)` | `reset --soft|--mixed|--hard sha` |
| `continueOperation(r, op)` / `skipOperation` / `abortOperation` | `<op> --continue|--skip|--abort` |
| `createTag(r, name, sha, message)` | `tag name sha` / `tag -a name -m message sha` |
| `deleteTag(r, name)` | `tag -d name` |
| `pushTag(r, remote, name)` | `push remote refs/tags/name` |
| `fetch(r, onProgress)` | `fetch --all --prune --progress` |
| `pull(r, mode, onProgress)` | `pull --progress [--rebase|--no-rebase]` (mode `config` usa la config) |
| `push(r, remote, force, onProgress)` | se il branch ha upstream: `push --progress [--force-with-lease]`, altrimenti `push --progress -u remote HEAD` |
| `addRemote(r, name, url)` / `removeRemote(r, name)` | `remote add name url` / `remote remove name` |
| `clone(gitPath, url, parent, onProgress)` | `clone --progress -- url <parent>/<nome dall'URL>`; restituisce la cartella |
| `rebaseRange(r, sha)` | `log --format=LOG_FORMAT -z sha^..HEAD` (`--root` per il primo commit); errore se ci sono merge |
| `rebaseInteractive(r, sha, steps)` | file todo + `GIT_SEQUENCE_EDITOR=cp '<todo>'` + `rebase -i sha^` (o `--root`) |

Test di integrazione (`test/integration/branches.test.ts`):
- remote bare locale come `origin`, con push, fetch, pull e upstream;
- branch: crea, checkout, rinomina, elimina (normale e forzato);
- checkout di un branch remoto con tracking;
- merge `--no-ff` e merge con conflitto (operazione `merge`, poi abort);
- rebase, cherry-pick, revert e reset hard;
- tag annotato e push;
- clone;
- rebase interattivo con squash, reword, drop e riordino;
- intervallo con merge rifiutato.

## Task 3: IPC

- `Api` ha un'operazione per ogni funzione del Task 2, più:
  - `refs(root)`;
  - `rebaseRange(root, sha)`;
  - `contextMenu(items: MenuItem[]): Promise<string | null>`, dove `MenuItem = { id: string; label: string; enabled?: boolean } | { separator: true }`;
  - `openPath(root, path)`, che apre il file con `shell.openPath`;
  - `pickFolder()`, per scegliere la cartella del clone;
  - l'evento `onProgress(cb: (root: string, line: string) => void)`.
- Validazione: nomi di ref con `-` iniziale rifiutati; SHA come nel piano 2; enum per mode, op e action; URL senza `-` iniziale; `steps` con action nell'enum.
- Test E2E (`test/e2e/branches-api.spec.ts`): `refs`, `createBranch` e `checkoutBranch` via API, e un nome di branch `--evil` rifiutato.

## Task 4: Interfaccia

- **PromptDialog**: dialog modale generico. `app.prompt({ title, fields, confirm })` → `Record<string, string | boolean> | null`; i campi sono text o checkbox. `data-testid`: `prompt-dialog`, `prompt-field-<key>`, `prompt-ok`, `prompt-cancel`.
- **RepoSidebar**:
  - sezioni Branch (albero con cartelle da `treeRows`; ↑n ↓n; corrente in grassetto), Remote (per ogni remote i suoi branch), Tag, Stash;
  - clic: seleziona il commit; doppio clic su un branch: checkout; clic destro: menu contestuale nativo;
  - `data-testid`: `branch-item`, `remote-branch-item`, `tag-item`.
  - Voci di menu:
    - branch: Checkout, Merge nel branch corrente, Rebase del corrente su questo, Rinomina…, Imposta upstream…, Elimina;
    - branch remoto: Checkout, Merge nel corrente, Elimina dal remote;
    - tag: Push, Elimina;
    - remote: Rimuovi.
- **CommitList**: clic destro su un commit apre il menu Crea branch qui…, Crea tag qui…, Checkout (HEAD staccato), Cherry-pick, Revert, Reset qui (soft/mixed/hard), Rebase interattivo da qui…, Copia SHA.
- **Toolbar** di RepoView: Fetch, Pull (↓behind) e Push (↑ahead), con l'ultima riga di avanzamento mentre lavorano. `data-testid`: `fetch`, `pull`, `push` e `progress`.
- **OperationBanner**, sopra i pannelli quando `status.operation` non è null: "Merge in corso" e così via, con Continua, Salta (solo rebase, cherry-pick e revert) e Annulla. `data-testid`: `operation-banner`, `op-continue`, `op-skip` e `op-abort`.
- **Conflitti**: in WorkingView, nella sezione In conflitto, si aggiunge il pulsante "Apri" (`open-file`).
- **RebaseDialog**: righe dall'ultimo commit (in alto) a quello scelto.
  - Ogni riga ha un `<select>` (pick, reword, edit, squash, fixup, drop), i pulsanti ↑ e ↓, e un campo per il messaggio se reword.
  - Avvia o Annulla. Squash e fixup non sono ammessi sulla prima riga applicata, cioè la più vecchia.
  - `data-testid`: `rebase-dialog`, `rebase-row`, `rebase-action`, `rebase-message`, `rebase-start`.
- **WelcomeScreen**: "Clona repository…" (URL nel dialog, poi scelta della cartella).
- **Azioni della palette**: `remote.fetch`, `remote.pull`, `remote.pullRebase`, `remote.pullMerge`, `remote.push`, `remote.forcePush`, `remote.add`, `branch.create`, `repo.clone`, `operation.continue` e `operation.abort`.
- Test E2E (`test/e2e/branches.spec.ts`):
  1. crea un branch dal menu del commit, checkout dalla sidebar, merge con conflitto, poi barra, risoluzione, "Segna come risolto" e Continua;
  2. push su un remote bare e pull da un secondo clone;
  3. tag creato dal menu;
  4. rebase interattivo (squash di due commit e reword).

## Task 5: Verifica

- `npm run lint && npm run typecheck && npm test && npm run test:e2e`.
- Su una copia locale di `demo-backend` che ha come remote un bare locale, mai il server reale perché l'utente non è presente, con screenshot di sidebar, menu e toolbar:
  - fetch e push verso il bare;
  - creazione e checkout di un branch, poi eliminazione.
