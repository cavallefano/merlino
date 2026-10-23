# Merlino — Impostazioni e commit template — design

Data: 2026-10-22 · Stato: approvato in brainstorming, in revisione

## Obiettivo

Due cose collegate:
1. **Schermata Impostazioni.** Anticipa le "preferenze, temi" della parte 7 e raccoglie le impostazioni dei principali client git (Tower soprattutto) che hanno senso per le funzioni attuali di Merlino.
2. **Commit template**, alla Tower: una libreria di template con nome, un predefinito per repo, il `commit.template` di git e le variabili.

Rispetto alla spec v1 cambiano due cose:
- **Tema**: la v1 diceva "segue il sistema". Ora si sceglie fra Sistema, Chiaro e Scuro, e Sistema resta il valore predefinito.
- **Firma dei commit**: la v1 diceva "nessuna interfaccia dedicata". Ora la sezione Git ha la firma dei commit, che scrive la config globale di git.

## Ricerca: cosa fanno gli altri client

| Client | Template di commit | Impostazioni rilevanti |
|---|---|---|
| **Tower** | Libreria di template con nome (oggetto + descrizione) nella scheda Templates delle impostazioni: crea, modifica, importa da file, imposta il valore globale di git. Predefinito per repository. Pulsante "Commit template" nel composer; `t:` o `/` nell'oggetto aprono l'elenco con ricerca. | Aspetto Automatico/Chiaro/Scuro; terminale in Generale; diff e merge tool in "Git Config"; profili utente; firma di commit e tag; chiavi SSH; fetch automatico in Generale |
| **GitKraken** | Un template per repo (sommario e descrizione) in Preferenze → Commit, salvato in `.git/gkcommittemplate.txt` e collegato a `commit.template`. Il `commit.template` del repo ha la precedenza sul globale. Opzioni: inserirlo da solo, togliere le righe `#`. | Fetch automatico 0–60 min, prune automatico, nome del branch iniziale, riapertura delle tab, editor e terminale esterni, temi, formato date, font e tab del diff, firma dei commit |
| **Sublime Merge** | Legge `commit.template` (dalla build 2059). | `rulers` e `wrap_width` nel messaggio di commit, `diff_algorithm`, font |
| **Fork** | "Support commit templates" (1.0.64); elenco dei messaggi recenti. | Fetch automatico ogni 20 minuti, disattivabile |
| **SourceTree** | Supporto di `commit.template` incostante; toglie le righe `#`. | — |
| **GitHub Desktop** | Nessun template. | Integrazioni (editor, shell), Git (identità), Aspetto, Prompts, cartella dei clone |

