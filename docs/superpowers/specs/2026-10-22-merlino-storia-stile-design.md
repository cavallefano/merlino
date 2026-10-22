# Merlino — Stile della storia — design

Data: 2026-10-22 · Stato: approvato in brainstorming, in revisione

## Obiettivo

Rendere la lista dei commit più chiara e pulita, allineandola al riferimento visivo indicato dall'utente: uno screenshot del commit list di Sublime Merge.

Sublime Merge resta solo un riferimento visivo, come nella spec v1: niente codice né asset suoi.

Questa spec sostituisce, per la lista dei commit, la regola della spec v1 sulle "righe ad altezza fissa (24 px)": le righe restano ad altezza fissa, ma diventano a due linee.

## Riga di un commit

L'altezza è fissa, circa 46 px (`ROW_HEIGHT`, regolabile).

| | Sinistra | Destra |
|---|---|---|
| **Linea 1** | Oggetto del commit, in grassetto solo per il commit di HEAD, cioè quello che ha un ref con `current` (il branch di HEAD o HEAD staccato) | Riquadro grigio con il numero di file cambiati; assente finché il dato non arriva o se è 0 |
| **Linea 2** | Autore, in corsivo grigio | Etichette dei ref se ce ne sono, altrimenti la data (`formatShortDate`) |

**Etichette**: sono piene, con i colori definiti come variabili CSS e una variante per il tema scuro.
- **Tag**: fondo giallo.
- **Branch locale**: fondo del colore d'accento dell'app; quello corrente in grassetto.
- **Branch remoto**: fondo grigio, con una barretta a sinistra del colore della corsia del commit.
- **HEAD staccato**: "HEAD" solo con il contorno.

Le etichette lunghe si accorciano con i puntini prima che si accorci l'autore.

**Selezione**: velatura chiara del colore d'accento, con il testo nel colore normale, al posto dello sfondo pieno di oggi. Vale per tutte le righe della lista, compresa quella delle modifiche locali.

## Grafo

Lo disegna `graph-draw.ts` su canvas, solo per le righe visibili, come oggi.

- **Corsie**: larghe 12 px (`LANE_WIDTH`), con le linee da 1,5 px. Il colore resta quello della corsia.
- **Nodi**: quadrati da 8 px.
  - Commit normale: quadrato pieno del colore della corsia.
  - Merge (più di un genitore): quadrato vuoto, cioè fondo della lista con bordo del colore della corsia.
  - Riga delle modifiche locali: quadrato pieno.
- **Cambi di corsia**: curva breve accanto al nodo che li genera, e il resto del segmento è verticale.
  - Se la colonna di partenza del segmento è quella del nodo della riga sopra (un genitore che si apre in una nuova corsia, o un merge che raggiunge una corsia esistente), la curva è subito sotto quel nodo.
  - Altrimenti (una corsia che confluisce nel nodo della riga), la curva è subito sopra il nodo di arrivo.
- **Segmenti tratteggiati**: con `dashed`, sono disegnati a trattini nel colore della corsia.
- **Testo a scaletta**: in ogni riga il testo parte dopo la colonna più a destra fra il nodo della riga, i segmenti che arrivano alla riga e quelli che partono verso la riga successiva. Il limite resta `MAX_LANES`. Durante una ricerca non c'è grafo e il testo parte dal margine.

Il pallino dentro alcuni nodi del riferimento non viene replicato.

## Riga delle modifiche locali

È sempre la prima riga di `CommitList`, anche durante una ricerca e anche se il repo non ha commit. Sostituisce la riga che oggi è in `HistoryView` e compare solo quando ci sono modifiche.

| | Sinistra | Destra |
|---|---|---|
| **Linea 1** | Stato: "Nessuna modifica", oppure i conteggi non nulli separati da " · ": "N in stage", "N modificati", "N non tracciati", "N in conflitto" | Riquadro con il numero totale di file cambiati, se è più di 0 |
| **Linea 2** | "Modifiche locali", in corsivo grigio | — |

