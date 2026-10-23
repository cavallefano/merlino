# Merlino — Release su GitHub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al push di un tag `vX.Y.Z`, GitHub Actions compila i pacchetti per macOS, Windows e Linux e li carica in una release in bozza; l'avvio a mano fa una build di prova.

**Architecture:**
- **Workflow `release.yml`**: un job `check` (controlli e, con un tag, la bozza della release) e un job `build` per sistema, che carica i propri file con `gh release upload`.
- **electron-builder**: non pubblica mai (`publish: null`). Su macOS firma ad-hoc, e i nomi dei file dicono sistema e architettura.

**Tech Stack:** GitHub Actions (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`), `gh`, electron-builder 26, Node 24.

Spec: `docs/superpowers/specs/2026-10-23-merlino-release-design.md`. Branch: `feature/releases`, che parte da `main`.

## Global Constraints

- **Pacchetti**: `.dmg` arm64 e x64, NSIS x64, AppImage e `.deb` x64. I `.blockmap` non si caricano.
- **Nomi**: `Merlino-<v>-mac-arm64.dmg`, `Merlino-<v>-mac-x64.dmg`, `Merlino-<v>-windows-setup.exe`, `Merlino-<v>-linux-x86_64.AppImage`, `Merlino-<v>-linux-amd64.deb`.
- **Tag** = `v` + versione di `package.json`, altrimenti niente release.
- **Release**: sempre in bozza, con le note generate da GitHub; la pubblica il maintainer.
- **Prova**: il workflow non si prova in locale (manca `actionlint`). Si rilegge, si controlla che il YAML sia valido, poi si prova davvero dopo il merge in `main` con l'avvio a mano.

---

### Task 1: electron-builder (firma ad-hoc e nomi dei file)

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: Configurazione**

`electron-builder.yml` diventa:

```yaml
appId: dev.merlino.app
productName: Merlino
directories:
  output: dist
files:
  - out/**/*
# Il modulo nativo del watcher non può stare dentro l'asar
asarUnpack:
  - node_modules/@parcel/watcher*/**
mac:
  target:
    - target: dmg
      arch: [arm64, x64]
  category: public.app-category.developer-tools
  # Senza certificato: firma ad-hoc, altrimenti su Apple Silicon l'app risulta "danneggiata" (vedi la spec delle release)
  identity: '-'
  hardenedRuntime: false
  artifactName: ${productName}-${version}-mac-${arch}.${ext}
win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  artifactName: ${productName}-${version}-windows-setup.${ext}
linux:
  target: [AppImage, deb]
  category: Development
  # ${arch}: x86_64 per l'AppImage, amd64 per il .deb
  artifactName: ${productName}-${version}-linux-${arch}.${ext}
# I pacchetti li carica il workflow Release: electron-builder non pubblica mai
publish: null
```

- [ ] **Step 2: Prova in locale (Mac Intel)**

Run:

```bash
OUT=<scratchpad>/rel && npx electron-vite build && npx electron-builder --mac dmg --x64 -c.directories.output="$OUT"
ls "$OUT"; codesign -dv "$OUT/mac/Merlino.app" 2>&1 | grep -i signature
```

Expected: `Merlino-0.1.0-mac-x64.dmg` in `$OUT` e `Signature=adhoc`.

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "build: firma ad-hoc su macOS e nomi dei pacchetti con sistema e architettura"
```

---

### Task 2: Workflow Release

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Il workflow**

```yaml
# Release: al push di un tag vX.Y.Z compila i pacchetti su macOS, Windows e Linux e li carica in una release in bozza.
# Avvio a mano (Actions → Release → Run workflow): compila e basta, i pacchetti restano come artifact della run.
name: Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: write

env:
  # Il binario di Electron di npm non serve: ai test no, e electron-builder scarica il suo
  ELECTRON_SKIP_BINARY_DOWNLOAD: '1'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - name: Il tag è la versione di package.json
        if: github.ref_type == 'tag'
        run: |
          expected="v$(node -p "require('./package.json').version")"
          if [ "$expected" != "$GITHUB_REF_NAME" ]; then
            echo "::error::Il tag $GITHUB_REF_NAME non corrisponde alla versione di package.json ($expected)"
            exit 1
          fi
      - name: Release in bozza
        if: github.ref_type == 'tag'
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" --draft --title "Merlino ${GITHUB_REF_NAME#v}" --generate-notes

  build:
    needs: check
    strategy:
      # Un sistema che fallisce non ferma gli altri
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            args: --mac --arm64 --x64
            files: dist/*.dmg
          - os: windows-latest
            args: --win --x64
            files: dist/*.exe
          - os: ubuntu-latest
            args: --linux --x64
            files: dist/*.AppImage dist/*.deb
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx electron-vite build
      # Il watcher nativo lo ricompila electron-builder per ogni architettura
      - run: npx electron-builder ${{ matrix.args }} --publish never
      - name: Pacchetti nella release
        if: github.ref_type == 'tag'
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release upload "$GITHUB_REF_NAME" ${{ matrix.files }} --clobber
      - name: Pacchetti come artifact della run
        if: github.ref_type != 'tag'
        uses: actions/upload-artifact@v7
        with:
          name: merlino-${{ runner.os }}
          path: |
            dist/*.dmg
            dist/*.exe
            dist/*.AppImage
            dist/*.deb
          if-no-files-found: error
```

- [ ] **Step 2: Controllo**

Run: `node -e "console.log(Object.keys(require('js-yaml').load(require('fs').readFileSync('.github/workflows/release.yml','utf8')).jobs))"`
Expected: `[ 'check', 'build' ]`.

Rilettura: i `${{ … }}` dentro `run` sono solo valori della matrice o del token, mai testo da un utente (nome del tag a parte, che passa da `$GITHUB_REF_NAME` fra virgolette).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: workflow Release (pacchetti per macOS, Windows e Linux in una release in bozza)"
```

---

### Task 3: README e note

**Files:**
- Modify: `README.md`, questo piano

- [ ] **Step 1: README**

- **Status**: "No prebuilt releases yet: build it from source (see [Installation](#installation))." diventa "Packages for macOS, Windows and Linux are on the [Releases](https://github.com/cavallefano/merlino/releases) page (see [Installation](#installation))."
- **Installation**: si apre con i pacchetti, poi "Build from source" con il blocco di oggi (senza la riga sulla firma, che passa nella tabella del primo avvio):

```markdown
## Installation

Download the package for your system from the [Releases](https://github.com/cavallefano/merlino/releases) page. You also need git 2.35 or newer.

| System | Package |
|---|---|
| macOS, Apple Silicon | `Merlino-<version>-mac-arm64.dmg` |
| macOS, Intel | `Merlino-<version>-mac-x64.dmg` |
| Windows | `Merlino-<version>-windows-setup.exe` |
| Linux | `Merlino-<version>-linux-x86_64.AppImage`, or `Merlino-<version>-linux-amd64.deb` for Debian and Ubuntu |

The packages are not signed with a developer certificate, so the first launch needs a confirmation:
- **macOS**: open the app once, then go to System Settings → Privacy & Security and click "Open Anyway".
- **Windows**: in the SmartScreen dialog, click "More info", then "Run anyway".
- **Linux**: `chmod +x Merlino-*.AppImage` and run it, or install the package with `sudo apt install ./Merlino-*-linux-amd64.deb`.

### Build from source

(il blocco attuale: requisiti con Node.js, clone, `npm install`, `npm run dist`, i pacchetti per sistema)
```

- **Releasing**, nuova sezione dopo "Development":

```markdown
## Releasing

From an up-to-date `main`:

```bash
npm version minor        # or patch / major: updates package.json, commits and tags vX.Y.Z
git push --follow-tags
```

The tag starts the **Release** workflow: lint, type checks and unit and integration tests, then a draft release "Merlino X.Y.Z" with generated notes, and the packages built on macOS, Windows and Linux. Review the draft on GitHub and publish it. The tag must match the version in `package.json`, otherwise the workflow stops.

For a test build without a release, run the workflow by hand (Actions → Release → Run workflow, or `gh workflow run release.yml`): the packages are attached to the run as artifacts.
```

- [ ] **Step 2: Verifica e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: tutto verde (il codice non cambia, è un controllo di sicurezza).

Note di esecuzione in fondo a questo piano, poi:

```bash
git add README.md docs
git commit -m "docs: installazione dai pacchetti delle release e come si fa una release"
```
