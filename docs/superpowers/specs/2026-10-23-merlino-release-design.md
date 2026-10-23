# Merlino — Release su GitHub — design

Data: 2026-10-23 · Stato: approvato in brainstorming

## Obiettivo

Pubblicare nelle GitHub Releases i pacchetti di Merlino per macOS, Windows e Linux, compilati da GitHub Actions su una macchina per sistema.

Sostituisce la sezione "Distribuzione" della spec v1, che indicava le GitLab Releases. Pacchetti e build non firmate restano quelli: `.dmg` arm64 e x64, installer NSIS x64, AppImage e `.deb` x64.

## Come parte una release

- **Tag**: il push di un tag `v*` sul repository fa partire il workflow `Release`.
- **Dal Mac del maintainer**:

  ```bash
  git switch main && git pull
  npm version minor        # oppure patch / major: aggiorna package.json, fa commit e tag
  git push --follow-tags
  ```

  La prima release è alla versione attuale: `git tag v0.1.0 && git push origin v0.1.0`.
- **Esito**: una release in **bozza** "Merlino X.Y.Z" con le note generate da GitHub e i 5 pacchetti. Si controlla e si pubblica a mano su GitHub ("Edit" → "Publish release").
- **Build di prova**: avvio a mano del workflow (tab Actions → Release → Run workflow, o `gh workflow run release.yml`). Compila senza creare release; i pacchetti restano come artifact della run. GitHub permette l'avvio a mano solo dei workflow che stanno nel branch principale.

## Workflow `.github/workflows/release.yml`

- **Eventi**: `push` di tag `v*` e `workflow_dispatch`.
- **Permessi**: `contents: write`, per creare la release e caricare i file con il `GITHUB_TOKEN`.
- **Node**: 24, con la cache di npm; `npm ci`. Il binario di Electron per i test non serve (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`): electron-builder scarica il suo.
- **Job `check`** (Ubuntu):
  - lint, typecheck, test unit e di integrazione (gli E2E restano in locale);
  - solo con un tag:
    - il tag deve essere `v` più la versione di `package.json`, altrimenti il job fallisce e non parte niente;
    - `gh release create <tag> --draft --title "Merlino <versione>" --generate-notes`.
- **Job `build`**, dopo `check`, uno per sistema e in parallelo, senza fermare gli altri se uno fallisce:

  | Macchina | Comando | File |
  |---|---|---|
  | `macos-latest` | `electron-builder --mac --arm64 --x64` | `.dmg` |
  | `windows-latest` | `electron-builder --win --x64` | `.exe` |
  | `ubuntu-latest` | `electron-builder --linux --x64` | `.AppImage`, `.deb` |

  - **Prima del pacchetto**: `electron-vite build`.
  - **electron-builder**: gira sempre con `--publish never`. Il watcher nativo lo ricompila lui per ogni architettura, come già succede in locale.
  - **Con un tag**: `gh release upload <tag> <file> --clobber`. Ogni job carica solo i suoi file e la release esiste già, quindi i job non fanno a gara per crearla. I `.blockmap` non si caricano.
  - **Con l'avvio a mano**: `actions/upload-artifact` con i file di quel sistema.
- **Versioni delle azioni**: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`.

## `electron-builder.yml`

- **macOS**:
  - firma **ad-hoc** (`identity: "-"`, `hardenedRuntime: false`) invece di nessuna firma: su Apple Silicon un'app senza una firma valida risulta "danneggiata";
  - niente notarizzazione: al primo avvio macOS chiede conferma.
- **Nomi dei file**:
  - macOS: `${productName}-${version}-mac-${arch}.${ext}`, cioè `Merlino-0.2.0-mac-arm64.dmg` e `Merlino-0.2.0-mac-x64.dmg`;
  - Windows (NSIS): `${productName}-${version}-windows-setup.${ext}`;
  - Linux: `${productName}-${version}-linux-${arch}.${ext}`, cioè `…-linux-x86_64.AppImage` e `…-linux-amd64.deb`.
- **Pubblicazione**: resta `publish: null`. Carica il workflow, quindi `npm run dist` in locale non pubblica mai niente.

## README

- **Installation**: si parte dai pacchetti delle Releases. Il primo avvio di un'app non firmata:
  - macOS: Impostazioni di Sistema → Privacy e sicurezza → "Apri comunque";
  - Windows: SmartScreen → "Ulteriori informazioni" → "Esegui comunque";
  - Linux: `chmod +x` per l'AppImage, oppure `sudo apt install ./Merlino-…-linux-amd64.deb`.

  La compilazione dai sorgenti resta come alternativa.
- **Releasing**: i comandi qui sopra, la bozza da pubblicare, la build di prova.

## Da sapere

- **Repo privato**: le release e i pacchetti li vedono solo i collaboratori.
- **Minuti di Actions**: quelli macOS contano 10 volte e quelli Windows 2. Una release costa circa 100 minuti dei 2000 al mese del piano gratuito.

## Verifica

- `actionlint` non è installato: il workflow si rilegge (YAML valido, nomi dei job, condizioni), e GitHub lo valida al push del branch.
- Prova vera dopo il merge in `main`: un avvio a mano del workflow, poi i pacchetti scaricati dalla run. Si apre l'app macOS x64 sul Mac del maintainer; gli altri pacchetti si controllano dal contenuto (nomi, dimensioni) e, se possibile, su una macchina del loro sistema.
- La prima release vera (`v0.1.0`) la decide il maintainer.

## Fuori da questa parte

- Firma con certificato Apple e notarizzazione; firma del codice per Windows.
- Aggiornamento automatico dell'app (`electron-updater`).
- Build per Linux arm64 o Windows arm64.
- E2E in CI.
