// Icone di Merlino da build/icon.svg (solo macOS, serve iconutil): npx electron scripts/make-icons.mjs
// build/icon.png: 1024 px da bordo a bordo, per Windows e Linux.
// build/icon.icns: per macOS, con il margine della griglia di Apple (la piastrella occupa 824 px su 1024).
import { app, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const build = join(import.meta.dirname, '..', 'build')
const svg = readFileSync(join(build, 'icon.svg'))
const SIZE = 1024

/** Una finestra fuori schermo, trasparente e mai mostrata: una sola, perché una seconda non carica la pagina. */
async function renderer() {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  const src = `data:image/svg+xml;base64,${svg.toString('base64')}`
  await win.loadURL(`data:text/html;base64,${Buffer.from('<body style="margin:0;background:transparent"><img style="position:absolute">').toString('base64')}`)
  /** Immagine trasparente di 1024 px con l'icona larga content px al centro. */
  return async (content) => {
    const pad = (SIZE - content) / 2
    await win.webContents.executeJavaScript(
      `Object.assign(document.images[0].style, { left: '${pad}px', top: '${pad}px', width: '${content}px', height: '${content}px' }); document.images[0].src = ${JSON.stringify(src)}; document.images[0].decode()`,
    )
    // Un attimo per il primo frame dopo il cambio
    await new Promise((resolve) => setTimeout(resolve, 300))
    // Con un display Retina la cattura può essere più grande: si riporta alla misura esatta
    return (await win.webContents.capturePage()).resize({ width: SIZE, height: SIZE, quality: 'best' })
  }
}

async function main() {
  const render = await renderer()
  writeFileSync(join(build, 'icon.png'), (await render(SIZE)).toPNG())
  const apple = await render(824)
  const dir = mkdtempSync(join(tmpdir(), 'merlino-icons-'))
  const iconset = join(dir, 'icon.iconset')
  mkdirSync(iconset)
  for (const base of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const size = base * scale
      const name = scale === 1 ? `icon_${base}x${base}.png` : `icon_${base}x${base}@2x.png`
      writeFileSync(join(iconset, name), apple.resize({ width: size, height: size, quality: 'best' }).toPNG())
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(build, 'icon.icns')])
  rmSync(dir, { recursive: true, force: true })
  console.log('build/icon.png e build/icon.icns aggiornati')
  app.quit()
}

// Niente icona nel Dock: lo script non porta in primo piano nessuna app.
// Con un entry point ESM, ready arriva dopo il caricamento del modulo: niente await qui sopra, o si blocca.
app.dock?.hide()
app
  .whenReady()
  .then(main)
  .catch((e) => {
    console.error(e)
    app.exit(1)
  })
