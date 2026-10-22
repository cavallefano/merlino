# Merlino — Drag & drop — design

Data: 2026-10-22 · Stato: approvato in brainstorming, in revisione

## Obiettivo

Trascinare branch, commit, file e stash per fare le operazioni più comuni, come in Tower (il riferimento scelto dall'utente). Ci sono anche il trascinamento dei file verso altre app e lo stage fra le sezioni delle modifiche.

Il riordino dei commit resta escluso: c'è già nel rebase interattivo.

## Ricerca

| Gesto | Tower | GitKraken | Fork | GitHub Desktop |
|---|---|---|---|---|
| Branch sul branch corrente → merge (con un modificatore: rebase) | ✓ | ✓ (menu merge/rebase/rebase interattivo) | ✓ (popover merge/rebase) | — |
| Branch su un remote → push o pubblica (con un modificatore: track); al contrario → pull | ✓ | ✓ (su un branch remoto) | — | — |
| Commit sul corrente o sulla Working Copy → cherry-pick (con un modificatore: revert) | ✓ | — | — | ✓ |
| Commit o branch sull'intestazione Branches → nuovo branch; commit su Tags → nuovo tag | ✓ | — | — | — |
| File modificati su Stashes → stash di quei file; stash (o un suo file) sulla Working Copy → applica | ✓ | — | — | — |
| File fra stage e non stage | — | — | — | — (SourceTree sì) |

**Fonti**:
- Tower: [drag & drop](https://git-tower.com/features/drag-and-drop), [consigli per Mac](https://www.git-tower.com/help/guides/faq-and-tips/tips-and-tricks/drag-drop/mac), [funzioni git](https://www.git-tower.com/docs/ai/git-features/);
- GitKraken: [branching e merge](https://help.gitkraken.com/gitkraken-client/branching-and-merging), [push e pull](https://help.gitkraken.com/working-with/pushing-and-pulling/);
- Fork: [Fork per Windows 1.48](https://www.git-fork.com/blog/posts/forkwin-1.48/).

## Interazione

- **Il rilascio esegue subito**, come in Tower, senza menu. Ogni gesto ha un'azione principale; <kbd>⌥</kbd> (Alt su Windows e Linux) tenuto al momento del rilascio dà l'alternativa.
- **Durante il trascinamento**:
  - la destinazione sotto il puntatore si evidenzia;
  - un'etichetta accanto al cursore (`DropHint`) dice cosa succederà e si aggiorna se si preme o si rilascia <kbd>⌥</kbd>;
  - dove il rilascio non è ammesso il cursore è "vietato" e non c'è etichetta.
- **Conferme**: restano quelle già previste (push forzato e le altre). Merge, rebase, cherry-pick e revert non chiedono conferma, come dai menu.

### Gesti

| Origine | Destinazione | Azione | Con <kbd>⌥</kbd> |
|---|---|---|---|
| Branch locale (non corrente) o branch remoto | Branch corrente nella sidebar | Merge nel corrente (`merge`) | Rebase del corrente su quello (`rebase`) |
| Branch remoto | Branch locale non corrente | Aggiornamento fast-forward senza checkout (`fastForward`) | Upstream del locale = quel remoto (`setUpstream`) |
| Branch locale | Intestazione di un remote (es. "origin") | Push e pubblicazione con upstream sul branch omonimo (`pushBranch`) | Upstream = `<remote>/<nome>`, se esiste (`setUpstream`) |
| Branch locale | Branch di un remote | Push su quel branch, con upstream (`pushBranch`) | Upstream = quel branch remoto (`setUpstream`) |
| Branch locale, branch remoto o tag | Intestazione "Branch" | Nuovo branch da lì (dialog del nome, come "Crea branch qui…") | — |
| Commit | Intestazione "Branch" | Nuovo branch sul commit (dialog) | — |
| Commit | Intestazione "Tag" | Nuovo tag sul commit (dialog di "Crea tag qui…") | — |
| Commit | Branch corrente o riga "Modifiche locali" | Cherry-pick | Revert |
| File di "Modificati" o "Non tracciati" | Sezione "In stage" | Stage | — |
| File di "In stage" | Sezione "Modificati" | Unstage | — |
| File delle modifiche (qualsiasi sezione tranne "In conflitto") | Intestazione "Stash" | Stash solo di quei file (`stashFiles`; con `-u` se ce ne sono di non tracciati) | — |
| Stash | Riga "Modifiche locali" | Apply | Pop |
| File di un commit o di uno stash (elenco del dettaglio) | Riga "Modifiche locali" | Applica le modifiche di quel file (`applyFileChanges`) | — |
| File delle modifiche o di un commit | Fuori dalla finestra | Il file; per un commit, il suo contenuto in quel commit | — |

**Non ammessi** (cursore "vietato"):
- un branch su sé stesso, o il branch corrente sul corrente;
- un commit su un branch non corrente;
- file su un branch o su un remote;
- un tag su un remote;
- uno stash fuori dalla riga "Modifiche locali";
- file di un commit cancellati in quel commit, verso altre app.

**Esclusi**:
- branch locale su un altro branch locale non corrente (sarebbe un checkout implicito);
- branch sulle Pull Request (le MR sono della parte 8);
- più commit insieme (la storia seleziona un solo commit);
- spostamento e riordino dei commit.

## Architettura

### Renderer

- **`src/renderer/drag/drop-actions.ts`** (puro, senza DOM):
  - `type DragSource` =
    - `{ kind: 'branch'; name }`
    - `{ kind: 'remoteBranch'; remote; name; fullName }`
    - `{ kind: 'tag'; name }`
    - `{ kind: 'commit'; sha }`
    - `{ kind: 'files'; area; files: WorkingFile[] }`
    - `{ kind: 'stash'; ref; sha }`
    - `{ kind: 'commitFile'; sha; path }`
  - `type DropTarget` =
    - `{ kind: 'branch'; name }` (locale)
    - `{ kind: 'remote'; name }`
    - `{ kind: 'remoteBranch'; remote; name; fullName }`
    - `{ kind: 'branchesHeader' }`, `{ kind: 'tagsHeader' }`, `{ kind: 'stashHeader' }`
    - `{ kind: 'working' }`
    - `{ kind: 'area'; area: 'staged' | 'unstaged' }`
  - `type DropOperation` =
    - `{ type: 'git'; command: RepoCommand }`
    - `{ type: 'createBranch'; start: string }`, `{ type: 'createTag'; sha }`
    - `{ type: 'stage' | 'unstage'; files }`
    - `{ type: 'stashFiles'; files }`
    - `{ type: 'stash'; action: 'apply' | 'pop'; ref }`
  - `dropAction(source, target, alt, context: { currentBranch: string | null; remotes: RemoteInfo[] }): { label: string; operation: DropOperation } | null`, cioè la tabella qui sopra.
- **`src/renderer/drag/drag.ts`**: lo stato condiviso `{ source, target, alt, x, y }` (durante il `dragover` Chromium non lascia leggere i dati trascinati) e due helper:
  - `dragSource(source)`: gli attributi e i gestori per `draggable`;
  - `dropTarget(target)`: `dragover` (con `preventDefault` solo se `dropAction` non è `null`), `dragleave` e `drop`.
- **`DropHint.vue`**: l'etichetta che segue il cursore, montata in `App.vue`.
- **Esecuzione** (`performDrop(repo, operation)` in `actions/branches.ts`): riusa i dialog `createBranch` e `createTag`, `repo.git`, `repo.stage`, `repo.unstage` e `repo.stashAction`. Gli stash di file usano `repo.git({ kind: 'stashFiles' })`.
- **Origini e destinazioni**:
  - `RepoSidebar`: righe dei branch, dei remote e dei loro branch, dei tag e degli stash, più le intestazioni Branch, Tag e Stash;
  - `CommitList`: righe dei commit come origine, riga "Modifiche locali" come destinazione;
  - `WorkingView`: file come origine, sezioni come destinazione;
  - `CommitDetail`: file come origine.
- **Verso altre app**: i file (modifiche e dettaglio del commit) al `dragstart` chiamano `window.api.startDrag(root, item)`, sincrona. L'`item` è `{ path }` per un file delle modifiche e `{ sha, path }` per un file di un commit.
  - Se il main accetta, con `preventDefault()` il drag diventa nativo (Electron `startDrag`). Vale anche fuori da Merlino e nella finestra arriva come un drag di file, che le destinazioni gestiscono come gli altri.
  - Se non accetta (file cancellato, oltre i 50 MB), resta un drag HTML5 interno.
  - Fuori dall'app Electron consente solo la copia (`NSDragOperationCopy`), quindi il Finder non può spostare il file del repo.
- **Fine del drag nativo**: il sistema non manda `dragend`. Lo stato si azzera al primo `mousemove` dopo il rilascio; durante un drag non ne arrivano. `App.vue` ignora i rilasci di file mentre c'è un drag di Merlino in corso, invece di aprirli come repo.

### Main e operazioni git

Le nuove varianti di `RepoCommand` vengono validate in `validate.ts` come le altre: nomi con `refName`, SHA con `sha`, percorsi con `relPath`.

| Variante | Comando |
|---|---|
| `pushBranch { remote, branch, remoteBranch }` | `push --progress -u <remote> refs/heads/<branch>:refs/heads/<remoteBranch>` |
| `fastForward { branch, from }` | `fetch . <from>:refs/heads/<branch>`. Se viene rifiutato, il messaggio è "<branch> non si può aggiornare in fast-forward da <from>: fai checkout e merge". |
| `stashFiles { paths, untracked }` | `stash push [-u] -- <percorsi>` |
| `applyFileChanges { sha, path }` | `show --format= --binary --diff-merges=first-parent <sha> -- <path>` → `apply -`, solo nella cartella di lavoro. Senza `--3way`, che metterebbe le modifiche in stage e potrebbe lasciare conflitti. Se la patch non si applica, l'errore lo dice; se non ci sono modifiche, errore "nessuna modifica da applicare". |

**`startDrag`**:
- IPC sincrona (`ipcMain.on`, `event.returnValue`): il drag nativo deve partire mentre è in corso il `dragstart`.
  - Un file delle modifiche: `<root>/<path>`, se esiste.
  - Un file di un commit: `git cat-file blob <sha>:<path>` (sincrono, al massimo 50 MB), scritto in `os.tmpdir()/merlino-drag-<casuale>/<nome del file>`.
  - Poi `event.sender.startDrag({ file, icon })`, con un'icona PNG piccola inclusa come data URL.
- La cartella temporanea resta finché il sistema non la pulisce: il file serve all'app di destinazione anche dopo il rilascio.

## Test

Finestra sempre nascosta (`MERLINO_E2E=1`).

- **Unit**: `dropAction` riga per riga della tabella, con e senza <kbd>⌥</kbd>, più tutti i casi non ammessi; validazione delle nuove varianti di `RepoCommand`.
- **Integrazione** (`test/integration/drag.test.ts`):
  - `pushBranch` su un bare, anche con un nome diverso, con l'upstream impostato;
  - `fastForward` riuscito, e rifiutato col messaggio dedicato;
  - `stashFiles` di un solo file, con gli altri che restano modificati;
  - `applyFileChanges` da un commit e da uno stash, solo per quel file;
  - preparazione del file temporaneo di un commit (contenuto di quel commit).
- **E2E** (`test/e2e/drag.spec.ts`, con `locator.dragTo` di Playwright; se con la finestra nascosta non funziona, si creano gli eventi di drag nella pagina):
  1. branch sul corrente: merge; con <kbd>⌥</kbd> tenuto: rebase;
  2. commit su "Tag": dialog, poi tag creato; commit sul corrente: cherry-pick;
  3. file da "Modificati" a "In stage"; file su "Stash", poi lo stash su "Modifiche locali";
  4. branch locale su "origin": il branch arriva sul bare con l'upstream;
  5. `dragstart` su un file di un commit: `startDrag`, sostituito nel main, riceve un file temporaneo con il contenuto di quel commit.
- **Limite noto**: il rilascio vero in un'altra app (Finder, editor) non si può verificare senza finestre visibili. Resta una prova a mano dell'utente.
