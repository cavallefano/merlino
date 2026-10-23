# Merlino — Pannelli ridimensionabili, layout e popup del diff — design

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

- Ridimensionare i pannelli trascinando dei divisori.
- Passare dal layout orizzontale a quello verticale per lista e dettaglio.
- Vedere il diff in un popup grande e ridimensionabile.

## Oggi

- **Vista del repo** (`RepoView.vue`): griglia `220px | 11fr | 9fr` con sidebar, lista (commit o PR) e dettaglio (dettaglio del commit, modifiche locali o dettaglio della PR).
- **Dentro il dettaglio**, altezze massime fisse:
  - dettaglio del commit: intestazione al massimo al 35%, file al massimo al 25%, poi il diff;
  - modifiche locali: il riquadro del commit, file al massimo al 35%, poi il diff;
  - dettaglio della PR, scheda Changes: file al massimo al 30%, poi il diff.
- **Diff**: `DiffView` per commit e PR (affiancato o unificato), `StageDiff` per le modifiche locali (stage, unstage e scarto di blocchi e righe; niente vista affiancata).

## Approccio

- **Divisori**: un componente `Splitter.vue` fatto in casa, con pointer events, che aggiorna le misure della griglia o delle altezze. Nessuna dipendenza nuova.
- **Popup**: un `<dialog>` modale come gli altri dialog di Merlino, ridimensionabile con `resize: both`.
- **Scartati**:
  - la libreria `splitpanes`: porta markup e CSS suoi da adattare a griglia e vista verticale, una dipendenza per poco codice;
  - una finestra separata di Electron per il diff: richiede una seconda pagina, IPC per selezione e stage e la gestione di finestre e focus nei test.

## Pannelli ridimensionabili

- **Dove**:

| Divisore | Misura salvata | Predefinita | Limiti |
|---|---|---|---|
| sidebar \| resto | larghezza della sidebar, px | 220 | 160–400 |
| lista \| dettaglio, orizzontale | frazione della lista sulla larghezza disponibile | 0.55 | ognuno almeno 240 px |
| lista \| dettaglio, verticale | frazione della lista sull'altezza disponibile | 0.4 | ognuno almeno 120 px |
| file \| diff nel dettaglio del commit | altezza della lista dei file, px | 140 | da 48 px a lasciare almeno 120 px al diff |
| file \| diff nelle modifiche locali | altezza della lista dei file, px | 180 | come sopra |
| file \| diff nel dettaglio della PR | altezza della lista dei file, px | 160 | come sopra |

  Lista e dettaglio usano una frazione, così seguono il ridimensionamento della finestra. L'intestazione del commit e il riquadro del commit restano come oggi (altezza dal contenuto).
- **Aspetto**: una fascia di presa di 5 px con una linea di 1 px (`--border`); al passaggio e durante il trascinamento la linea prende il colore `--accent`. Cursore `col-resize` o `row-resize`.
- **Trascinamento**: `pointerdown` con `setPointerCapture`, la misura segue il puntatore entro i limiti. Durante il trascinamento la selezione del testo è disattivata.
- **Doppio clic**: la misura torna alla predefinita.
- **Tastiera**: `role="separator"`, `aria-orientation`, `tabindex="0"`; le frecce spostano di 16 px (o di 0.02 per le frazioni).
- **Memoria**: orientamento e misure valgono per tutta l'app (tutte le schede e i repo) e restano dopo il riavvio. Stanno nel `localStorage` alla chiave `merlino.layout`, come la scelta del remote delle PR. Un valore mancante, non numerico o fuori dai limiti torna al predefinito.

## Layout orizzontale e verticale

- **Orizzontale** (predefinito): come oggi, lista a sinistra e dettaglio a destra.
- **Verticale**: lista sopra e dettaglio sotto, a tutta larghezza; la sidebar resta a sinistra.
- Vale per la cronologia (con dettaglio del commit o modifiche locali) e per le pull request.
- **Comandi**:
  - un pulsante nella barra, accanto a ↻ (`data-testid="layout-toggle"`), con un'icona che mostra il layout in cui si passa e un'etichetta accessibile;
  - l'azione `layout.toggle` nel registro, quindi nella palette e nel menu View ("Toggle Panel Layout" / "Cambia layout dei pannelli").

## Popup del diff

- **Apertura**:
  - un pulsante ⤢ nella barra del diff del dettaglio del commit, delle modifiche locali e del dettaglio della PR (`data-testid="diff-popup"`);
  - doppio clic su un file nelle tre liste: lo seleziona e apre il popup.
