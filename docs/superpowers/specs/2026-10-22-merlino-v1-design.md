# Merlino v1 — design

Data: 2026-10-22 · Stato: approvato in brainstorming, in revisione

## Obiettivo

Client Git desktop del team, per macOS, Windows e Linux, che riproduce le funzionalità di Sublime Merge e diventa la base per i flussi del team.

**Clean room**: Sublime Merge è solo un riferimento funzionale. Non si usa né si guarda il suo codice, il suo binario o i suoi asset (icone, temi, file di configurazione). Nome, grafica e codice sono nostri.

## Roadmap a sotto-progetti

Ogni parte ha il suo ciclo spec → piano → implementazione. Questa spec copre la **v1 = parti 1–4**.

| # | Parte | Release |
|---|---|---|
| 1 | Base: app, tab, layer git, command palette, scorciatoie | v1 |
| 2 | Storia: grafo, dettaglio commit, diff, ricerca | v1 |
| 3 | Modifiche locali: staging per file, blocco o riga, commit, stash | v1 |
| 4 | Branch e remote: checkout, merge, rebase (anche interattivo), cherry-pick, revert, reset, tag, clone, fetch/pull/push | v1 |
| 5 | Merge tool a 3 vie | dopo |
| 6 | Blame, storia di un file, vista ad albero | dopo |
| 7 | Submodule, worktree, git flow, comandi custom, preferenze, temi | dopo |
| 8 | Funzioni del team: Merge Request su GitLab, feature/ da develop, integrazioni | dopo |

## Funzionalità della v1

### 1. Base
- Aprire un repo (dialog o trascinando una cartella), creare un repo (`git init`), lista dei repo recenti.
- Più repo aperti in tab, riaperti al riavvio.
- Command palette (`⌘⇧P` / `Ctrl+Shift+P`), barra dei menu, scorciatoie da tastiera.
- Pannello di output con i comandi git eseguiti e il loro stderr.
- All'avvio controlla che `git` ≥ 2.35 sia presente. Il percorso si può impostare a mano (salvato in un file JSON nella cartella dati dell'app).
- Tema chiaro/scuro che segue il sistema operativo.

### 2. Storia
- Grafo di tutti i ref, in ordine di data (`--date-order`), con etichette per branch, tag e HEAD.
- Fluido su repo con 100.000+ commit.
- Dettaglio del commit: autore, committer, date, genitori (cliccabili), messaggio, file cambiati con righe +/−.
- Diff per file, unificato o affiancato, con evidenziazione della sintassi e delle parole cambiate nella riga, e un'opzione per ignorare gli spazi (`-w`).
- Ricerca con prefissi `author:`, `path:`, `message:`, `contents:`. Testo senza prefisso equivale a `message:`.
- Copia di SHA e messaggio.

### 3. Modifiche locali
- Riga "Modifiche locali" in cima alla storia, con le sezioni Non tracciati, Modificati e In stage.
- Stage, unstage e scarto (discard) per file, per blocco di modifiche e per singola riga. Stage e unstage di tutto in un click.
- "Aggiungi a .gitignore" per i file non tracciati.
- Messaggio di commit con oggetto e corpo e guide a 50 e 72 colonne; commit con `⌘↩` / `Ctrl+Enter`.
- Amend, con il messaggio precedente precaricato.
- Hook e firma GPG/SSH si comportano secondo la config git dell'utente; non c'è un'interfaccia dedicata.
- Stash: crea (con messaggio, opzionalmente includendo i non tracciati), lista nella sidebar, diff dello stash, apply, pop, drop.

### 4. Branch e remote
- Sidebar con branch locali (raggruppati in cartelle per `/`, con commit avanti/indietro), remote e i loro branch, tag, stash.
- Branch: crea (da HEAD o da un commit), checkout (un branch remoto crea quello locale che lo segue), rinomina, elimina (chiede conferma per forzare se non è mergiato), imposta o rimuovi upstream.
- Merge (fast-forward o `--no-ff`), rebase su un altro branch, cherry-pick, revert.
- Reset soft, mixed o hard; l'hard chiede conferma.
- Rebase interattivo dal menu di un commit: riordina, squash, fixup, reword, drop, edit.
- Tag leggeri o annotati: crea, elimina, push.
- Remote: clone, fetch (tutti i remote, `--prune`), pull (segue `pull.rebase` della config), push.
  - Al primo push imposta l'upstream con `-u`.
  - Il push forzato usa `--force-with-lease` e chiede conferma.
  - Si possono aggiungere e rimuovere remote.
  - L'avanzamento viene letto da stderr.
- Merge, rebase o cherry-pick in corso:
  - una barra in alto con Continua, Salta (solo per il rebase) e Annulla;
  - la lista dei file in conflitto, con "Segna come risolto" e "Apri nell'editor esterno".

