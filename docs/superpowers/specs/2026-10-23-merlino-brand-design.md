# Merlino — Icona della suite e README — design e piano

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

Merlino fa parte di una suite di app insieme a Daiquiri. Le icone devono avere un filo conduttore, e il README deve avere lo stesso aspetto pulito di quello di Daiquiri.

## Icona

- **Filo conduttore**: l'icona di Daiquiri è "a lime wheel and a stem forming a lowercase d on an emerald tile". In ogni app della suite una ruota e delle aste formano l'iniziale minuscola, su una piastrella del colore dell'app.
- **Ripresi da Daiquiri, uguali**:
  - la piastrella squircle 1024 e il suo ritaglio;
  - il gradiente in diagonale della piastrella;
  - il riflesso bianco sul bordo, con la sua sfumatura;
  - la ruota: anello, disco e 6 spicchi con la stessa geometria, in scala.
- **Merlino**:
  - una "m" minuscola di aste da 112 px a estremità tonde, con le gobbe a semicerchio. Le aste sono le linee dei branch;
  - la ruota (raggio 150) è centrata sulla prima asta, in basso: il nodo di commit da cui parte la linea;
  - colori: piastrella indaco (`#7457e6` → `#4b2fb5` → `#22105e`), aste lavanda (`#f1ebff` → `#bba5ff`), ruota ambra (anello `#ffc247` → `#d9800f`, disco `#fff7e8`, spicchi `#fff2b8` → `#ffd35c` → `#f6a623`).
- **File**:
  - `build/icon.svg`: la sorgente, da bordo a bordo come quella di Daiquiri, usata anche dal README;
  - `build/icon.png`: 1024 px trasparente, per Windows e Linux;
  - `build/icon.icns`: per macOS, con il margine della griglia di Apple (la piastrella occupa 824 px su 1024), altrimenti nel Dock sembrerebbe più grande delle altre icone. electron-builder prende da solo i file di `build/`.
- **Generazione**: `scripts/make-icons.mjs`, con `npx electron scripts/make-icons.mjs`.
  - Rende l'SVG in una finestra di Electron nascosta, fuori schermo e trasparente (`offscreen`, `capturePage`). Sul Mac non c'è un altro convertitore SVG con la trasparenza.
  - Nasconde l'icona del Dock, quindi niente finestre e niente focus rubato.
  - Ridimensiona con `sips` e crea l'`.icns` con `iconutil`.

## README

In inglese, sul modello di quello di Daiquiri:

1. **Intestazione centrata**:
   - icona (128 px) con un alt text descrittivo, `# Merlino`, la tagline in grassetto e due righe di descrizione;
   - un pulsante grande "Download" verso le Releases, nel lavanda delle aste;
   - badge piccoli nell'indaco della piastrella: licenza MIT, Electron, Vue, TypeScript, piattaforme.
2. **Screenshot principale**: chiaro e scuro con `<picture>`.
3. **Why Merlino**: 5 punti in grassetto.
4. **A quick tour**: tabella 2×2 di screenshot con didascalie (modifiche locali, pull request con le pipeline, rebase interattivo, palette dei comandi).
5. **What you get**: tabella per area (storia, modifiche locali, branch e remote, drag & drop, pull request, uso quotidiano, impostazioni, qualità). In `<details>` i gesti del drag & drop e le scorciatoie.
6. **Download**: i pacchetti per sistema e il primo avvio di un'app non firmata.
7. **How it works**, **Tech stack** (tabella).
8. **Build from source**, con in `<details>` tutti i comandi, la struttura del repo e le release.
9. **Roadmap** a checkbox, **Contributing**, **Translations**, **License**.

## Screenshot

- **Generati**: `test/e2e/readme-screenshots.spec.ts`. Parte solo con `MERLINO_SCREENSHOTS=1`, quindi `npm run test:e2e` lo salta.
  - Finestra nascosta, 1280×820.
  - Un repo di prova con nomi fittizi (`demo-app`, autori Ada Lovelace, Grace Hopper, Alan Turing, Katherine Johnson), branch, merge e tag.
  - Il server finto per le pull request, con una pipeline in corso.
- **Formato**: JPEG in `docs/assets/screenshots/`, larghi 1600 px (`sips` non scrive WebP).
- **Immagini**: `history-light.jpg` e `history-dark.jpg` (principale), `changes-light.jpg`, `pull-requests-dark.jpg`, `rebase-dark.jpg`, `palette-light.jpg`.

## Piano

1. **Icona**: `build/icon.svg`, `scripts/make-icons.mjs`, i PNG e l'`.icns` generati. Prova: `codesign` non c'entra; si controlla che il pacchetto macOS (`electron-builder --mac --dir`) contenga `icon.icns` e che il PNG abbia il canale alfa.
2. **Screenshot**: lo spec E2E e le 6 immagini.
3. **README**: riscrittura.
4. **Verifica**: lint, typecheck, test, E2E (lo spec degli screenshot saltato); poi commit, push e PR.
