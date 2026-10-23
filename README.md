# Merlino

A fast, keyboard-friendly desktop Git client for macOS, Windows and Linux.

Merlino drives the `git` you already have installed, so your hooks, commit signing, credential helpers, LFS and config keep working exactly as they do on the command line. It is built with Electron, Vue 3 and TypeScript.

> **Status:** early development (v0.1). The interface is currently in Italian. No prebuilt releases yet: build it from source (see [Installation](#installation)).

## Features

### History
- Commit graph of every branch, remote branch and tag, in date order, with colored lanes. Commits are filled squares, merges are hollow squares.
- Two-line rows: subject, author, date, ref badges (local branches, remote branches, tags) and the number of changed files.
- Stays fluid on very large repositories: the first screen of a 100,000-commit history appears in under 2 seconds and only visible rows are drawn.
- Search with prefixes: `author:`, `path:`, `message:`, `contents:`. Plain text searches messages.
- Commit details: author and committer with dates, clickable parents, full message, changed files with added/removed lines.
- Diffs:
  - unified or side-by-side;
  - syntax highlighting and word-level changes;
  - optional whitespace ignoring;
  - very large files are shown only on request, binary files are summarized.
- A "local changes" row always at the top, linked to `HEAD` with a dashed line.

### Local changes and commits
- Stage, unstage and discard per file, per hunk or per single line; stage or unstage everything in one click.
- Add untracked files to `.gitignore`.
- Commit composer:
  - subject and body, with configurable length guides;
  - commit with <kbd>⌘</kbd><kbd>↩</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd>;
  - amend, with the previous message preloaded.
- **Commit templates**:
  - a library of named templates, plus a default template per repository;
  - Git's own `commit.template` is honored too;
  - `{branch}` and `{ticket}` variables (e.g. `feature/7hq2xk4mp-login` → `7hq2xk4mp`), and `#` comment lines are stripped;
  - insert a template with the Template button or by typing `/` in the subject.
- Stashes: create (optionally including untracked files), inspect, apply, pop, drop.
- Merge, rebase, cherry-pick and revert in progress:
  - a banner with Continue, Skip and Abort;
  - the list of conflicted files, with "Open" and "Mark as resolved";
  - conflict markers visible in the diff.

### Branches, tags and remotes
- Sidebar with local branches grouped in folders (with ahead/behind counts), remotes and their branches, tags and stashes.
- Branches: create (from `HEAD` or any commit), check out (remote branches get a local tracking branch), rename, delete, set or unset the upstream.
- Integrating changes:
  - merge (fast-forward or `--no-ff`), rebase, cherry-pick, revert;
  - reset soft, mixed or hard;
  - **interactive rebase**: reorder, pick, reword, edit, squash, fixup, drop.
- Tags: lightweight or annotated; create, delete, push.
- Remotes:
  - clone, fetch (optionally pruning deleted branches), pull (your `pull.rebase`, or explicitly rebase or merge);
  - push: sets the upstream on the first push; force push uses `--force-with-lease`;
  - add and remove remotes;
  - progress is shown in the toolbar, and open repositories can be fetched automatically in the background.
- Clear messages for the usual failures: missing credentials, rejected push, a leftover `index.lock`, conflicts, divergent branches.
- Destructive operations always ask first: discarding changes, hard reset, deleting an unmerged branch or a remote branch, force push, dropping a stash.

### Drag and drop
Drop to run the action; hold <kbd>⌥</kbd> (<kbd>Alt</kbd> on Windows/Linux) for the alternative. A label next to the cursor tells you what will happen before you let go.

| Drag | Onto | Action | With <kbd>⌥</kbd> |
|---|---|---|---|
| A branch (local or remote) | The current branch | Merge it into the current branch | Rebase the current branch onto it |
| A remote branch | Another local branch | Fast-forward it, without checking it out | Set it as upstream |
| A local branch | A remote, or one of its branches | Push it (and set the upstream) | Set the upstream only |
| A commit | The current branch or the local changes | Cherry-pick | Revert |
| A commit, branch or tag | The "Branches" header | New branch from there | |
| A commit | The "Tags" header | New tag on it | |
| Changed files | "Staged" / "Changed" | Stage / unstage | |
| Changed files | The "Stashes" header | Stash only those files | |
| A stash | The local changes | Apply | Pop |
| A file from a commit or stash | The local changes | Apply just that file's changes | |
| Any file | Outside Merlino (Finder, editor, chat…) | The file (from a commit: its content at that commit) | |

### Everyday use
- Several repositories open in tabs, restored on the next launch. Open a repository from the dialog, by dropping a folder on the window, or by passing a folder to the app on the command line.
- Command palette (<kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) with fuzzy search over every action. The same actions appear in the menu bar and in native context menus.
- Output panel listing every git command Merlino ran, with its exit code and error output.
- Open the repository in your terminal, or conflicted files in your editor.

### Settings
| Section | What you can set |
|---|---|
| General | Theme: system, light or dark. Automatic fetch interval, pruning, reopening tabs at launch |
| Commit | Subject and body length guides, commit templates and the default per repository |
| Diff | Initial view, whitespace, context lines, diff algorithm, code font size, tab width |
| Integrations | External editor and terminal |
| Git | Git executable; your global name and email; commit signing (GPG or SSH, key); pull strategy; default branch for new repositories; default clone folder |

The Git section edits your global Git configuration, so the same values apply on the command line and in other tools.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Command palette | <kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd> | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> |
| Open repository | <kbd>⌘</kbd><kbd>O</kbd> | <kbd>Ctrl</kbd>+<kbd>O</kbd> |
| Refresh | <kbd>⌘</kbd><kbd>R</kbd> | <kbd>Ctrl</kbd>+<kbd>R</kbd> |
| Search history | <kbd>⌘</kbd><kbd>F</kbd> | <kbd>Ctrl</kbd>+<kbd>F</kbd> |
| Commit | <kbd>⌘</kbd><kbd>↩</kbd> | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> |
| Settings | <kbd>⌘</kbd><kbd>,</kbd> | <kbd>Ctrl</kbd>+<kbd>,</kbd> |
| Output panel | <kbd>⌘</kbd><kbd>⇧</kbd><kbd>O</kbd> | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> |
| Close tab | <kbd>⌘</kbd><kbd>W</kbd> | <kbd>Ctrl</kbd>+<kbd>W</kbd> |
| Next / previous tab | <kbd>⌃</kbd><kbd>Tab</kbd> / <kbd>⌃</kbd><kbd>⇧</kbd><kbd>Tab</kbd> | <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Tab</kbd> |

## How it works

- **Your git, not a reimplementation.** Every operation runs the system `git` (2.35 or newer) as a separate process. There is no libgit2, so hooks, LFS, signing and credential helpers behave as they do in your terminal. Write operations on a repository are queued, so they never overlap.
- **Locked-down renderer.** The interface runs sandboxed with context isolation. It can only call named, typed operations that the main process validates one by one: branch names, SHAs and paths are checked, and the interface can never pass arbitrary arguments to git.
- **No telemetry, no accounts.** The only network traffic is what git itself does: clone, fetch, pull and push.

## Installation

Requirements: git 2.35 or newer, and a recent Node.js (CI uses Node.js 24) to build.

```bash
git clone https://github.com/cavallefano/merlino.git
cd merlino
npm install
npm run dist
```

`npm run dist` builds for the current platform, into `dist/`:
- macOS: `.dmg`;
- Windows: NSIS installer;
- Linux: AppImage and `.deb`.

The builds are not code-signed yet. On macOS, open the app the first time with right click → Open.

## Development

```bash
npm install
npm run dev          # run the app with hot reload
npm run lint && npm run typecheck
npm test             # unit and integration tests (they run real git on temporary repositories)
npm run test:e2e     # build, then Playwright end-to-end tests on the Electron app
```

- End-to-end tests run with the app window hidden (`MERLINO_E2E=1`), so they never steal focus while you keep working.
- No test ever touches your own `~/.gitconfig`: tests that need a global config point `GIT_CONFIG_GLOBAL` at a temporary file.
- The 100,000-commit performance test is opt-in: `MERLINO_PERF=1 npx vitest run test/integration/history-perf.test.ts`.

### Project layout

```
src/main/       Electron main process: git runner and parsers, IPC handlers, settings, menus
src/preload/    the typed bridge exposed to the interface (window.api)
src/renderer/   Vue 3 interface: components, Pinia stores, actions, drag and drop
src/shared/     types and IPC contract shared by main and renderer
test/           unit, integration (real git) and end-to-end (Playwright) tests
docs/           design specs and implementation plans (in Italian)
```

## Roadmap

1. Three-way merge tool.
2. Blame, file history and a tree view of the repository.
3. Submodules, worktrees, git flow and custom commands.
4. Pull/merge requests and team integrations.

## Contributing

Issues and pull requests are welcome.
- Please run `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` before opening a pull request.
- Keep new interface text consistent with the existing (Italian) wording.
- Commit messages follow the `feat:` / `fix:` / `docs:` / `test:` style used in the history.

## License

Merlino is released under the [MIT License](LICENSE).