### Fuori dalla v1 (scelte esplicite)
- Merge tool a 3 vie (parte 5).
- Richiesta di password o passphrase SSH dentro l'app: si usano ssh-agent, Keychain e i credential helper.
- Git incluso nell'app.
- Aggiornamenti automatici.
- Firma del codice e notarizzazione.
- libgit2 o isomorphic-git: ignorerebbero hook, LFS e config dell'utente.

## Architettura

Electron + Vue 3 + TypeScript + Pinia, build con electron-vite.

```
Renderer (Vue 3 + Pinia)  ──window.api.* (contextBridge)──▶  Preload  ──ipc invoke/eventi──▶  Main (Node)
```

- **Main**
  - Una `RepoSession` per ogni repo aperto, che contiene:
    - `GitRunner`: lancia `git` con `spawn` senza shell, con `GIT_TERMINAL_PROMPT=0` e `LC_ALL=C`;
    - una coda delle scritture: una sola operazione di scrittura alla volta per repo, mentre le letture vanno in parallelo;
    - un watcher (`@parcel/watcher`) su `.git/` e sulla cartella di lavoro, che esclude `.git/objects` e `node_modules` e manda l'evento `repo:changed` dopo 300 ms senza nuovi cambiamenti;
    - un ricaricamento anche quando la finestra torna in primo piano.
  - Parser dall'output git ai tipi condivisi.
  - Calcolo della disposizione del grafo.
- **Preload**: espone solo le operazioni definite in `shared/ipc.ts`. Opzioni: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Renderer**
  - Non lancia mai processi e chiede operazioni per nome, mai argomenti git liberi.
  - Uno store Pinia per ogni tab.
- **`shared/ipc.ts`**: in un unico punto ci sono le operazioni IPC e i tipi (`Commit`, `Ref`, `FileStatus`, `FileDiff`, `Hunk`, `GraphRow`, `GitError`…), usati da main e renderer.

### Struttura

```
merlino/
  src/shared/        ipc.ts, types.ts
  src/main/          index.ts, repo-session.ts, watcher.ts, sequence-editor.ts
  src/main/git/      runner.ts, graph.ts, parsers/{log,status,diff,refs,stash}.ts, patch.ts
  src/preload/       index.ts
  src/renderer/      main.ts, App.vue, stores/, actions/registry.ts, components/
  test/              fixtures/, unit/, integration/, e2e/
```

## Layer git

| Area | Comando |
|---|---|
| Storia | `log --all --date-order -z --format=%H%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%s%x00%D` (aggiunge `--author`, `--grep`, `-G` e `-- <path>` per la ricerca) |
| Corpo del commit | `show -s --format=%B <sha>` |
| Ref | `for-each-ref --format=%(refname)%00%(objectname)%00%(*objectname)%00%(upstream:short)%00%(upstream:track)%00%(HEAD) refs/heads refs/remotes refs/tags` (`%(*objectname)`: il commit a cui punta un tag annotato) |
| Stato | `status --porcelain=v2 -z --branch --untracked-files=all` |
| Diff locale | `diff --no-color --no-ext-diff -U3 [--cached] [-w] -- <path>` |
| Diff di un commit | `show --format= --no-color --no-ext-diff --diff-merges=first-parent -M -U3 [-w] <sha>` (per i merge: confronto col primo genitore) |
| Stage/unstage/scarto per blocco o riga | patch generata da `patch.ts` → `apply --cached --recount -` / `apply --cached --reverse --recount -` / `apply --reverse --recount -` |
| Commit | `commit -F -` [`--amend`] |
| Stash | `stash push [-u] -m`, `stash list -z --format=%gd%x00%H%x00%s`, `stash apply/pop/drop` |
| Branch e remote | `switch`, `branch`, `merge`, `rebase`, `cherry-pick`, `revert`, `reset`, `tag`, `clone`, `fetch`, `pull`, `push` con `--progress` |
| Rebase interattivo | `rebase -i` con `GIT_SEQUENCE_EDITOR` che punta a `sequence-editor.ts` (Electron avviato con `ELECTRON_RUN_AS_NODE=1`). Lo script sostituisce la lista delle operazioni con quella decisa nell'interfaccia, presa da un file temporaneo. Per reword ed edit si usa `GIT_EDITOR` allo stesso modo. |
| Operazioni in corso | presenza di `.git/MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge/` e `rebase-apply/` |

### Disposizione del grafo (`graph.ts`)

Il calcolo è incrementale per blocchi da 2000 commit e mantiene tra un blocco e l'altro l'array delle colonne attive, ognuna con lo SHA che si aspetta.

