# Merlino — Pull request e merge request (parte 1) — design

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

Gestire le pull request di GitHub e le merge request di GitLab senza uscire da Merlino, come in Tower. Questa spec copre la **parte 1**:
- account con token;
- lista e ricerca;
- dettaglio con conversazione, commit e modifiche;
- commento, checkout, merge, chiusura e riapertura;
- creazione;
- stato della CI.

La **parte 2** avrà una spec sua: revisioni (approva / richiedi modifiche, chi ha approvato) e commenti sulle righe del diff.

Nel testo "PR" vale per entrambe; nell'interfaccia si scrive "pull request" anche per GitLab, come fa Tower.

## Riferimento: Tower

- Gli account si collegano nella vista Services, con un token o con OAuth. Le credenziali stanno nel Portachiavi.
- Ogni remote è associato all'account del suo host; dal menu del remote si può sceglierne un altro.
- La vista Pull Requests (⌘4) mostra le PR aperte del remote scelto. La ricerca guarda titolo, descrizione, autore e branch.
- Il dettaglio ha tre schede:
  - Conversation: descrizione, commenti e commit in ordine di tempo;
  - Commits;
  - Changeset: il diff dell'intera PR.
- I pulsanti sono Add Comment, Check Out, Merge e Close.
- Il dialog di creazione chiede account, repository, base, head, titolo e descrizione.

Merlino aggiunge lo stato della CI e il filtro per stato (aperte, unite, chiuse).

## Servizi e account

- **Servizi**: GitHub (`github.com` e GitHub Enterprise) e GitLab (`gitlab.com` e self-hosted).
- **API**:
  - `https://api.github.com` per `github.com`;
  - `https://<host>/api/v3` per GitHub Enterprise;
  - `https://<host>/api/v4` per GitLab.
- **Accesso**: solo con token personale.
- **Impostazioni → Account** è una nuova sezione con la lista degli account; ognuno ha "Rimuovi" e "Apri nel browser".
- **"Aggiungi account…"** apre un dialog con:
  - servizio: GitHub o GitLab;
  - server: `github.com` o `gitlab.com` già scritti e modificabili;
  - token;
  - "Crea token…", che apre nel browser la pagina di creazione già compilata:
    - GitHub: `https://<host>/settings/tokens/new?scopes=repo&description=Merlino`;
    - GitLab: `https://<host>/-/user_settings/personal_access_tokens?name=Merlino&scopes=api`.
- **Verifica**: al salvataggio `GET /user`. Se va bene, mostra "Connesso come <utente> (<host>)" e salva; altrimenti spiega il motivo (vedi Errori).
- **Dove stanno i dati**:
  - `settings.json` riceve `accounts: HostingAccount[]`, cioè id, servizio, host e nome utente, senza token;
  - `remoteAccounts: Record<string, string>` contiene le scelte fatte dal menu del remote, con chiave `<root>\n<remote>`;
  - i token stanno in `tokens.json`, nella cartella dati dell'app, come `{ id: base64(safeStorage.encryptString(token)) }`.
- **Portachiavi**: se `safeStorage.isEncryptionAvailable()` è falso, l'account non si salva e il messaggio lo spiega. Su Linux senza un portachiavi Electron cifra solo in modo debole: la spec lo accetta e il README lo segnala.

## Remote e account

- **`remote-url.ts`**: funzione pura che dall'URL del remote ricava host e percorso del progetto. Riconosce:
  - `https://host/owner/repo(.git)`;
  - `git@host:owner/repo.git`;
  - `ssh://git@host:2222/owner/repo.git`;
  - i sottogruppi GitLab `group/sub/repo`.
- **URL letto**: è quello configurato (`git config remote.<nome>.url`), senza le riscritture `insteadOf`.
- **Account usato**: quello scelto per il remote, se c'è; altrimenti il primo account con lo stesso host.
- **Menu del remote → "Account…"**: sceglie un account fra tutti quelli collegati, oppure "Automatico". Serve per gli alias SSH e per due account sullo stesso server.
- **Nessun account**: la vista Pull requests mostra "Nessun account per <host>" con "Collega account…", che apre Impostazioni → Account con il server già scritto.

## La vista Pull requests

- **Come si apre**:
  - in cima alla sidebar ci sono due voci: **Storia** e **Pull requests** con il numero delle PR aperte del remote scelto;
  - scorciatoie <kbd>⌘1</kbd> / <kbd>⌘2</kbd> (<kbd>Ctrl</kbd>+<kbd>1</kbd>/<kbd>2</kbd>);
  - azioni nella palette;
  - voci nel menu Vista.
