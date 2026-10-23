// Repo di prova con molti commit e un merge ogni 20: node scripts/make-big-repo.mjs <cartella> [commit]
import { execFileSync } from 'node:child_process'

const [dir, countArg = '100000'] = process.argv.slice(2)
if (!dir) {
  console.error('uso: node scripts/make-big-repo.mjs <cartella> [commit]')
  process.exit(1)
}
const total = Number(countArg)
execFileSync('git', ['init', '-q', '-b', 'main', dir])

const parts = []
let mark = 0
let time = 1_700_000_000
let mainTip = 0

function commit(ref, from, merge) {
  mark++
  time += 60
  const message = `commit ${mark} su ${ref}`
  const content = `${mark}\n`
  parts.push(`commit refs/heads/${ref}\nmark :${mark}\ncommitter Test <test@example.com> ${time} +0000\n`)
  parts.push(`data ${Buffer.byteLength(message)}\n${message}\n`)
  if (from) parts.push(`from :${from}\n`)
  if (merge) parts.push(`merge :${merge}\n`)
  parts.push(`M 644 inline f${mark % 200}.txt\ndata ${content.length}\n${content}\n`)
  return mark
}

while (mark < total) {
  if (mainTip && mark % 20 === 0) {
    const side = commit('feature', commit('feature', mainTip))
    mainTip = commit('main', mainTip, side)
  } else {
    mainTip = commit('main', mainTip)
  }
}
execFileSync('git', ['fast-import', '--quiet'], { cwd: dir, input: parts.join(''), maxBuffer: 1 << 30 })
execFileSync('git', ['checkout', '-q', 'main'], { cwd: dir })
console.log(`${dir}: ${mark} commit`)
