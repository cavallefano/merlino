# Merlino — Git flow — design

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

Usare git flow da Merlino, come in Tower: inizializzarlo, aprire e chiudere i branch feature, bugfix, release, hotfix e support. Il Finish fa il merge in locale oppure apre una pull request, a scelta.

## Riferimento: Tower e git-flow

- **Tower**:
  - implementa git flow con comandi git normali, senza l'estensione;
  - salva la configurazione nelle stesse chiavi di git-flow;
  - ha un pulsante Git Flow nella barra con Start e Finish e un dialog di inizializzazione.
- **git-flow** (nvie e la variante avh):
  - **feature e bugfix**: partono da develop e tornano in develop con un merge `--no-ff`;
  - **release**: parte da develop; al finish va in master con un merge `--no-ff`, riceve un tag annotato e torna in develop;
  - **hotfix**: parte da master (o da un branch support) e al finish fa lo stesso di una release, ma va nel branch release aperto, se c'è, invece che in develop;
  - **support**: branch di lunga durata da un tag di master, senza finish.

  Alla fine di un finish si resta su develop.

## Configurazione

- **Chiavi di git-flow-avh**, nella config locale del repository:
  - `gitflow.branch.master` e `gitflow.branch.develop`;
  - `gitflow.prefix.feature`, `bugfix`, `release`, `hotfix`, `support`;
  - `gitflow.prefix.versiontag`.

  Chi usa `git flow` da terminale trova tutto compatibile.
- **Base di un branch**: `gitflow.branch.<branch>.base`, scritta allo Start e tolta al Finish.
- **Repo inizializzato**: quando ci sono `gitflow.branch.master` e `gitflow.branch.develop`.
- **Tipo di un branch**: dal prefisso più lungo che gli fa da inizio. Un nome uguale al prefisso non conta.

## Inizializzazione

- **Dialog "Initialize Git Flow…"**: si apre dal pulsante o dalla palette, ed è il primo passo di ogni azione di git flow su un repo non inizializzato. Lo stesso dialog modifica la configurazione ("Git Flow Settings…").
- **Campi**:
  - branch di produzione: `main` se esiste, altrimenti `master`, altrimenti il branch corrente;
  - branch di sviluppo: `develop`;
  - prefissi: `feature/`, `bugfix/`, `release/`, `hotfix/`, `support/`;
  - prefisso dei tag di versione: `v`.

  Con una configurazione già presente propone i suoi valori.