- **Cosa resta**: la vista prende il posto della storia e del pannello di destra; la sidebar resta uguale.
- **Lista (pannello centrale)**:
  - **Ricerca**: titolo, descrizione, autore, branch.
  - **Filtro**: Aperte / Unite / Chiuse / Tutte.
  - **Remote**: compare se più remote hanno un account. Si ricorda per repo; il predefinito è `origin`, se c'è.
  - **Pulsanti**: "Nuova pull request…" e ↻.
  - **Righe** su due linee:
    - `#42 Titolo`, l'etichetta Bozza e l'icona della CI;
    - autore · data · `head → base` · numero di commenti.
  - **Ordine**: per ultimo aggiornamento.
  - **Quante**:
    - le aperte si caricano tutte, fino a 500;
    - Unite, Chiuse e Tutte mostrano le 100 aggiornate più di recente.

    Su GitHub `state=closed` comprende anche le PR unite: si separano con `merged_at`.
- **Dettaglio (pannello di destra)**:
  - **Intestazione**:
    - titolo e numero;
    - stato (Aperta, Bozza, Unita, Chiusa);
    - autore;
    - `head → base`, con il proprietario del fork se la PR viene da un altro repo;
    - riepilogo della CI ("4 superati · 1 fallito"). Cliccandolo si apre l'elenco dei check, ognuno con il suo link.
  - **Schede**:
    - **Conversazione**: la descrizione in Markdown, poi commenti e commit in ordine di tempo. Vengono entrambi dall'API (commenti o note, e commit della PR), quindi la scheda funziona anche prima del fetch. Le note di sistema di GitLab ("added 1 commit", …) non compaiono. Cliccando un commit si passa alla scheda Commit con quel commit selezionato. In fondo c'è un riquadro per commentare, che si invia con <kbd>⌘↩</kbd>.
    - **Commit (N)**: la lista dei commit. Cliccandone uno si apre il dettaglio del commit di oggi (`CommitDetail`), con "← Commit" per tornare.
    - **Modifiche (N)**: i file e il diff della PR intera, con `DiffView` (unificato o affiancato, ignora spazi).
  - **Pulsanti**:
    - Checkout;
    - Merge… (principale);
    - Chiudi o Riapri;
    - menu "…" con "Apri nel browser" e "Copia link".

## Operazioni

### Merge

- **Il dialog mostra solo i metodi che il repo permette**:
  - GitHub: merge commit, squash, rebase, secondo `allow_merge_commit`, `allow_squash_merge` e `allow_rebase_merge` del repo;
  - GitLab: il metodo è quello del progetto (`merge_method`); la casella "Squash dei commit" compare se `squash_option` non è `never`, ed è spuntata con `always` e `default_on`.
- **Messaggio**: per merge commit e squash è già compilato e modificabile; per rebase e fast-forward non c'è.
- **Eliminare il branch dal remote dopo il merge**: casella che segue `delete_branch_on_merge` (GitHub) o `remove_source_branch_after_merge` (GitLab). Non compare per le PR da fork.
  - GitHub: dopo il merge Merlino cancella il ref con l'API.
  - GitLab: passa `should_remove_source_branch`.
- **Merge bloccato**: se il servizio lo blocca, il dialog dice perché e disattiva il pulsante. I motivi sono:
  - conflitti;
  - CI obbligatoria;
  - approvazioni mancanti;
  - bozza;
  - discussioni aperte;
  - serve un rebase.
- **CI facoltativa fallita**: il merge resta possibile, con un avviso.
- **SHA**: Merlino manda lo SHA della testa che ha mostrato; se è cambiato, il servizio rifiuta e il messaggio lo spiega.
- **Dopo il merge**: si aggiornano lista e dettaglio, poi un fetch del repo.

### Checkout

- **PR dello stesso repo**:
  - se un branch locale segue `<remote>/<head>`, Merlino passa a quello;
  - altrimenti fa un fetch e crea il branch locale da `<remote>/<head>`, come `checkoutRemote`.
- **PR da fork**:
  - `git fetch <remote> refs/pull/<n>/head:pr/<n>` (GitHub) o `refs/merge-requests/<n>/head:pr/<n>` (GitLab), poi checkout;
  - se `pr/<n>` esiste già, si aggiorna solo con un fast-forward;
  - il branch non ha upstream.
- **Esecuzione**: è un nuovo `RepoCommand` (`checkoutPullRequest`) e passa dalla coda di scrittura del repo.

### Commit e modifiche della PR

