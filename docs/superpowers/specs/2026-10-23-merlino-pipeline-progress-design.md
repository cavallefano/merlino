# Merlino — Avanzamento delle pipeline nelle pull request — design

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

Vedere a colpo d'occhio, nella lista delle pull request aperte, a che punto sono le pipeline in corso, anche quando hanno molti step (decine o centinaia di job). Nel dettaglio della PR i job sono organizzati per stage, così restano leggibili.

Parte dalla parte 1 delle pull request (`2026-10-23-merlino-pull-requests-design.md`), che oggi mostra:
- nella lista un'icona per PR (✓ ✕ ●);
- nel dettaglio un elenco piatto dei check, che si apre nell'intestazione.

## Dati e servizi

### Stato di un job

- **Stati**: `passed`, `failed`, `running`, `queued` (nuovo), `skipped`, `cancelled`.
- **Ogni check porta anche**:
  - `group`: lo stage su GitLab, il workflow su GitHub; `null` per gli altri controlli;
  - `startedAt` e `finishedAt`, in secondi, `null` se non ci sono.
- **Riepilogo della pipeline** (`CiStatus.summary`): fallito se un job è fallito; in corso se un job è in corso o in coda; superato se ci sono job; nessuno altrimenti.

### GitLab

- **Job**: quelli della pipeline in testa allo SHA, fino a 1000, già oggi da `/pipelines/:id/jobs`.
- **Ordine**: i job si ordinano per id crescente, cioè come li crea la pipeline. L'ordine degli stage è quello in cui compaiono.
- **Stati**:
  - in coda: `created`, `pending`, `preparing`, `waiting_for_resource`, `scheduled`;
  - in corso: `running`;
  - saltati: `skipped` e `manual`, perché un job manuale non parte da solo e la barra non arriverebbe mai in fondo;
  - annullati: `canceled`, `canceling`.
- **Fuori**: le pipeline figlie (downstream).

### GitHub

- **Check run**: paginati fino a 1000, invece dei primi 100 di oggi. La risposta è un oggetto (`check_runs`), quindi `HostingClient.all` impara a prendere gli elementi da un campo.
- **Stati dei check run**: `queued`, `waiting`, `requested`, `pending` → in coda; `in_progress` → in corso; `completed` → secondo `conclusion`, come oggi.
- **Workflow**: una richiesta in più, `GET /repos/{o}/{r}/actions/runs?head_sha=<sha>`, dà il nome del workflow di ogni check suite.
  - Il gruppo di un check run è il nome del workflow della sua check suite.
  - Senza un workflow (check di altre app), il gruppo è il nome dell'app.
  - Se la richiesta fallisce (Actions spente, permessi), i check run si raggruppano per app.
- **Stati classici** (`/status`): gruppo `null` ("Altri controlli"); `pending` resta in corso, perché GitHub non distingue la coda.
- **Ordine dei gruppi**: i workflow per data di creazione, poi le app, infine gli altri controlli. Dentro un gruppo, per inizio e poi per nome.

### Aggiornamento

