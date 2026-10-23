import type { CommandLogEntry, HostingAccount, PullRequestRemote } from '../../shared/types'
import { readRemotes } from '../git/refs'
import type { GitRunner } from '../git/runner'
import { t } from '../i18n'
import type { SettingsStore } from '../settings'
import { accountFor, type TokenStore } from './accounts'
import { GitHub } from './github'
import { GitLab } from './gitlab'
import { type Fetch, HostingClient } from './http'
import type { HostingProvider } from './provider'
import { parseRemoteUrl } from './remote-url'

export interface HostingDeps {
  settings: SettingsStore
  tokens: TokenStore
  fetch: Fetch
  log: (entry: CommandLogEntry) => void
}

/** Un remote collegato al suo servizio: il provider con il token dell'account e il percorso del progetto. */
export interface Connection {
  remote: string
  host: string
  project: string
  account: HostingAccount
  provider: HostingProvider
}

export function createProvider(
  deps: Pick<HostingDeps, 'fetch' | 'log'>,
  account: Pick<HostingAccount, 'service' | 'host' | 'username'>,
  token: string,
  repo: string | null,
): HostingProvider {
  const client = new HostingClient({ account, token, fetch: deps.fetch, log: deps.log, repo })
  return account.service === 'github' ? new GitHub(client) : new GitLab(client)
}

/** Server e progetto di un remote dall'URL configurato; errore se il remote non c'è o non è su un server. */
export async function projectOf(runner: GitRunner, remote: string): Promise<{ host: string; path: string }> {
  const url = (await readRemotes(runner)).find((r) => r.name === remote)?.url
  const parsed = url ? parseRemoteUrl(url) : null
  if (!parsed) throw new Error(t('hosting.unknownRemote', { remote }))
  return parsed
}

/** I remote del repo con il loro server e l'account che li serve (runner.cwd è la radice del repo). */
export async function pullRequestRemotes(deps: HostingDeps, runner: GitRunner): Promise<PullRequestRemote[]> {
  const settings = deps.settings.get()
  return (await readRemotes(runner)).map(({ name, url }) => {
    const host = parseRemoteUrl(url)?.host ?? null
    return { name, host, account: host ? accountFor(settings, runner.cwd, name, host) : null }
  })
}

export async function connect(deps: HostingDeps, runner: GitRunner, remote: string): Promise<Connection> {
  const { host, path } = await projectOf(runner, remote)
  const account = accountFor(deps.settings.get(), runner.cwd, remote, host)
  const token = account && deps.tokens.get(account.id)
  if (!account || !token) throw new Error(t('hosting.noAccount', { host }))
  return { remote, host, project: path, account, provider: createProvider(deps, account, token, runner.cwd) }
}