- **Dialog**:
  - `<dialog>` modale (`showModal`), `data-testid="diff-dialog"`;
  - la prima volta occupa l'85% della finestra, poi ricorda la sua misura (`merlino.layout`, con gli altri valori), comunque entro la finestra;
  - si ridimensiona dall'angolo in basso a destra (`resize: both`), minimo 480 × 300;
  - all'apertura è centrato (posizione calcolata in px, `margin: 0`), così durante il ridimensionamento cresce verso destra e verso il basso e l'angolo segue il puntatore;
  - la misura si salva alla chiusura.
- **Barra**:
  - percorso del file;
  - ↑ e ↓ (file precedente e successivo) con la posizione, es. "2/5";
  - affiancato o unificato (solo per commit e PR, come nel pannello);
  - ignora gli spazi;
  - chiudi.
- **Tasti**: ↑ e ↓ cambiano file, Esc chiude.
- **Contenuto**: lo stesso del pannello. `DiffView` per commit e PR (con "Show anyway" per i diff troppo grandi), `StageDiff` per le modifiche locali, quindi con stage, unstage e scarto di blocchi e righe.
- **Selezione condivisa**: il popup mostra il file selezionato nel pannello e cambiare file nel popup cambia anche quello del pannello. Alla chiusura il pannello mostra l'ultimo file visto.
  - Commit e PR: l'ordine è quello della lista dei file.
  - Modifiche locali: l'ordine è quello delle sezioni (conflitti, in stage, non in stage, non tracciati).
  - Se il file esce dalla sua sezione (es. dopo lo stage di tutto il file), lo store passa già al primo file disponibile e il popup lo segue. Se non restano modifiche, il popup si chiude.
  - Il popup si chiude anche se cambia ciò che mostra: un altro commit, la vista delle modifiche locali al posto del commit, un'altra PR o un'altra scheda della PR.

## Architettura

- **`src/renderer/layout.ts`**:
  - funzioni pure: `clamp(value, min, max)`, `readLayout(text: string | null): Layout` (lettura tollerante, i valori non validi tornano ai predefiniti), `step(list, current, delta)` (file precedente o successivo, senza giro);
  - tipo `Layout { orientation: 'horizontal' | 'vertical'; sidebar; list; listVertical; commitFiles; workingFiles; prFiles; dialog: { width; height } | null }`;
  - uno store Pinia `useLayoutStore` con lo stato reattivo, `toggle()`, `reset(key)` e il salvataggio nel `localStorage` a ogni modifica.
- **`Splitter.vue`**: props `orientation: 'col' | 'row'`, `modelValue`, `min`, `max`, `defaultValue`, `scale` (1 per i px, oppure la dimensione del contenitore per le frazioni). Emette `update:modelValue`.
- **`RepoView.vue`**: la griglia (colonne in orizzontale; in verticale due colonne e la colonna destra divisa in righe) si calcola dal layout; i divisori stanno fra le aree.
- **`CommitDetail.vue`, `WorkingView.vue`, `PullRequestDetail.vue`**: la lista dei file ha l'altezza del layout, poi un divisore; il pulsante ⤢ nella barra del diff; il doppio clic sui file.
- **`DiffDialog.vue`**: aperto da `repo.diffDialog` (`'commit' | 'working' | 'pr' | null`), montato in `RepoView.vue` come gli altri dialog.
- **Azione** `layout.toggle` nel registro e nel menu View di `src/main/menu.ts`.
- **Testi** in inglese e in italiano.

## Test

- **Unit** (`test/unit/layout.test.ts`):
  - `clamp`;
  - `readLayout` con `null`, JSON non valido, valori mancanti, non numerici o fuori dai limiti;
  - `step` agli estremi e con il file corrente assente.
- **E2E** (finestra nascosta, `test/e2e/layout.spec.ts`):
  - trascinare il divisore della sidebar cambia la sua larghezza, e la misura resta dopo il reload; il doppio clic la riporta a 220 px;
  - con il layout verticale il dettaglio sta sotto la lista, e la scelta resta dopo il reload;
  - il popup si apre dal pulsante ⤢ e con il doppio clic su un file; ↓ passa al file successivo (anche nel pannello); Esc chiude;
  - nelle modifiche locali, lo stage di un blocco dal popup lo sposta in stage.

## Fuori da questa parte

- Spostare il popup trascinandolo.
- Più popup aperti insieme.
- Misure diverse per ogni repo.
- Pannelli richiudibili (sidebar nascosta).
