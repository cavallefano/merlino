# Merlino — Sidebar più chiara — design

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

Capire con uno sguardo dove si sta lavorando e cosa si sta guardando. Oggi branch locali e remoti sembrano uguali, le sezioni non mostrano di essere comprimibili e un clic su `main` evidenzia anche `origin/main`. Il riferimento è la sidebar di Tower.

## Oggi

- **In alto**: le voci History e Pull Requests (con il numero delle PR aperte), senza icone.
- **Sezioni** BRANCHES, REMOTES, TAGS e STASHES, con titoli in maiuscoletto grigio:
  - si chiudono cliccando il titolo, ma non c'è una freccia che lo mostri;
  - lo stato si perde cambiando scheda.
- **Righe** tutte uguali: il branch corrente è solo in grassetto, le cartelle hanno ▸/▾.
- **Evidenziazione**: si accende ogni riga che punta al commit selezionato. Se `main` e `origin/main` sono sullo stesso commit, un clic su uno accende anche l'altro.

## Area di lavoro (Workspace)

Una sezione in cima, con l'etichetta "Workspace" / "Area di lavoro" e tre voci con icona:

| Voce | Icona | Numero | Clic | Attiva quando |
|---|---|---|---|---|
| Local Changes / Modifiche locali (`page-working`) | file con matita | file modificati (`repo.changeCount`, lo stesso della riga in cima alla storia), se più di 0 | storia e modifiche locali (`repo.selectWorking()`) | pagina storia e vista modifiche locali |
| History / Storia (`page-history`) | orologio con freccia | — | pagina storia; se si era nelle modifiche locali, il commit selezionato prima, altrimenti HEAD | pagina storia e vista commit |
| Pull Requests (`page-pull-requests`) | pull request | PR aperte, come oggi | pagina delle PR | pagina delle PR |

La voce attiva ha lo sfondo della selezione, il testo in grassetto e l'icona nel colore d'accento. La riga "Local changes" in cima alla storia resta.

## Sezioni

- **Branches, Remotes, Tags, Stashes**. L'intestazione è un pulsante (`aria-expanded`) con:
  - una freccia che ruota da ▸ a ▾;
  - l'icona della sezione;
  - il titolo in maiuscoletto grigio, come oggi;
  - il numero di elementi, allineato a destra.
- **Intestazione fissa**: scorrendo una sezione lunga, la sua intestazione resta in cima (`position: sticky`).
- **Separazione**: una linea sottile (`--border`) sopra ogni sezione dopo l'area di lavoro e un po' di spazio sotto. Lo stile resta quello di oggi.
- **Stato**:
  - al primo avvio i tag sono chiusi e le altre sezioni aperte;
  - ogni sezione ricorda se è aperta o chiusa, per tutti i repo e anche dopo il riavvio. Lo stato sta nel `localStorage`, nel layout (`closedSections`), accanto alle misure dei pannelli;
  - le cartelle dei branch restano come oggi: chiuse o aperte finché la scheda resta aperta.
- Le intestazioni restano destinazioni del drag & drop, come oggi (branch, tag, stash).

## Righe

| Riga | Icona | Note |
|---|---|---|
| Branch locale | branch, nel colore d'accento | Il branch corrente ha la pastiglia **HEAD** (`head-badge`) oltre al grassetto; ↑/↓ come oggi |
| Remote (origin) | nuvola | È la cartella dei suoi branch, con la freccia |
| Branch remoto | branch, in grigio | |
| Cartella | cartella chiusa o aperta | Con la freccia |
| Tag | etichetta | |
| Stash | scatola | Pulsanti come oggi |

- **Allineamento**: la freccia sta in uno spazio fisso di 12 px prima dell'icona, vuoto per le righe senza figli. Così le icone di una stessa profondità sono allineate.
- **Riga selezionata**: sfondo d'accento come oggi; icona e HEAD prendono il colore del testo.

## Evidenziazione

- Si accende solo la riga cliccata. La sidebar ricorda la chiave della riga (es. `heads:main`, `remotes/origin:main`, `tags:v1.0`, `stash:stash@{0}`).
- La riga resta accesa finché nella storia è selezionato il suo commit, nella vista commit. Selezionando un altro commit si spegne, come oggi.

## Icone

- **Componente `AppIcon.vue`**: SVG a tratto, `viewBox` 24, `stroke="currentColor"`, 14 px, `aria-hidden`.
- **Disegni** da Lucide (`lucide-static` 1.61.0, licenza ISC): `file-pen`, `history`, `git-pull-request`, `git-branch`, `cloud`, `tag`, `archive`, `folder`, `folder-open`. Il testo della licenza sta in un commento `/*! … */`, che resta anche nel bundle.
- **Chevron**: un tracciato proprio (`m9 18 6-6-6-6`), perché quello di Lucide deriva da Feather, con licenza MIT.
- **Nessuna dipendenza nuova.**

## Architettura

- `src/renderer/layout.ts`:
  - `SIDEBAR_SECTIONS = ['branches', 'remotes', 'tags', 'stashes']`, tipo `SidebarSection`;
  - `Layout.closedSections: SidebarSection[]`: `readLayout` tiene solo gli id validi, e con un valore che non è un array usa `['tags']`.
- `src/renderer/components/AppIcon.vue` (nuovo).
- `src/renderer/components/RepoSidebar.vue`: area di lavoro, intestazioni, icone, HEAD, evidenziazione per chiave.
- Testi: `sidebar.workspace` ("Workspace" / "Area di lavoro") e `page.localChanges` ("Local Changes" / "Modifiche locali").

## Test

- **Unit** (`test/unit/layout.test.ts`): `closedSections` predefinito `['tags']`, id sconosciuti scartati, array vuoto mantenuto.
- **E2E** (`test/e2e/sidebar.spec.ts`, finestra nascosta):
  - un clic su `main` evidenzia solo `main` e non `origin/main` sullo stesso commit, e viceversa; HEAD compare su `main`;
  - i tag partono chiusi, si aprono e restano aperti dopo il reload;
  - Local Changes e History cambiano pannello e voce attiva; il numero dei file modificati compare sulla voce.
- **E2E esistenti**: dove si usano i tag (`branches.spec.ts`, `drag.spec.ts`) si apre prima la sezione.
- **Screenshot del README**: rigenerati, perché mostrano la sidebar.

## Fuori da questa parte

- Settings, Reflog e Branches Review nella sidebar, come in Tower.
- Cartelle dei branch ricordate dopo il riavvio.