**Fonti**:
- Tower: [commit template](https://www.git-tower.com/help/guides/working-copy/commit-templates/mac), [profili utente](https://www.git-tower.com/help/guides/working-copy/user-profiles/mac), [diff tool](https://www.git-tower.com/help/guides/integration/diff-tools/mac), [terminali](https://www.git-tower.com/help/guides/integration/custom-terminals/mac), [dark mode](https://www.git-tower.com/help/guides/faq-and-tips/faq/dark-mode/mac), [Tower 11 per Windows](https://alternativeto.net/news/2026/2/tower-11-for-windows-brings-commit-templates-arm-native-support-and-other-improvements);
- GitKraken: [commit](https://help.gitkraken.com/gitkraken-desktop/commits), [preferenze](https://help.gitkraken.com/start-here/preferences/);
- Sublime Merge: [forum, commit.template](https://forum.sublimetext.com/t/commit-message-template/44643);
- Fork: [note di rilascio](https://git-fork.com/releasenotes), [fetch automatico](https://fork.dev/blog/posts/fork-1.0.67);
- SourceTree: [SRCTREE-982](https://jira.atlassian.com/browse/SRCTREE-982);
- GitHub Desktop: [impostazioni](https://docs.github.com/en/enterprise-server@3.19/desktop/configuring-and-customizing-github-desktop/configuring-basic-settings-in-github-desktop).

**Un difetto attuale di Merlino**: il commit si fa con `git commit -F -`. In questo modo git ignora `commit.template` e non toglie le righe `#` (con `-F` la pulizia predefinita è `whitespace`). I template devono quindi essere gestiti da Merlino.

## Schermata Impostazioni

- **Aspetto**: è a tutta finestra, dentro la finestra di Merlino, al posto delle tab dei repo, che restano aperte sotto. A sinistra le sezioni (Generale, Commit, Diff, Integrazioni, Git), a destra il contenuto. Si chiude con × o Esc.
- **Apertura**:
  - azione `settings.open`, "Impostazioni…", con <kbd>⌘,</kbd> / <kbd>Ctrl+,</kbd>;
  - nella barra dei menu: su macOS nel menu dell'app, sotto "Informazioni su Merlino"; su Windows e Linux in File;
  - "Gestisci template…" nel selettore dei template apre la sezione Commit.
- **Salvataggio**:
  - ogni modifica si salva subito, senza pulsante Salva;
  - i campi numerici e i percorsi si salvano quando escono dal fuoco o con Invio;
  - i template si salvano mentre scrivi, con 400 ms di pausa.

### Preferenze dell'app

Stanno nel file JSON delle impostazioni (`settings.ts`), nel campo `preferences`. Un file senza `preferences`, o con valori mancanti, prende i valori predefiniti campo per campo.

| Sezione | Campo | Tipo e intervallo | Predefinito | Effetto |
|---|---|---|---|---|
| **Generale** | `theme` | `'system' \| 'light' \| 'dark'` | `'system'` | `nativeTheme.themeSource` nel main, all'avvio e a ogni cambio. Il CSS con `prefers-color-scheme`, i menu e i dialog nativi lo seguono. |
| | `autoFetchMinutes` | intero 0–60 (0 = spento) | `10` | Fetch automatico dei repo aperti (vedi sotto) |
| | `fetchPrune` | booleano | `true` | `--prune` in ogni fetch, automatico o manuale |
| | `restoreTabs` | booleano | `true` | Se `false`, all'avvio non riapre le tab e svuota `openRepos` |
| **Commit** | `subjectWarn` | intero 20–200 | `50` | Il contatore dell'oggetto diventa giallo oltre questo valore |
| | `subjectLimit` | intero `subjectWarn`–200 | `72` | Il contatore diventa rosso oltre questo valore |
| | `bodyGuide` | intero 0 o 40–200 (0 = nessuna) | `72` | Linea verticale nella descrizione a N colonne; solo visiva |
| **Diff** | `diffSplit` | booleano | `false` | Vista iniziale affiancata |
| | `diffIgnoreWhitespace` | booleano | `false` | "Ignora spazi" attivo all'apertura del repo |
| | `diffContext` | intero 1–20 | `3` | `-U<n>` in tutti i diff |
| | `diffAlgorithm` | `'default' \| 'myers' \| 'minimal' \| 'patience' \| 'histogram'` | `'default'` | `--diff-algorithm=<x>`; `default` non passa niente e segue `diff.algorithm` di git |
| | `codeFontSize` | intero 10–20 | `12` | Variabile CSS `--code-size` per diff e codice |
| | `tabSize` | intero 1–8 | `4` | Variabile CSS `--tab-size` (`tab-size`) nei diff |
| **Integrazioni** | `editorApp` | percorso assoluto o `null` | `null` | App con cui "Apri" apre i file; `null` = app predefinita del sistema (`shell.openPath`) |
| | `terminalApp` | percorso assoluto o `null` | `null` | Terminale per "Apri nel terminale"; `null` = predefinito |
| **Git** | `cloneFolder` | percorso assoluto o `null` | `null` | Cartella da cui parte il dialog del clone |

Il main valida ogni campo sulle preferenze già unite alla modifica: per esempio `subjectLimit ≥ subjectWarn` si controlla anche se la modifica tocca uno solo dei due. Un valore non valido viene rifiutato con un errore. I campi numerici della schermata hanno minimo e massimo come attributi.

### Config globale di git (sezione Git)

Non viene copiata in Merlino: si legge e si scrive con `git config --global`, quindi vale anche da riga di comando e negli altri client.

| Chiave | Controllo | Valori |
|---|---|---|
| `user.name`, `user.email` | testo | qualsiasi, senza a capo, al massimo 200 caratteri |
| `commit.gpgsign` | casella "Firma i commit" | `true` / non impostato |
| `gpg.format` | scelta | `openpgp` (GPG) / `ssh` / non impostato |
| `user.signingkey` | testo | ID della chiave GPG o percorso della chiave SSH pubblica |
| `pull.rebase` | scelta | merge (`false`) / rebase (`true`) / non impostato |
| `init.defaultBranch` | testo | nome di branch valido, cioè le regole di `refName` già in `validate.ts` |

- Si possono leggere e scrivere solo queste 7 chiavi. Un valore vuoto toglie la chiave con `--unset`.
- La sezione mostra anche l'eseguibile git, con la sua versione, e la cartella dei clone.

### Fetch automatico

- **Dove**: `src/main/auto-fetch.ts`, con un timer per tutto il main. Ogni `autoFetchMinutes` minuti esegue `fetch --all --progress [--prune]` su ogni repo aperto, in coda con le scritture di quel repo.
- **Senza conseguenze visibili**: non manda avanzamento al renderer. Gli errori, per esempio di credenziali, finiscono solo nel log dei comandi (pannello di output).
- **Aggiornamento**: il watcher manda `repo:changed` come per un fetch dal terminale.
- **Cambio d'intervallo**: riparte il timer; 0 lo ferma.

### Integrazioni

| Operazione | macOS | Windows | Linux |
|---|---|---|---|
| Apri file (`openInEditor`) con `editorApp` | `open -a <app> <file>` | `<app> <file>` | `<app> <file>` |
| Apri file senza `editorApp` | `shell.openPath` | `shell.openPath` | `shell.openPath` |
| Apri nel terminale (`openInTerminal`) | `open -a <terminalApp \| Terminal> <root>` | `<terminalApp>` con cwd root, altrimenti `cmd.exe /c start cmd.exe` | `<terminalApp \| x-terminal-emulator>` con cwd root |

- I processi partono `detached`, con `stdio: 'ignore'`, e senza shell.
- **Scelta dell'app** (`pickApp`): dialog del sistema.
  - macOS: parte da `/Applications`, filtro `.app`.
  - Windows: filtro `.exe`.
  - Linux: qualsiasi file.
- **"Apri nel terminale"**: azione nuova `repo.openTerminal`, nella palette e nel menu File.

## Commit template

### Dati

- **Tipo**: `CommitTemplate { id: string; name: string; subject: string; body: string }`, in `commitTemplates` nel file delle impostazioni.
  - `id` è `crypto.randomUUID()` creato dal renderer.
  - Validazione nel main:
    - `id` corrisponde a `/^[\w-]{1,64}$/` ed è unico;
    - `name` ha da 1 a 100 caratteri dopo il trim;
    - `subject` ha al massimo 500 caratteri, `body` al massimo 20.000;
    - al massimo 200 template.
- **Predefiniti per repo**: `defaultTemplates: Record<string, string>`, dalla radice del repo all'`id`. Quando un template viene eliminato, il main toglie anche i suoi predefiniti.
- **`commit.template` di git**:
  - `readGitCommitTemplate(runner)` esegue `git config --path --get commit.template`, dove exit 1 vuol dire che non c'è. Git sceglie già quello del repo prima di quello globale;
  - un percorso relativo si intende dalla radice del repo;
  - se il file non esiste o non si legge, il risultato è `null`;
  - restituisce `{ path, text }`, e il renderer lo mostra come template in sola lettura, con nome "commit.template (git)".

### Funzioni pure (`src/shared/commit-template.ts`)

- **`stripComments(text)`**: toglie le righe che iniziano con `#`. Un `core.commentChar` diverso non è gestito.
- **`splitMessage(text)`**: toglie i commenti; la prima riga non vuota diventa l'oggetto; il resto, con trim, diventa il corpo.
- **`ticketFromBranch(branch)`**: se `branch` è `null` o non contiene `/`, restituisce `''`. Altrimenti prende l'ultimo pezzo dopo `/` fino al primo `-`: `feature/7hq2xk4mp-login` → `7hq2xk4mp`.
  - Limite noto: `feature/ALF-123-x` → `ALF`.
- **`expandTemplate(template, branch)`**: restituisce `{ subject, body }` con `{branch}` (vuoto se `branch` è `null`) e `{ticket}` sostituiti, e con i commenti tolti da oggetto e corpo.

### Nel composer

- **Pulsante "Template"**, accanto ad Amend e Stash…: apre `TemplatePicker` sotto l'oggetto.
  - In alto un campo di ricerca, che filtra per nome.
  - Poi l'elenco dei template della libreria, seguiti da "commit.template (git)" se c'è. Il predefinito del repo è segnato "predefinito".
  - In fondo "Gestisci template…".
  - Con ↑↓ ti sposti, Invio o clic applica, Esc o un clic fuori chiude.
- **Scorciatoia "/"**: se l'oggetto è vuoto e scrivi `/`, si apre lo stesso selettore senza un campo di ricerca suo: il testo dopo la `/` nell'oggetto fa da ricerca. Esc chiude e lascia il testo com'è.
- **Applicare un template**:
  - oggetto e descrizione vengono sostituiti da `expandTemplate`, poi il fuoco va in fondo all'oggetto;
  - se il composer conteneva altro testo (il `/…` della scorciatoia non conta), prima chiede conferma: "Sostituire il messaggio con il template «nome»?".
- **Template predefinito**: è quello del repo in `defaultTemplates`; se manca, quello di `commit.template`; se manca anche quello, niente.
- **Precompilazione**: se oggetto e descrizione sono vuoti e Amend è spento, il predefinito si applica da solo all'apertura delle modifiche locali e dopo ogni commit riuscito.
  - Lo store ricorda il messaggio precompilato. Se, quando si attiva Amend, il messaggio è ancora identico, viene sostituito con quello dell'ultimo commit, come oggi con il composer vuoto.
- Il commit resta `git commit -F -`. Le righe `#` sono già state tolte quando il template è stato applicato.

### Nella sezione Commit delle Impostazioni

- **Elenco**: a sinistra i template, poi "+ Nuovo" (crea "Nuovo template" e lo seleziona). In fondo "commit.template (git)" del repo attivo, se c'è, con percorso e testo in sola lettura e la nota "si modifica nel file".
- **Modulo**:
  - Nome, Oggetto, Descrizione;
  - "Predefinito per <nome del repo attivo>", solo se c'è una tab di repo attiva;
  - Elimina, con conferma.
- **Aiuto**: un riquadro spiega `{branch}`, `{ticket}` (con l'esempio) e le righe `#`.
- **Guide**: sopra l'elenco ci sono le guide (`subjectWarn`, `subjectLimit`, `bodyGuide`).

## IPC (nuove operazioni)

| Operazione | Restituisce |
|---|---|
| `updatePreferences(patch: Partial<Preferences>)` | `Result<AppSettings>`, validato e con gli effetti (tema, timer) già applicati |
| `saveCommitTemplates(templates: CommitTemplate[])` | `Result<AppSettings>` |
| `setDefaultTemplate(root: string, id: string \| null)` | `Result<AppSettings>` |
| `gitCommitTemplate(root: string)` | `Result<{ path: string; text: string } \| null>` |
| `gitGlobalConfig()` | `Result<Record<GitConfigKey, string>>`, dove una chiave mancante vale `''` |
| `setGitGlobalConfig(key: GitConfigKey, value: string)` | `Result<void>`; `''` toglie la chiave |
| `pickApp()` | `string \| null` |
| `openInTerminal(root: string)` | `Result<void>` |

- `GitConfigKey` è `'user.name' | 'user.email' | 'commit.gpgsign' | 'gpg.format' | 'user.signingkey' | 'pull.rebase' | 'init.defaultBranch'`.
- `pickRepoFolder` prende un `defaultPath` facoltativo.
- `DiffOptions` aggiunge `context: number` e `algorithm: DiffAlgorithm`; li manda il renderer, prendendoli dalle preferenze.

## Renderer

- **Store dell'app**:
  - tiene `settings` (preferenze, template, predefiniti), caricate all'avvio con `getSettings`;
  - ha `updatePreferences`, `saveTemplates` (con i 400 ms di pausa) e `setDefaultTemplate`;
  - `settingsSection: 'general' | 'commit' | 'diff' | 'integrations' | 'git' | null` dice se la schermata è aperta e su quale sezione.
- **Variabili CSS**: `--code-size` e `--tab-size` stanno su `document.documentElement` e si aggiornano a ogni cambio. Sostituiscono i `font-size: 12px` del codice dei diff in `DiffView.vue` e `StageDiff.vue`. La regola globale `code, pre, kbd` di `styles.css` resta com'è, perché serve anche alle scorciatoie nei pulsanti.
- **Store di ogni repo**:
  - `diffOptions` parte da `diffSplit` e `diffIgnoreWhitespace`;
  - il contesto e l'algoritmo partono dalle preferenze correnti a ogni richiesta;
  - `gitTemplate` viene caricato in `refresh`;
  - nuove funzioni: `applyTemplate(template)` e `prefillTemplate()`.
- **Componenti**:
  - `SettingsView.vue` (struttura e sezioni);
  - `settings/GeneralSettings.vue`, `settings/CommitSettings.vue`, `settings/DiffSettings.vue`, `settings/IntegrationSettings.vue`, `settings/GitSettings.vue`;
  - `TemplatePicker.vue`.
- **Azioni**: `settings.open` (scorciatoia `{ key: ',', mod: true }`), `repo.openTerminal` e `commit.template`, che apre il selettore.

## Test

**Regola di sicurezza**: nessun test scrive nel `~/.gitconfig` dell'utente.
- Integrazione: usa `GIT_CONFIG_GLOBAL` su un file temporaneo.
- E2E: `launch()` accetta variabili d'ambiente proprie.

- **Unit**:
  - validazione di preferenze (valori ammessi, intervalli, `subjectLimit ≥ subjectWarn`), template (id, limiti, duplicati) e chiavi della config git;
  - un file di impostazioni senza `preferences` prende i valori predefiniti;
  - `stripComments`, `splitMessage`, `ticketFromBranch` (con `/`, senza `/`, `null`), `expandTemplate`;
  - timer del fetch con timer finti: intervallo, 0 lo ferma, il cambio d'intervallo lo fa ripartire.
- **Integrazione**:
  - `readGitCommitTemplate`: repo prima del globale, percorso relativo, file mancante → `null`;
  - config globale: lettura, scrittura, rimozione con `''`, chiave fuori elenco rifiutata;
  - diff con `context` 1 e con `algorithm: 'patience'` (gli argomenti arrivano a git);
  - `fetch` senza `--prune` quando `fetchPrune` è `false`.
- **E2E**:
  - <kbd>⌘,</kbd> apre le Impostazioni, Esc le chiude;
  - Tema → Scuro porta `nativeTheme.themeSource` a `dark`;
  - un template creato nella sezione Commit si applica con `/` nell'oggetto, con `{ticket}` sostituito;
  - il template impostato come predefinito precompila il composer;
  - `commit.template` di git compare nel selettore e si applica senza le righe `#`;
  - nome ed email salvati nella sezione Git finiscono nel file indicato da `GIT_CONFIG_GLOBAL`.
- **A mano**: screenshot di ogni sezione in tema chiaro e scuro; "Apri nel terminale" ed editor esterno su macOS.
