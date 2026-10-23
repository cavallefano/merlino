# Merlino — Lingue (inglese e italiano) — design

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

Merlino diventa un progetto open source, quindi l'inglese diventa la lingua di base. L'italiano resta disponibile e si sceglie nelle Impostazioni. Aggiungere una lingua significa tradurre un solo file.

## Scelte

- **Lingue**: inglese (predefinita) e italiano.
- **Preferenza**: `language: 'en' | 'it'`, predefinita `'en'`, in Impostazioni → Generale → Lingua. Un file di impostazioni senza questa preferenza parte in inglese.
- **Cambio di lingua immediato**: l'interfaccia si ridisegna, il main ricostruisce la barra dei menu e i messaggi nuovi escono nella lingua scelta. Non serve riavviare.
- **Cosa si traduce**:
  - tutto ciò che si vede: interfaccia, palette, barra dei menu, menu contestuali, dialog e conferme, etichette del drag & drop;
  - i messaggi d'errore del main, compresa la validazione, la traduzione degli errori di git (`explain`) e il controllo di git all'avvio.
- **Cosa non si traduce**:
  - l'output grezzo di git nel pannello: git gira già con `LC_ALL=C`;
  - i commenti del codice e i documenti in `docs/`: non fanno parte dell'app.
- **Date**: si formattano con `Intl` nella lingua scelta.
- **`<html lang>`**: segue la lingua scelta.

## Architettura

- **Dizionari**:
  - `src/shared/i18n/en.ts` è il riferimento, un oggetto `{ chiave: testo }` con `as const`; i segnaposto si scrivono `{nome}`;
  - `src/shared/i18n/it.ts` ha tipo `Messages`, cioè le stesse chiavi dell'inglese: una chiave mancante o in più non compila.
- **Funzioni** (`src/shared/i18n/index.ts`):
  - `translate(lang, key, params?)`;
  - `translatePlural(lang, base, count, params?)`, che sceglie fra `<base>.one` e `<base>.other` con `Intl.PluralRules`;
  - `dateLocale(lang)`.
- **Main**: `src/main/i18n.ts` tiene la lingua corrente (`setLanguage`) ed espone `t` e `tn`. La usano menu, dialog, validazione, errori e operazioni git. `applyPreferences` aggiorna la lingua e ricostruisce la barra dei menu.
- **Renderer**: `src/renderer/i18n.ts` espone `t` e `tn`, che leggono `useAppStore().preferences.language`. Sono reattive: i template e i computed si aggiornano da soli.
  - I titoli delle azioni del registro diventano getter (`get title() { return t(…) }`), così la palette mostra sempre la lingua corrente.
  - `format.ts` formatta le date nella lingua scelta, con una cache dei formatter per lingua.
- **Nomi delle chiavi**: area e significato, per esempio `menu.file`, `sidebar.branches`, `working.commit`, `error.pushRejected`, `action.remote.fetch`. I plurali hanno le chiavi `.one` e `.other`.

## Test

- **Unit**:
  - `translate` e `translatePlural`: segnaposto, plurali, chiave mancante;
  - per ogni chiave, l'italiano ha gli stessi segnaposto dell'inglese e nessun testo vuoto;
  - i test esistenti che controllano testi italiani passano ai testi inglesi.
- **E2E**:
  - i test esistenti usano i testi inglesi, quelli predefiniti;
  - un test nuovo sceglie Italiano nelle Impostazioni e controlla che l'interfaccia ("Nessuna modifica") e la barra dei menu ("Impostazioni…") passino all'italiano, e poi tornino all'inglese.
- **Controllo finale**: una ricerca di parole italiane nei testi di `src/` (fuori da `it.ts` e dai commenti) non trova niente.

## README

"The interface is available in English and Italian", con la nota su come aggiungere una lingua.