Per ogni commit:
1. Prende la prima colonna che lo aspetta; se nessuna lo aspetta, apre una colonna nuova.
2. Il primo genitore prosegue nella stessa colonna.
3. Ogni altro genitore usa la colonna dove è già atteso oppure una nuova.
4. Le colonne che non aspettano più nulla si chiudono.

Risultato per ogni riga: `GraphRow { lane, color, edges[] }`, dove ogni elemento di `edges` indica la colonna di partenza e quella di arrivo verso la riga successiva. Il colore è legato alla colonna.

## Interfaccia

- **Layout**: tab dei repo, toolbar (branch corrente, fetch/pull/push, ricerca, palette), sidebar a sinistra, storia al centro, dettaglio a destra.
- **CommitList**: righe ad altezza fissa (24 px) disegnate solo se visibili; la colonna del grafo è un `<canvas>` che disegna solo le righe visibili usando i `GraphRow`.
- **DiffView**: componente nostro, senza Monaco.
  - Righe disegnate solo se visibili, evidenziazione con highlight.js, parole cambiate con jsdiff (`diffWordsWithSpace` sulle coppie di righe tolte/aggiunte).
  - Si selezionano blocchi di modifiche o righe per stage, unstage e scarto.
  - Sopra i 5 MB o le 20.000 righe mostra "Diff troppo grande — mostra comunque"; per i file binari solo "binario cambiato" e la differenza di dimensione.
- **Registro delle azioni** (`actions/registry.ts`): ogni azione ha `{ id, title, keys?, when(ctx), run(ctx) }`. Command palette, menu contestuali, scorciatoie e barra dei menu leggono da qui. È anche il punto in cui le parti 7 e 8 aggiungeranno le loro voci.

### Flusso dei dati
1. Un'azione chiama `window.api.<operazione>`; il main la mette in coda ed esegue git.
2. Se va bene si apre `repo:changed`; se fallisce, `GitError { args, exitCode, stderr }` finisce nel pannello di output con un messaggio dedicato per i casi noti: conflitto, push rifiutato, `index.lock` già presente, credenziali mancanti.
3. A ogni `repo:changed` lo store ricarica sempre stato e ref. Ricarica la storia solo se cambia l'hash di HEAD e dei ref.
4. Il commit selezionato è salvato per SHA, quindi resta selezionato dopo il ricaricamento.
5. Niente aggiornamenti ottimistici: lo stato vero lo dice git.

## Errori

- Se git manca o è troppo vecchio, una schermata dedicata spiega come installarlo o come indicare il percorso.
- Gli errori non gestiti del main vanno in `userData/logs/main.log` e l'app resta aperta; quelli del renderer vanno nel pannello di output.
- Ogni operazione distruttiva chiede conferma: scarto delle modifiche, reset hard, eliminazione di un branch non mergiato, push forzato, drop di uno stash.

## Test

- **Unit** (Vitest):
  - parser su output git reali salvati in `test/fixtures/`: nomi con spazi o unicode, rinomine, binari, merge, conflitti, CRLF;
  - `graph.ts` su storie inventate (merge, merge con più genitori, branch senza antenati comuni, molte colonne), verificando che le colonne non si sovrappongano;
  - `patch.ts` per lo staging per riga.
- **Integrazione** (Vitest, git vero su repo temporanei):
  - ogni operazione della v1, di cui si verifica lo stato risultante;
  - staging per riga: dopo lo stage, `git diff --cached` contiene esattamente le righe scelte, e lo stesso per l'unstage;
  - rebase interattivo con squash e reword.
- **E2E** (Playwright su Electron): un solo test che apre il repo, mette in stage, fa il commit e controlla che compaia nella storia.
- **CI** (GitLab, Linux): lint, type-check, unit e integrazione. macOS e Windows si provano a mano con una checklist prima di ogni release.

## Distribuzione

- `electron-builder`: `.dmg` per macOS (arm64 e x64), installer NSIS per Windows (x64), AppImage e `.deb` per Linux (x64).
- I pacchetti si caricano nelle GitLab Releases.
- Le build non sono firmate:
  - macOS la prima volta si apre con click destro → Apri;
  - Windows mostra l'avviso SmartScreen.

## Criteri di completamento della v1

- Tutte le funzionalità delle parti 1–4 elencate sopra funzionano su macOS, Windows e Linux.
- Su un repo da 100.000 commit, la prima schermata della storia appare in meno di 2 secondi e lo scroll resta fluido.
- Test unit, di integrazione ed E2E verdi; checklist manuale superata su tutti e tre i sistemi.
- Il team riesce a fare una settimana di lavoro quotidiano senza aprire Sublime Merge, tranne che per i conflitti complessi (parte 5).