- **Oggetti**: `git fetch --no-write-fetch-head <remote> <ref della PR>` scarica gli oggetti senza creare ref, così la storia (`log --all`) non cambia.
- **Commit**: `git log <base-sha>..<head-sha>` con il parser di oggi.
- **Modifiche**: `git diff <merge-base>..<head-sha>`, con le funzioni di diff di oggi.
- **Senza rete**: se il fetch fallisce e gli oggetti non ci sono, le due schede dicono "Non è stato possibile scaricare la PR" con il motivo. La conversazione, che viene dall'API, resta.

### Chiudi, riapri, commenta

- **Chiudi / Riapri**: senza conferma.
- **Commento**: testo Markdown aggiunto alla conversazione (GitHub: commento della issue; GitLab: nota della merge request). Modificare e cancellare i commenti è fuori da questa parte.

### Creare una PR

- **Da dove**:
  - il pulsante della vista;
  - "Crea pull request da <branch>…" nel menu del branch;
  - la palette;
  - trascinando un branch locale sulla voce **Pull requests** della sidebar: è il nuovo bersaglio `pullRequests` in `dropAction`, con etichetta "Nuova pull request da <branch>…".
- **Campi del dialog**:
  - remote di destinazione: fra quelli con un account;
  - branch di destinazione: di default il branch principale del repo remoto;
  - branch con le modifiche: di default quello corrente;
  - titolo: l'oggetto del commit se il branch ha un solo commit in più, altrimenti il nome del branch;
  - descrizione: il corpo del commit se è uno solo;
  - casella **Bozza**: GitHub `draft: true`; GitLab, il prefisso "Draft: " nel titolo.
- **Branch da pubblicare**: se il branch non è sul remote o ha commit non pushati, il dialog lo dice e al conferma fa prima il push con l'upstream.
- **Fork**: si può creare la PR verso un altro remote sullo stesso server, per esempio da `origin` (fork) a `upstream`.
  - GitHub: `head` è `owner:branch`.
  - GitLab: la merge request si crea sul progetto del fork con `target_project_id`.
- **Dopo la creazione**: si apre la PR appena creata.

## CI

- **GitHub**: stati combinati (`/commits/<sha>/status`) più check run (`/commits/<sha>/check-runs`) dello SHA in testa alla PR.
- **GitLab**: la pipeline in testa alla merge request e i suoi job.
- **Ogni check** ha nome, stato (superato, fallito, in corso, saltato, annullato) e link.
- **Riepilogo**:
  - fallito se almeno un check è fallito;
  - in corso se almeno uno gira;
  - superato se ci sono check e nessuno dei due casi precedenti;
  - nessuno se non ci sono check.
- **Nella lista**: gli stati arrivano dopo le righe, con al massimo quattro richieste alla volta, e restano in memoria per SHA.
- **Controllo periodico**: finché la vista è aperta e c'è una CI in corso, si ricontrolla ogni 30 secondi.

## Aggiornamento

- **La lista si ricarica**:
  - all'apertura del repo, per il numero nella sidebar;
  - dopo ogni fetch, manuale o automatico;
  - con ↻;
  - dopo ogni azione.
- **Il dettaglio si ricarica**:
  - quando si seleziona la PR;
  - con ↻;
  - dopo ogni azione.

## Architettura

### Main: `src/main/hosting/`

| File | Compito |
|---|---|
| `remote-url.ts` | Da URL a `{ host, path }`, funzione pura. |
| `accounts.ts` | Account in `settings.json`, token cifrati in `tokens.json`, aggiunta con verifica, rimozione, account per un remote. |
| `http.ts` | `request()` su `net.fetch`: JSON, timeout di 20 s, `redirect: 'error'`, paginazione, errori tradotti, una riga nel log dei comandi per ogni chiamata (metodo, percorso, stato, durata, mai il token). |
| `github.ts` / `gitlab.ts` | Implementano `HostingProvider`: `verify`, `repoSettings`, `list`, `detail`, `checks`, `comment`, `merge`, `setState`, `create`, `pullRef`. Convertono le risposte nei tipi comuni. |
| `pull-requests.ts` | Per repo e remote: account, provider, cache della CI per SHA. |

- **Git**: `src/main/git/pull-request.ts` con fetch degli oggetti, commit, file e diff della PR, checkout.
- **Tipi comuni** (`src/shared/types.ts`):
  - `HostingAccount`;
  - `PullRequest`: numero, titolo, autore, stato `open | merged | closed`, `draft`, `head` e `base` con branch, SHA e progetto, date, commenti, URL;
  - `PullRequestDetail`: descrizione, `mergeable` con il motivo, `timeline` di commenti e commit, metodi di merge e opzioni;
  - `CiStatus`;
  - `MergeOptions`;
  - `NewPullRequest`.