- **Develop mancante**: se il branch di sviluppo non esiste, si crea da quello di produzione (anche dal suo remote, se c'è solo lì).
- **Validazione**: i nomi dei branch sono nomi di ref validi. I prefissi sono vuoti o frammenti validi di un nome di ref, fino a 50 caratteri; i cinque prefissi sono diversi fra loro. Il prefisso dei tag può essere vuoto.

## Start

- **Dialog "Start <Tipo>"**:
  - nome, oppure versione per release, hotfix e support;
  - base: una lista, più testo libero per i support (un tag o un commit);
  - "Check out the new branch" (sì);
  - "Publish to <remote>" (no; `origin` se c'è, altrimenti il primo remote).

| Tipo | Nome proposto | Base proposta | Basi ammesse |
|---|---|---|---|
| feature, bugfix | vuoto | develop | develop o un altro branch locale |
| release | versione successiva, minor: `v0.1.0` → `0.2.0` | develop | develop |
| hotfix | versione successiva, patch: `v0.1.0` → `0.1.1` | produzione | produzione o un branch support/ |
| support | `<major>.<minor>.x` dell'ultimo tag, es. `0.1.x` | l'ultimo tag di versione | un tag o un commit |

- **Versione proposta**: dall'ultimo tag con il prefisso di versione e una versione `X.Y.Z` (ordinamento per versione); senza tag, `0.1.0` per una release e `0.0.1` per un hotfix.
- **Comandi**:
  - `git switch -c <prefisso><nome> <base>`, o `git branch` senza checkout;
  - `git config gitflow.branch.<branch>.base <base>` (non per i support);
  - con la pubblicazione, `git push -u <remote> <branch>`.

## Finish

### Dialog

- **"Finish <Tipo> <nome>"**: si apre dal pulsante, dalla palette (sul branch corrente) e dal menu di un branch di git flow. Non c'è per i support.
- **Strada** (radio), ricordata per repository:
  - **Merge locale**;
  - **Pull request**: solo se un remote ha un account. Apre il dialog "New pull request" già compilato con branch, destinazione (develop, oppure la base per release e hotfix) e titolo ("Release 0.2.0", "Hotfix 0.1.1"; per feature e bugfix si propone come oggi). Per release e hotfix il dialog lo dice: dopo il merge della PR, un nuovo Finish completa tag, merge in develop e pulizia.
- **Opzioni del merge locale**:
  - "Update <destinazioni> from <remote> first" (sì, se le destinazioni seguono un remote);
  - tag (release e hotfix): nome `<prefisso><versione>` (fisso) e messaggio ("Release 0.2.0" / "Hotfix 0.1.1", modificabile);
  - "Delete the branch" (sì), con "also on <remote>" (sì, se il branch è sul remote);
  - "Push <destinazioni> and the tag to <remote>" (no, ricordata per repository).
- **Riepilogo**: il dialog elenca i passi che farà: "Merge release/0.2.0 into main · Tag v0.2.0 · Merge release/0.2.0 into develop · Delete release/0.2.0".

### Passi del merge locale

1. **Destinazioni**:
   - feature, bugfix: la base salvata, altrimenti develop;
   - release: produzione, poi develop;
   - hotfix: la base salvata, altrimenti produzione. Se la base è la produzione, poi il branch release aperto se c'è, altrimenti develop.
2. **Aggiornamento**, se scelto: `git fetch <remote>`, poi il fast-forward di ogni destinazione dal suo upstream. Se una destinazione si è separata dal suo upstream, il Finish si ferma con un messaggio.
3. **Merge**: per ogni destinazione che non contiene già il branch (`merge-base --is-ancestor`), checkout e `git merge --no-ff <branch>` con il messaggio standard di git. Con un conflitto il Finish si ferma: il banner del merge in corso permette di risolvere, continuare o annullare.
4. **Tag** (release e hotfix), se non esiste già:
   - si mette sul commit che ha portato il branch nella prima destinazione, cioè il primo commit della linea principale (`--first-parent`) che lo contiene; è il merge appena fatto, o quello della PR fatta sul server;
   - se il branch è entrato in fast-forward, si mette sulla sua punta;
   - è un tag annotato con il messaggio scelto.
5. **Cancellazione**, se scelta:
   - si passa all'ultima destinazione, se serve;
   - `git branch -d <branch>`;
   - se il branch esiste sul remote, `git push <remote> --delete <branch>`;
   - si toglie `gitflow.branch.<branch>.base`.
6. **Push**, se scelto: `git push <remote> <destinazione>` per ogni destinazione che segue quel remote, poi `git push <remote> refs/tags/<tag>`.
7. **Branch corrente**: si resta sull'ultima destinazione (develop, di solito).

### Ripetibilità

Ogni passo controlla se è già fatto (branch già contenuto, tag già presente, branch già cancellato). Quindi:
- dopo un conflitto risolto e il commit del merge, un nuovo Finish riprende dal passo successivo;
- dopo una PR unita sul server, un Finish con l'aggiornamento trova il branch già nella destinazione, mette il tag sul merge della PR, fa il merge in develop e pulisce.

## Interfaccia

- **Barra**: un pulsante "Git Flow" che apre un menu nativo.
  - Su un repo non inizializzato: "Initialize Git Flow…".
  - Altrimenti:
    - Start Feature…, Start Bugfix…, Start Release…, Start Hotfix…, Start Support…;
    - se il branch corrente è di git flow (non support), "Finish <Tipo> <nome>…";
    - "Git Flow Settings…".
- **Menu di un branch di git flow**: "Finish <Tipo> <nome>…".
- **Palette**: "Git Flow: Initialize…", "Git Flow: Start Feature…" (e gli altri tipi), "Git Flow: Finish Current Branch…".
- **Avanzamento e errori**: nella barra e nel banner, come per gli altri comandi git.

## Architettura

- **Tipi** (`src/shared/types.ts`):
  - `FlowType = 'feature' | 'bugfix' | 'release' | 'hotfix' | 'support'`;
  - `FlowConfig { main; develop; prefixes: Record<FlowType, string>; versionTag; bases: Record<string, string> }`;
  - varianti di `RepoCommand`:
    - `flowInit { config }`;
    - `flowStart { type; name; base; checkout; publish: string | null }`;
    - `flowFinish { branch; update; tagMessage; deleteBranch; deleteRemote; push }`.
- **Main**:
  - `src/main/git/flow.ts`:
    - `readFlowConfig(runner): FlowConfig | null`;
    - `flowInit`, `flowStart`, `flowFinish`;
    - `finishPlan(runner, branch): FlowStep[]`, i passi che farebbe; serve al riepilogo del dialog e ai test.
  - `validate.ts`: le tre varianti.
  - IPC: `flowConfig(root)` e `flowPlan(root, branch)`. I comandi passano da `git()`, quindi dalla coda di scrittura, con avanzamento ed errori come gli altri.
- **Renderer**:
  - funzioni pure in `src/renderer/flow/model.ts`: `flowTypeOf(branch, config)`, `nextVersion(tags, prefix, kind)`, `flowName(branch, config)`;
  - store del repo: `flow` (la configurazione, letta a ogni refresh) e `flowDialog` (`init`, `start` con il tipo, `finish` con il branch);
  - componenti `FlowInitDialog.vue`, `FlowStartDialog.vue`, `FlowFinishDialog.vue`;
  - azioni in `actions/flow.ts`.
  - Il dialog della nuova pull request accetta anche destinazione e titolo proposti (`creating: { branch; base?; title? }`).
- **Testi**: in inglese e in italiano.

## Test

- **Integrazione, con git vero**:
  - init: chiavi scritte, develop creato da main;
  - start di ogni tipo: base, checkout, chiave della base, pubblicazione;
  - finish di una feature: merge `--no-ff` in develop, branch cancellato (anche sul remote), si resta su develop;
  - finish di una release: merge in main, tag annotato sul merge, merge in develop, push;
  - hotfix con una release aperta: va nella release, non in develop;
  - hotfix da un branch support: va nel support, con il tag, non in develop;
  - ripresa dopo un conflitto;
  - release già unita via PR sul server: il tag va sul merge della PR, poi develop;
  - destinazione separata dal suo upstream: errore chiaro.
- **Unit**: `flowTypeOf`, `nextVersion`, `flowName`, la validazione delle tre varianti, `finishPlan`.
- **E2E** (finestra nascosta):
  - initialize, start di una feature, commit, finish locale dal menu del branch;
  - finish via PR che apre il dialog della nuova pull request con destinazione develop.

## Fuori da questa parte

- Hook di git-flow (`.git/hooks/pre-flow-*`).
- Squash, rebase o fast-forward al finish.
- Finish dei branch support.
- Git flow nel drag & drop.
