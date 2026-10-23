import type { DiffOptions, FileDiff, PullRequestChanges } from '../../shared/types'
import { t } from '../i18n'
import { checkoutRemote } from './branches'
import { fileChanges } from './commit'
import { type DiffRequest, diffFlags, limitedDiff } from './diff'
import { LOG_FORMAT, parseLog } from './log'
import { GitError, type GitRunner } from './runner'

const write = { write: true }

const hasCommit = async (r: GitRunner, sha: string): Promise<boolean> =>
  (await r.run(['cat-file', '-e', `${sha}^{commit}`], { okCodes: [0, 1, 128] })).exitCode === 0

/**
 * Scarica gli oggetti della PR (la testa e il branch di destinazione) senza creare né aggiornare ref,
 * così la storia non cambia. Se gli oggetti ci sono già, niente rete.
 */
export async function fetchPullRequest(r: GitRunner, remote: string, pullRef: string, base: string, baseSha: string, headSha: string): Promise<void> {
  if ((await hasCommit(r, baseSha)) && (await hasCommit(r, headSha))) return
  // --refmap= vuoto: niente aggiornamento "opportunistico" di <remote>/<base>
  await r.run(['fetch', '--no-write-fetch-head', '--no-tags', '--refmap=', remote, pullRef, `refs/heads/${base}`], write)
}

/** Commit da base a testa; file dal punto in cui la PR si è staccata (base...testa), come li mostra il servizio. */
export async function readPullRequestChanges(r: GitRunner, baseSha: string, headSha: string): Promise<PullRequestChanges> {
  const range = `${baseSha}...${headSha}`
  const [log, nameStatus, numstat] = await Promise.all([
    r.run(['log', '-z', '--decorate=full', `--format=${LOG_FORMAT}`, `${baseSha}..${headSha}`]),
    r.run(['diff', '-z', '-M', '--name-status', range]),
    r.run(['diff', '-z', '-M', '--numstat', range]),
  ])
  return { commits: parseLog(log.stdout), files: fileChanges(nameStatus.stdout, numstat.stdout) }
}

export async function readPullRequestFileDiff(r: GitRunner, baseSha: string, headSha: string, file: DiffRequest, options: DiffOptions): Promise<FileDiff> {
  const args = ['diff', '--no-color', '--no-ext-diff', '-M', ...diffFlags(options), `${baseSha}...${headSha}`]
  // Con la rinomina servono entrambi i percorsi
  args.push('--', ...(file.oldPath ? [file.oldPath, file.path] : [file.path]))
  return limitedDiff((await r.run(args)).stdout, file, options.force)
}

/**
 * Checkout di una PR. Stesso repository (branch): il branch locale che segue <remote>/<branch>, o uno nuovo, con un
 * fetch se il branch remoto non c'è ancora. Da un fork (branch null): pr/<n>, senza upstream, aggiornato solo in fast-forward.
 */
export async function checkoutPullRequest(r: GitRunner, remote: string, pullRef: string, number: number, branch: string | null): Promise<void> {
  if (branch) {
    const tracking = `refs/remotes/${remote}/${branch}`
    const known = await r.run(['rev-parse', '--verify', '--quiet', tracking], { okCodes: [0, 1] })
    if (known.exitCode !== 0) await r.run(['fetch', remote, `+refs/heads/${branch}:${tracking}`], write)
    return checkoutRemote(r, `${remote}/${branch}`)
  }
  const local = `pr/${number}`
  const current = (await r.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], { okCodes: [0, 1] })).stdout.trim()
  try {
    if (current === local) {
      // fetch non aggiorna il branch su cui si è: si scarica e poi fast-forward
      await r.run(['fetch', remote, pullRef], write)
      await r.run(['merge', '--ff-only', 'FETCH_HEAD'], write)
    } else {
      await r.run(['fetch', remote, `${pullRef}:refs/heads/${local}`], write)
      await r.run(['switch', local], write)
    }
  } catch (e) {
    // git lo segnala come "[rejected]", che explain() tradurrebbe in un push rifiutato
    if (e instanceof GitError && /rejected|non-fast-forward|Not possible to fast-forward/i.test(e.info.stderr)) {
      throw new GitError({ ...e.info, message: t('error.prNotFastForward', { branch: local }) })
    }
    throw e
  }
}

/** Commit di head che base non ha: quanti, e il messaggio se è uno solo (titolo e descrizione proposti per la PR). */
export async function branchSummary(r: GitRunner, base: string, head: string): Promise<{ count: number; message: string }> {
  const count = Number((await r.run(['rev-list', '--count', `${base}..${head}`])).stdout.trim())
  const message = count === 1 ? (await r.run(['log', '-1', '--format=%B', head])).stdout.trim() : ''
  return { count, message }
}
