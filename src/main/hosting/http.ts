import { dateLocale } from '../../shared/i18n'
import type { CommandLogEntry, HostingAccount } from '../../shared/types'
import { logId } from '../git/runner'
import { language, t } from '../i18n'

export type Fetch = (url: string, init: RequestInit) => Promise<Response>
export type HostingErrorKind = 'auth' | 'rateLimit' | 'forbidden' | 'notFound' | 'rejected' | 'network'

export class HostingError extends Error {
  constructor(
    readonly kind: HostingErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'HostingError'
  }
}

export interface ClientOptions {
  account: Pick<HostingAccount, 'service' | 'host' | 'username'>
  token: string
  fetch: Fetch
  log: (entry: CommandLogEntry) => void
  /** Repo per cui si fa la chiamata, per il log dei comandi; null per la verifica di un account. */
  repo: string | null
}

const TIMEOUT_MS = 20_000
const e2e = () => process.env.MERLINO_E2E === '1'

/** Indirizzo delle API; nei test E2E MERLINO_E2E_API porta tutto al server finto. */
export function apiBase(account: Pick<HostingAccount, 'service' | 'host'>): string {
  const fake = e2e() ? process.env.MERLINO_E2E_API : undefined
  const origin = fake ?? `https://${account.host}`
  if (account.service === 'gitlab') return `${origin}/api/v4`
  return !fake && account.host === 'github.com' ? 'https://api.github.com' : `${origin}/api/v3`
}

/** L'URL della pagina successiva dall'header Link (rel="next"). */
export function nextLink(header: string | null): string | null {
  return /<([^>]+)>\s*;\s*rel="next"/.exec(header ?? '')?.[1] ?? null
}

/** Il messaggio del servizio nel corpo di un errore: GitHub { message, errors }, GitLab { message } o { error }. */
export function serviceMessage(body: string): string {
  const flat = (v: unknown): string[] =>
    typeof v === 'string'
      ? [v]
      : Array.isArray(v)
        ? v.flatMap(flat)
        : v && typeof v === 'object'
          ? Object.entries(v).flatMap(([k, x]) => flat(x).map((s) => `${k} ${s}`))
          : []
  try {
    const v = JSON.parse(body) as { message?: unknown; error?: unknown; errors?: unknown }
    const errors = Array.isArray(v.errors) ? v.errors.flatMap((e: { message?: unknown } | null) => flat(e?.message)) : []
    return [...flat(v.message), ...flat(v.error), ...errors].join(' ')
  } catch {
    return body.slice(0, 200)
  }
}

/** I rifiuti più comuni, tradotti; gli altri restano col testo del servizio. */
function rejection(message: string): string {
  if (/head branch was modified|sha does not match/i.test(message)) return t('hosting.shaChanged')
  if (/conflict|not mergeable|cannot be merged/i.test(message)) return t('hosting.conflicts')
  if (/status check|pipeline must succeed/i.test(message)) return t('hosting.requiredChecks')
  return message
}

/** Chiamate alle API di un account: JSON, timeout di 20 s, niente redirect, errori tradotti, una riga nel log per chiamata. */
export class HostingClient {
  readonly base: string

  constructor(private readonly o: ClientOptions) {
    this.base = apiBase(o.account)
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await this.send(method, `${this.base}${path}`, body)).data as T
  }

  /** GET di tutte le pagine, seguendo Link rel="next", fino a max elementi; items li prende da una pagina che non è un array. */
  async all<T>(path: string, max: number, items: (page: unknown) => T[] = (page) => page as T[]): Promise<T[]> {
    const out: T[] = []
    let url: string | null = `${this.base}${path}`
    while (url && out.length < max) {
      const page = await this.send('GET', url)
      out.push(...items(page.data))
      url = nextLink(page.headers.get('link'))
    }
    return out.slice(0, max)
  }

  private headers(json: boolean): Record<string, string> {
    const auth: Record<string, string> =
      this.o.account.service === 'github'
        ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.o.token}`, 'X-GitHub-Api-Version': '2022-11-28' }
        : { Accept: 'application/json', 'PRIVATE-TOKEN': this.o.token }
    return { ...auth, 'User-Agent': 'Merlino', ...(json ? { 'Content-Type': 'application/json' } : {}) }
  }

  private async send(method: string, url: string, body?: unknown): Promise<{ data: unknown; headers: Headers }> {
    const { host } = this.o.account
    const target = new URL(url)
    // Il token va solo al server dell'account e solo cifrato (http solo verso il server finto dei test E2E)
    const secure = target.protocol === 'https:' || (e2e() && target.hostname === '127.0.0.1')
    if (target.origin !== new URL(this.base).origin || !secure) throw new HostingError('network', t('hosting.insecure', { host }))
    const startedAt = Date.now()
    const log = (exitCode: number | null, ok: boolean, stderr: string) =>
      this.o.log({
        id: logId(),
        repo: this.o.repo,
        args: [method, `${target.origin}${target.pathname}${target.search}`],
        http: true,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode,
        ok,
        stderr,
      })
    let res: Response
    let text: string
    try {
      res = await this.o.fetch(url, {
        method,
        headers: this.headers(body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      text = await res.text()
    } catch (e) {
      log(null, false, e instanceof Error ? e.message : String(e))
      throw new HostingError('network', t('hosting.unreachable', { host }))
    }
    if (res.ok) {
      log(res.status, true, '')
      return { data: text ? JSON.parse(text) : null, headers: res.headers }
    }
    const detail = serviceMessage(text)
    log(res.status, false, detail)
    throw this.error(res, detail)
  }

  private error(res: Response, detail: string): HostingError {
    const { service, host, username } = this.o.account
    const h = res.headers
    const remaining = h.get('x-ratelimit-remaining') ?? h.get('ratelimit-remaining')
    if (res.status === 429 || (res.status === 403 && remaining === '0')) {
      const reset = Number(h.get('x-ratelimit-reset') ?? h.get('ratelimit-reset'))
      const time = reset ? new Date(reset * 1000).toLocaleTimeString(dateLocale(language()), { hour: '2-digit', minute: '2-digit' }) : '?'
      return new HostingError('rateLimit', t('hosting.rateLimit', { time }))
    }
    switch (res.status) {
      case 401:
        return new HostingError('auth', t('hosting.tokenInvalid', { account: username ? `${username}@${host}` : host }))
      case 403:
        return new HostingError('forbidden', t('hosting.forbidden', { scope: service === 'github' ? 'repo' : 'api' }))
      case 404:
        return new HostingError('notFound', t('hosting.notFound', { host }))
      case 405:
      case 409:
      case 422:
        return new HostingError('rejected', rejection(detail) || t('hosting.httpError', { status: res.status }))
    }
    if (res.status >= 500) return new HostingError('network', t('hosting.unreachable', { host }))
    return new HostingError('rejected', detail || t('hosting.httpError', { status: res.status }))
  }
}
