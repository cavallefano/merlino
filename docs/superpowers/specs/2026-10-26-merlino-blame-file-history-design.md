# Merlino — Blame, storia del file e albero dei file — design

Data: 2026-10-26 · Stato: approvato in brainstorming

## Obiettivo

Capire chi ha cambiato cosa in un file e quando, e guardare il repository com'era a un commit qualsiasi. È la voce della roadmap "Blame, file history and a tree view of the repository". Il riferimento è Tower.

## Riferimento: Tower

- **Blame**: dal menu contestuale di un file. Si apre in una finestra a parte: per ogni blocco di righe autore, data e commit; un clic sulla colonna grigia mostra il commit. Una barra permette di passare ad altre revisioni.
- **File History**: dal menu contestuale di un file, oppure dalla ricerca della storia con la categoria "History > File". La lista mostra solo i commit che hanno toccato il file.
- **Historic File Trees**: nel dettaglio del commit il pulsante "Tree" mostra tutti i file del progetto com'erano a quel commit. Dal menu di un file: apri, ripristina, esporta.

## Menu dei file

- **Dove**: clic destro su un file:
  - nei file cambiati del dettaglio del commit;
  - nell'albero dei file;
  - nelle modifiche locali.
- **Voci**: **File History** / **Storia del file** e **Blame**.
- **Quando sono attive**:

| File | Storia del file | Blame |
|---|---|---|
| Cambiato in un commit | sì | no se cancellato (`D`) |
| Nell'albero | sì | sì, non per i submodule |
| Modifiche locali | no se non tracciato (`?`) | no se non tracciato, aggiunto (`A`) o cancellato (`D`) |

- **Palette**: "Show File History" / "Mostra storia del file" e "Blame File" / "Blame del file", sul file selezionato nel pannello di destra (diff del commit, albero o modifiche locali), con le stesse regole.
- **Pulsante Blame** nella barra sopra il diff del commit, sopra il contenuto dell'albero e sopra il diff delle modifiche locali, con le stesse regole.

## Storia del file

