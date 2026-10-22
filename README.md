# Merlino

Client Git desktop del team, per macOS, Windows e Linux. Electron + Vue 3 + TypeScript.

Richiede git 2.35 o successivo installato sul sistema.

## Sviluppo

```bash
npm install
npm run dev          # app in sviluppo con ricarica automatica
npm test             # test unit e di integrazione (usano git vero)
npm run test:e2e     # build + test Playwright sull'app
npm run lint && npm run typecheck
```

## Pacchetti

```bash
npm run dist         # dmg / installer NSIS / AppImage+deb in dist/, per il sistema corrente
```

Le build non sono firmate: su macOS la prima volta si apre con click destro → Apri.

## Documentazione

- Design: `docs/superpowers/specs/`
- Piani di implementazione: `docs/superpowers/plans/`