- Resta ogni 30 s, finché la vista è aperta.
- **Si ricontrollano le pipeline attive**, cioè con almeno un job in corso o in coda. Oggi si guarda solo il riepilogo "in corso": una pipeline con un job già fallito e altri ancora in esecuzione smette di aggiornarsi. È un difetto da correggere.
- Più spesso no: con molte PR in corso si arriverebbe al limite di GitHub (5000 richieste l'ora).

## Lista

- **Barra**: le PR con una pipeline attiva hanno una terza riga con:
  - una barra divisa per stato, con le parti in proporzione: superati, falliti, annullati e saltati insieme, in corso, in coda;
  - il testo `14/40 · test · 6 min`, cioè job finiti sul totale, gruppo in corso e tempo dall'inizio del primo job;
  - se qualcosa è già fallito, il gruppo lascia il posto a `1 failed`: `9/40 · 1 failed · 3 min`.
- **Gruppo in corso**: il primo con un job in corso; se nessuno gira, il primo con job in coda.
- **Tempo**: si aggiorna da solo a ogni controllo periodico, senza richieste in più. Senza job iniziati non compare.
- **Tooltip** della barra: il conteggio per stato ("10 passed · 1 failed · 3 in progress · 26 queued").
- **Clic sulla barra**: seleziona la PR e apre la scheda Controlli.
- **Pipeline finite**: la sola icona ✓/✕ di oggi, nessuna barra.
- **Accessibilità**: la barra è un `progressbar` con valore e massimo.

## Dettaglio

- **Scheda nuova "Controlli (N)"**, dopo Conversazione, Commit e Modifiche. N è il numero dei job.
- **Intestazione**: il riepilogo della CI porta alla scheda, invece di aprire l'elenco nell'intestazione.
- **Contenuto della scheda**:
  - in cima la stessa barra e lo stesso testo della lista;
  - un campo "Filtra i job…" se i job sono più di 20; filtra per nome (anche del gruppo), mostra solo i gruppi con risultati e li apre;
  - un gruppo per stage o workflow, nell'ordine della pipeline.
- **Riga di un gruppo**:
  - icona: fallito se un job è fallito; altrimenti in corso; altrimenti in coda; altrimenti superato;
  - nome ("Altri controlli" per `null`);
  - `finiti/totale`;
  - durata: dall'inizio del primo job alla fine dell'ultimo, o fino a ora se il gruppo è attivo.
- **Gruppi aperti**: all'inizio quelli con job falliti o in corso, gli altri chiusi. Le scelte dell'utente restano finché resta selezionata la stessa PR.
- **Riga di un job**: icona, nome, durata ("in coda" se non è partito), link "Dettagli" che si apre nel browser.
- **Nessun job**: "Nessun controllo per questo commit".

## Architettura

- **Tipi** (`src/shared/types.ts`): `CheckState` con `queued`; `Check` con `group`, `startedAt`, `finishedAt`.
- **Main**:
  - `http.ts`: `all(path, max, items?)`, dove `items` estrae gli elementi da una pagina che non è un array;
  - `provider.ts`: `ciSummary` con la coda;
  - `github.ts` e `gitlab.ts`: stati, gruppi, ordine e tempi come sopra.
- **Renderer, funzioni pure** (`src/renderer/pull-requests/model.ts`), testate senza interfaccia:
  - `ciProgress(status, now)`: conteggi per stato, finiti e totale, gruppo in corso, inizio, se è attiva;
  - `ciGroups(checks, now)`: i gruppi in ordine, con conteggi, stato e durata;
  - `isActive(status)`.
- **Durate**: `formatDuration(seconds)` in `history/format.ts`, nella lingua scelta ("40 s", "6 min", "1 h 12 min").
- **Store** (`usePullRequestStore`):
  - `now`, aggiornato a ogni controllo periodico;
  - `poll()` ricontrolla le pipeline attive;
  - `select(n, tab?)` apre una scheda precisa;
  - la scheda `checks`.
- **Componenti**: `CiProgress.vue` (barra e testo, usata nella lista e nella scheda) e `CiChecks.vue` (filtro e gruppi).
- **Testi**: in inglese e in italiano.

## Test

- **Unit**:
  - GitHub: check run paginati, stati in coda, gruppi per workflow, ripiego sulle app se `actions/runs` fallisce, ordine;
  - GitLab: ordine degli stage per id, stati in coda, job manuali saltati, tempi;
  - `ciSummary` con la coda;
  - `ciProgress`, `ciGroups`, `isActive`, `formatDuration`.
- **E2E** (finestra nascosta, server finto): una merge request di GitLab con una pipeline in corso di 40 job su 3 stage:
  - la barra nella riga con `15/40 · test`;
  - il clic sulla barra apre la scheda Controlli;
  - i gruppi `build` chiuso e `test` aperto;
  - il filtro riduce i job e apre il gruppo che li contiene.

## Fuori da questa parte

- Pipeline figlie di GitLab.
- Rilanciare, annullare o avviare i job (anche quelli manuali).
- Log dei job dentro Merlino.
- Aggiornamenti più frequenti di 30 s.