- **Clic**: apre la vista delle modifiche locali (`repo.selectWorking()`) anche quando non ci sono modifiche, per esempio per un amend.
- **Grafo**: nodo nella corsia 0 e linea tratteggiata fino al commit di HEAD. Durante una ricerca, o in un repo senza commit, non c'è linea.
- **Test**: `data-testid` resta `working-row`; il riquadro ha `working-files`.

### Tratteggio nel layout (`graph.ts`)

- `History.reload` passa a `layoutGraph`, prima dei commit, uno pseudo-commit `{ sha: '', parents: [HEAD], dashed: true }`, senza genitori se HEAD non esiste. Poi scarta la sua riga, che è sempre `{ lane: 0, up: [] }`.
- `layoutGraph` accetta per ogni commit un `dashed` facoltativo. Le corsie aperte da quel commit sono tratteggiate e restano tali finché esistono. I loro segmenti escono con `dashed: true`.
- `GraphEdge` prende un campo facoltativo `dashed?: boolean`.

Effetto voluto: la linea di HEAD occupa sempre la corsia 0. L'instradamento attraverso gli altri branch lo fa l'algoritmo delle corsie, senza casi speciali nel disegno.

### Indici

Lo pseudo-commit non è fra i commit di `History`, quindi `total`, `page`, `selectedIndex` e le altre funzioni dello store restano per indice di commit.

`CommitList` lavora per indice di riga, cioè indice di commit + 1:
- la riga 0 è quella delle modifiche locali;
- il grafo della riga 0 è sempre `{ lane: 0, up: [] }`;
- i segmenti verso la riga 0 sono quelli del primo commit.

## Numero di file cambiati

- **IPC**: `historyFileCounts(root, start, count): Promise<Result<Record<string, number>>>`, da SHA a numero di file. `start` e `count` sono validati come per `historyPage`. Il renderer non passa SHA.
- **Main** (`History.fileCounts`):
  - prende gli SHA dei commit `[start, start + count)` della storia caricata e scarta quelli già in cache;
  - esegue `log --stdin --no-walk=unsorted --format=%x00%H --shortstat --diff-merges=first-parent` con gli SHA su stdin;
  - per i merge conta i file rispetto al primo genitore, come il diff del dettaglio;
  - un commit senza riga di shortstat vale 0;
  - la cache è una `Map` per SHA che non si svuota, perché il numero di file di uno SHA non cambia.
- **Parser**: `parseFileCounts(out)` divide per NUL; in ogni blocco la prima riga è lo SHA e il numero viene da `/(\d+) files? changed/`.
- **Renderer**: dopo ogni pagina caricata da `ensureRows`, lo store chiede i conteggi di quella pagina e li mette in una mappa con un contatore che fa ridisegnare. Gli errori sono ignorati: il riquadro semplicemente non compare.
- **Prestazioni**: `historyLoad` non cambia, quindi l'apertura della storia resta entro i criteri della v1 (prima schermata sotto i 2 s su 100k commit). I conteggi arrivano dopo, una chiamata git per blocco da 500 commit.

## Test

- **Unit**:
  - `layoutGraph` con lo pseudo-commit tratteggiato:
    - la linea arriva a HEAD nella corsia 0 e tutti i suoi segmenti hanno `dashed`;
    - HEAD non è il primo commit della lista (c'è un branch più recente);
    - repo senza HEAD;
    - i casi esistenti restano invariati;
  - `parseFileCounts`: commit normale, commit senza shortstat, `1 file changed`.
- **Integrazione**: `History.fileCounts` su un repo vero, con un commit normale, un merge con modifiche (conta sul primo genitore) e un merge senza modifiche (0). Una seconda chiamata usa la cache e non esegue git.
- **E2E**:
  - `working.spec.ts`: dove oggi si aspetta la riga nascosta o "(1)", si aspetta "Nessuna modifica" e il numero in `working-files`;
  - `history.spec.ts`: la prima riga è quella delle modifiche locali con "Nessuna modifica"; il riquadro dei file di un commit noto mostra il numero giusto.
- **A mano**: screenshot su una copia di `demo-backend` da confrontare con il riferimento, in tema chiaro e scuro.
