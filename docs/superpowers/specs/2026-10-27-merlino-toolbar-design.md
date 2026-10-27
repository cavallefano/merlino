# Merlino — Barra superiore ed errori visibili — design

Data: 2026-10-27 · Stato: approvato in brainstorming

## Obiettivo

Una sola barra in cima, compatta e riconoscibile come quella di Tower, ed errori che non passano inosservati. Il riferimento è la toolbar di Tower: integrata nel titolo della finestra, icone raggruppate, nome del repository con un sottotitolo.

## Oggi

- **Due barre**: la barra dei tab (tab, `+`, pulsante "Comandi ⇧⌘P") e sotto la toolbar del repository (nome, branch, Git Flow, Fetch, Pull, Push, layout, aggiorna) con pulsanti di testo.
- **Barra del titolo nativa** sopra a tutto, su ogni sistema.
- **Errori**:
  - `app.error`: una riga rossa sotto i tab, chiudibile; nelle impostazioni una riga dentro la pagina;
  - `repo.error`: solo testo rosso sotto la toolbar, senza sfondo e senza ×; lo scrivono sia le operazioni lanciate dall'utente sia i caricamenti in background.

## Finestra

- **macOS**: `titleBarStyle: 'hiddenInset'`. La toolbar è la barra del titolo e i semafori stanno a sinistra, dentro la toolbar. Lo sfondo della toolbar trascina la finestra (`-webkit-app-region: drag`); pulsanti e titolo no (`no-drag`).
- **Windows e Linux**: la barra del titolo nativa resta e la toolbar sta sotto. L'overlay dei controlli (`titleBarOverlay`) andrebbe tenuto allineato al tema chiaro/scuro: rimandato.
- Il renderer sa se è su macOS da `window.api.platform === 'darwin'`, come il registro delle azioni; solo lì la toolbar lascia 78px a sinistra per i semafori.

## Toolbar

Un componente `AppToolbar.vue` in `App.vue`, sempre presente dopo il controllo di git: anche nella schermata di benvenuto, nelle impostazioni e in "git mancante", così su macOS la finestra si trascina e i semafori non coprono il contenuto.

- **Altezza** 52px, sfondo `--bg-alt`, bordo sotto.
- **Titolo**, a sinistra:
  - con un repository attivo e fuori dalle impostazioni: il nome in grassetto e sotto, più piccolo, il branch (`repo-branch`, testo invariato: branch, HEAD staccato o nessun commit);
  - durante un'operazione, dopo il branch, il progresso in grigio con i puntini (`progress`);
  - altrimenti solo "Merlino".
- **Pulsanti**: solo icona (Lucide, in `AppIcon`), `title` con il nome e la scorciatoia se c'è, `aria-label` col nome. Gruppi a pillola: sfondo leggero, angoli arrotondati, divisori sottili fra i pulsanti dello stesso gruppo.

| Gruppo | Pulsante | `data-testid` | Esegue | Attivo quando |
|---|---|---|---|---|
| 1 | Comandi (bacchetta) | `palette-button` | `palette.open` | sempre |
| 2 | Fetch | `fetch` | `remote.fetch` | nessuna operazione in corso |
| 2 | Pull, badge con i commit dietro | `pull` | `remote.pull` | come sopra |
| 2 | Push, badge con i commit avanti | `push` | `remote.push` | come sopra |
| 3 | Stash | `stash-button` | `stash.push` | ci sono modifiche |
| 3 | Pop | `pop-button` | `stash.pop` | c'è almeno uno stash |
| 4 | Nuovo branch | `branch-button` | `branch.create` | nessuna operazione in corso |
| 4 | Git Flow | `flow-button` | il menu di oggi (`flowMenu`) | come sopra |
| destra | Cerca | `search-button` | `history.search` | un repository attivo |
| destra | Layout | `layout-toggle` | `layout.toggle` | sempre |
| destra | Aggiorna | `repo-refresh` | `repo.refresh` | un repository attivo |

- I gruppi 2–4 compaiono solo con un repository attivo e fuori dalle impostazioni; senza repository resta solo la bacchetta.
- Lo stato "attivo" viene dal `when` delle azioni: il registro espone `available(id)`, così pulsante, palette e scorciatoie non divergono.
- Il badge è un numerino in alto a destra dell'icona, nel colore d'accento; manca se il numero è 0.
- **Non ci sono**: Merge (Merlino non ha un dialog per scegliere il branch), avanti/indietro, il `>>` per l'overflow (alla larghezza minima, 800px, i pulsanti ci stanno).

## Tab

- La barra dei tab va sotto la toolbar e compare solo con due o più repository aperti, come i tab di macOS in Tower.
- Il pulsante "Comandi" esce dalla barra dei tab (ora è la bacchetta). Il `+` resta.
- Con un solo repository se ne apre un altro con ⌘O, il menu File o la palette.

## Errori

### Dialog

Un componente `ErrorDialog.vue` in `App.vue`, aperto quando `app.error` non è vuoto:

- icona di avviso e titolo "Operazione non riuscita" / "Operation failed";
- il messaggio in un riquadro monospace, con scroll se è lungo e il testo selezionabile;
- **Mostra output** apre il pannello Output e chiude il dialog; **OK** (predefinito, anche Invio ed Esc) chiude.

Ci arrivano gli errori di ciò che l'utente ha chiesto:

- `repo.run()`: ogni operazione git (fetch, pull, push, merge, rebase, branch, tag, stash…), stage, unstage, discard, commit, patch;
- il push senza remote (`push.noRemote`), l'apertura di un file nell'editor;
- quello che scrive già `app.error`: apertura e clone di un repository, preferenze, template.

Prende il posto della riga rossa sotto i tab e di quella nella pagina delle impostazioni.

### Banda

`repo.error` resta per i caricamenti in background (refresh dal watcher, stato, storia, diff, albero, piano del rebase). Diventa una banda sotto la toolbar con sfondo `--danger-bg`, testo `--danger`, icona di avviso e × per chiuderla (`repo-error`). Una nuova operazione la azzera, come oggi.

### Dove resta com'è

- Gli errori dentro i dialog: crea pull request, Git Flow, rebase, account.
- La banda delle pull request con "Aggiorna token".
- Il dialog "Crea pull request" mostra il push fallito al suo interno: prende il messaggio da `app.error` e lo azzera, così non si apre un dialog sopra l'altro.

Titolo per singola operazione ("Push non riuscito"): rimandato, servirebbero 27 messaggi per lingua.

## Testi

Nuove chiavi in `src/shared/i18n` (italiano e inglese): titolo del dialog, "Mostra output", nomi dei pulsanti che non hanno già un'azione con titolo. Gli altri nomi vengono dai titoli delle azioni.

## Test

- **e2e**:
  - con un solo repository la barra dei tab non c'è; aprendone un secondo compare;
  - un push verso un remote che lo rifiuta apre il dialog con il messaggio di git; "Mostra output" apre il pannello;
  - i test che usano `palette-button`, `fetch`, `pull`, `push`, `flow-button`, `layout-toggle`, `repo-refresh`, `repo-branch` passano senza modifiche;
  - quelli che si aspettano un tab con un solo repository (`repo.spec.ts`, `branches.spec.ts`, `actions.spec.ts`) controllano il nome nella toolbar o il numero di tab da due in su.
- **unit**: `available(id)` del registro.
- Gli screenshot del README si rigenerano con `readme-screenshots.spec.ts`.