- **IPC**:
  - nuovi canali `accounts:*` e `pr:*`;
  - il renderer passa solo `root`, nome del remote, numero, SHA e testi, mai URL o token;
  - `validate.ts` controlla ogni argomento: remote esistente, intero positivo, SHA esadecimale, metodo fra quelli ammessi, testi con un limite di lunghezza.

### Renderer

- **Store**: `usePullRequestStore(root)` contiene remote, filtro, ricerca, lista, selezione, dettaglio, scheda, CI e controllo periodico.
- **`RepoView`**: passa fra `history` e `pullRequests`.
- **Componenti**:
  - `PullRequestList`;
  - `PullRequestDetail` (`…Conversation`, `…Commits`, `…Changes`);
  - `MergeDialog`, `CreatePullRequestDialog`;
  - `settings/AccountSettings`, `AccountDialog`;
  - `Markdown`.
- **Azioni** (`actions/pull-requests.ts`):
  - palette;
  - menu del branch;
  - "Account…" nel menu del remote;
  - menu Vista.
- **Markdown**:
  - `marked` e `DOMPurify`, nuove dipendenze, solo nel renderer;
  - i link si aprono nel browser tramite il main, solo `http(s)`;
  - le immagini non si caricano: la CSP resta `img-src 'self' data:` e le immagini compaiono come link.
- **Testi**: in inglese e in italiano.

### Parte 2

Revisioni e commenti sulle righe si aggiungeranno come nuovi metodi di `HostingProvider`, nuovi elementi della timeline e annotazioni in `DiffView`. Qui non si prepara niente in anticipo.

## Errori

Gli errori compaiono in una fascia nella vista Pull requests; il resto dell'app continua a funzionare.

| Caso | Messaggio |
|---|---|
| 401 | "Il token di <utente>@<host> non è più valido", con "Aggiorna token…" |
| 403 con limite esaurito | "Limite di richieste raggiunto: riprova alle <ora>" (header `x-ratelimit-reset` / `ratelimit-reset`) |
| 403 senza limite esaurito | "Il token non ha i permessi necessari (serve `repo` / `api`)" |
| 404 | "Repository non trovato su <host>, o il token non può vederlo" |
| Merge rifiutato (405, 409, 422) | Il motivo del servizio, tradotto per i casi noti: SHA cambiato, conflitti, controlli obbligatori |
| Rete, timeout, redirect | "<host> non risponde". La lista già caricata resta visibile con la nota "Non aggiornata". |

## Sicurezza

- **Il token resta nel main**: non va al renderer, non va nei log, non va in `settings.json`.
- **Il token va solo al server del suo account**, in `https`. I redirect sono rifiutati.
- **Contenuti**: il Markdown passa da DOMPurify; i link esterni si aprono solo se sono `http(s)`.
- **README**: la voce "How it works" spiega che oltre a git Merlino contatta solo i server degli account collegati.

## Test

Nessun test usa la rete vera o token veri.

- **Unit**:
  - `remote-url`, con molti formati;
  - conversione delle risposte di GitHub e GitLab, da JSON di esempio con un `fetch` finto;
  - `http.ts`: errori, paginazione, redirect rifiutato;
  - riepilogo della CI;
  - `validate`;
  - `dropAction` con il bersaglio `pullRequests`.
- **Integrazione con git vero**: un repo bare con `refs/pull/1/head` e `refs/merge-requests/2/head` creati a mano, per provare:
  - fetch degli oggetti senza ref;
  - commit e diff fra merge-base e head;
  - checkout di una PR dello stesso repo e di una da fork.
- **E2E con la finestra nascosta (`MERLINO_E2E=1`)**:
  - un server finto locale risponde come le API di GitHub e GitLab;
  - in modalità E2E la variabile `MERLINO_E2E_API` indirizza le API a quel server e permette `http` su `127.0.0.1`;
  - il remote ha un URL con host fittizio e `url.<bare>.insteadOf` per puntare a un repo bare locale;
  - la cartella dati e la config globale di git sono temporanee.
  - Scenari:
    - aggiungere un account;
    - lista con stato della CI, filtro e ricerca;
    - dettaglio e commento;
    - merge;
    - creare una PR dal menu del branch;
    - checkout di una PR da fork.
- **Prova manuale facoltativa**: alla fine l'utente inserisce un proprio token nell'app installata.

## Fuori da questa parte

- Revisioni e commenti sulle righe: parte 2.
- Login OAuth.
- Bitbucket e Azure DevOps.
- Modificare o cancellare commenti.
- Etichette, assegnatari e milestone.
- Notifiche.
- Modificare titolo e descrizione di una PR esistente.