- **Storia del file** porta alla pagina della storia con la ricerca `path:"<percorso>"` (la ricerca `path:` c'è già) e seleziona il commit più recente della lista.
  - Il filtro si vede nella casella di ricerca, che si aggiorna anche quando la ricerca cambia dallo store; `Esc` lo toglie, come oggi.
  - Come in ogni ricerca, la lista non ha il grafo.
- **File preselezionato**: quando la ricerca contiene filtri `path:`, scegliendo un commit il dettaglio seleziona il primo file cambiato che corrisponde a un filtro (lo stesso percorso o un file dentro la cartella), invece del primo della lista. Vale anche per le ricerche scritte a mano.
- **Rinomine**: non si seguono (niente `--follow`).

## Blame

### Apertura e revisione

- **Popup** grande e ridimensionabile, come quello del diff, con la stessa misura (`layout.dialog`). `Esc` lo chiude.
- **Revisione**:
  - da un file di un commit o dell'albero: il file a quel commit (`git blame --porcelain <sha> -- <path>`);
  - dalle modifiche locali: il file sul disco (`git blame --porcelain -- <path>`). Le righe non ancora nel commit hanno lo SHA di zeri e si leggono "Not committed yet" / "Non ancora nel commit".

### Contenuto

- **Barra in alto**:
  - **←** per tornare alla revisione precedente;
  - il percorso;
  - la revisione: SHA breve, oppure "Local version" / "Versione locale";
  - la casella "Ignore whitespace" (`-w`), che parte dal valore del diff;
  - la chiusura.
- **Righe**: colonna del commit (230 px), numero di riga, codice con l'evidenziazione della sintassi (come nel diff, riga per riga).
- **Blocchi**: le righe consecutive dello stesso commit formano un blocco, separato dal precedente da una linea sottile.
  - La prima riga di un blocco mostra SHA breve, autore e data breve.
  - Al passaggio del mouse sulla colonna compaiono l'oggetto, l'autore e la data.
- **File binario**: "Binary file", come nel diff.

### Commit scelto

- Un clic sulla colonna di un blocco sceglie il suo commit: tutte le sue righe nel file prendono lo sfondo della selezione.
- In fondo al popup compare una barra con oggetto, autore con l'email, data e SHA completo, e due pulsanti:
  - **Show Commit** / **Mostra commit**: chiude il popup, va alla storia e seleziona il commit (non per le righe non ancora nel commit);
  - **Blame Before This Commit** / **Blame prima di questo commit**: rifà il blame sul commit e sul percorso indicati da `previous` nel porcelain, cioè il genitore e il nome che il file aveva lì. È disattivato senza `previous` (il commit che ha creato il file).
- **←** torna alla revisione da cui si è arrivati.

## Albero dei file

### Modalità del dettaglio

- Nel dettaglio del commit, sopra la lista dei file, un selettore **Changes** / **Modifiche** | **All Files** / **Tutti i file**, come "Changeset | Tree" in Tower.
- La scelta resta cambiando commit, finché la scheda resta aperta.

### Albero

- **Ordine**: prima le cartelle, poi i file, in ordine alfabetico.
- **Caricamento**: il contenuto di una cartella arriva quando la si apre, con `git ls-tree -z -l <sha> -- <cartella>/` (la radice senza percorso). Così regge anche i repository con centinaia di migliaia di file.
- **Righe**: freccia nelle cartelle, icona di cartella o di file, nome.
  - I file cambiati in quel commit mostrano la lettera dello stato (M, A, R…), con i colori della lista dei file.
  - I submodule hanno l'icona del file e il contenuto `Subproject commit <sha>`.
- **Cambiando commit**:
  - le cartelle aperte restano aperte, se esistono ancora;
  - il file scelto resta, se c'è ancora; altrimenti il pannello sotto resta vuoto.

### Contenuto

- Selezionando un file, sotto la lista compare il suo contenuto a quel commit, con i numeri di riga e l'evidenziazione della sintassi.
- La barra sopra il contenuto mostra il percorso e il pulsante Blame.
- **Limiti**, gli stessi del diff:
  - binario: un NUL nei primi 8000 caratteri, e il pannello dice "Binary file";
  - oltre 5 MB o 20 000 righe: "File too large." / "File troppo grande." e "Show anyway".

## Architettura

- **Ricerca**: `src/main/git/search.ts` passa in `src/shared/search.ts`, così il renderer legge i filtri `path:` con lo stesso `searchArgs`.
- **Main**:
  - `src/main/git/blame.ts`: `unquotePath` (i nomi tra virgolette in stile C del porcelain), `parseBlame`, `readBlame(runner, sha | null, path, ignoreWhitespace)`;
  - `src/main/git/tree.ts`: `parseTree`, `readTree(runner, sha, dir)`, `readFileContent(runner, sha, path, force)` (`null` se il file non c'è a quel commit).
- **IPC** (`src/shared/ipc.ts`, validati nel main):
  - `blame(root, sha | null, path, ignoreWhitespace)`;
  - `treeList(root, sha, dir)`, dove `dir` è `''` per la radice;
  - `fileContent(root, sha, path, force)`.
- **Tipi** (`src/shared/types.ts`):
  - `BlameCommit`: sha, autore, email, data, oggetto ed eventuale `previous` (sha e percorso);
  - `BlameResult`: `{ path, binary, commits, lines }`;
  - `TreeEntry`: `{ name, path, kind: 'folder' | 'file' | 'submodule' }`;
  - `FileContent`: `{ binary, tooLarge, text }`.
- **Renderer**:
  - store `repo`: `detailMode`, lo stato dell'albero (cartelle caricate e aperte, file scelto, contenuto), `blame` (il file da aprire nel popup), `showFileHistory`, la preselezione del file in `select`;
  - `src/renderer/actions/files.ts`: i file su cui si agisce (commit, albero, modifiche locali), il menu contestuale e le azioni della palette;
  - componenti nuovi: `FileTree.vue`, `FileContentView.vue`, `BlameDialog.vue`; l'icona `file` in `AppIcon.vue` (Lucide).
- **Nessuna dipendenza nuova.** Testi in inglese e in italiano.

## Test

- **Unit**:
  - `unquotePath` e `parseBlame`, con blocchi, righe non nel commit e `previous` con nomi tra virgolette;
  - `parseTree`;
  - i filtri `path:` dal percorso nuovo di `searchArgs`.
- **Integrazione** (git vero):
  - blame a un commit, del file sul disco con una riga nuova, dopo una rinomina (`previous` con il vecchio nome), di un file binario;
  - albero della radice e di una cartella, ordinato;
  - contenuto di un file di testo, binario, troppo grande, mancante.
- **E2E** (finestra nascosta):
  - albero: cartelle, contenuto del file, contenuto che cambia con il commit, ritorno alle modifiche;
  - blame dal menu di un file: blocchi, commit scelto, Blame prima di questo commit, ←, Mostra commit;
  - storia del file dal menu: la ricerca, i commit, il file preselezionato;
  - blame dalle modifiche locali con la riga non ancora nel commit.

## Fuori da questa parte

- Seguire le rinomine nella storia del file (`--follow`).
- Ripristinare ed esportare un file a una revisione, aprirlo nell'editor.
- "Mostra tutti i file" nelle modifiche locali: l'albero di HEAD copre la navigazione.
- Navigazione con la tastiera nell'albero e nel blame.
