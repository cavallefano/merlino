import { describe, expect, it } from 'vitest'
import { HostingClient, type HostingError, nextLink } from '../../src/main/hosting/http'
import type { CommandLogEntry } from '../../src/shared/types'

const github = { service: 'github' as const, host: 'github.com', username: 'ada' }
const gitlab = { service: 'gitlab' as const, host: 'gitlab.example.com', username: 'ada' }
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init })

/** Client con un fetch finto che risponde con le risposte in coda (un Error = errore di rete). */
function client(account: typeof github | typeof gitlab, ...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const log: CommandLogEntry[] = []
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next || next instanceof Error) throw next ?? new Error('nessuna risposta')
    return next
  }
  return { c: new HostingClient({ account, token: 'tok-secret', fetch, log: (e) => log.push(e), repo: '/repo' }), calls, log }
}

async function failure(p: Promise<unknown>): Promise<HostingError> {
  try {
    await p
  } catch (e) {
    return e as HostingError
  }
  throw new Error('nessun errore')
}

describe('HostingClient', () => {
  it('GitHub: api.github.com, Bearer, niente redirect, timeout; il token non finisce nel log', async () => {
    const { c, calls, log } = client(github, json({ login: 'ada' }))
    expect(await c.request('GET', '/user')).toEqual({ login: 'ada' })
    expect(calls[0].url).toBe('https://api.github.com/user')
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer tok-secret' })
    expect(calls[0].init.redirect).toBe('error')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
    expect(log).toMatchObject([{ args: ['GET', 'https://api.github.com/user'], http: true, exitCode: 200, ok: true, repo: '/repo' }])
    expect(JSON.stringify(log)).not.toContain('tok-secret')
  })

  it('GitLab: /api/v4 e PRIVATE-TOKEN; il corpo va in JSON', async () => {
    const { c, calls } = client(gitlab, json({ id: 1 }, { status: 201 }))
    await c.request('POST', '/projects/1/merge_requests/2/notes', { body: 'ciao' })
    expect(calls[0].url).toBe('https://gitlab.example.com/api/v4/projects/1/merge_requests/2/notes')
    expect(calls[0].init.headers).toMatchObject({ 'PRIVATE-TOKEN': 'tok-secret', 'Content-Type': 'application/json' })
    expect(calls[0].init.body).toBe('{"body":"ciao"}')
  })

  it('paginazione: segue Link rel="next" fino al massimo', async () => {
    const next = (page: number) => ({ link: `<https://api.github.com/items?page=${page}>; rel="next", <https://api.github.com/items?page=9>; rel="last"` })
    const { c, calls } = client(github, json([1, 2], { headers: next(2) }), json([3, 4], { headers: next(3) }), json([5]))
    expect(await c.all('/items?page=1', 3)).toEqual([1, 2, 3])
    expect(calls.map((x) => x.url)).toEqual(['https://api.github.com/items?page=1', 'https://api.github.com/items?page=2'])
  })

  it('un link verso un altro server non riceve il token', async () => {
    const { c, calls } = client(github, json([1], { headers: { link: '<https://evil.example.com/x>; rel="next"' } }))
    await expect(c.all('/items', 10)).rejects.toThrow()
    expect(calls).toHaveLength(1)
  })

  it('errori tradotti', async () => {
    const cases: [Response, HostingError['kind'], RegExp][] = [
      [new Response('{"message":"Bad credentials"}', { status: 401 }), 'auth', /ada@github\.com/],
      [new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' } }), 'rateLimit', /try again at/],
      [new Response('{}', { status: 429, headers: { 'ratelimit-reset': '1700000000' } }), 'rateLimit', /try again at/],
      [new Response('{}', { status: 403 }), 'forbidden', /repo/],
      [new Response('{}', { status: 404 }), 'notFound', /github\.com/],
      [new Response('{"message":"Head branch was modified. Review and try the merge again."}', { status: 409 }), 'rejected', /changed in the meantime/],
      [new Response('{"message":"Validation Failed","errors":[{"message":"A pull request already exists for acme:feature/login."}]}', { status: 422 }), 'rejected', /already exists/],
      [new Response('', { status: 502 }), 'network', /github\.com is not responding/],
    ]
    for (const [res, kind, message] of cases) {
      const e = await failure(client(github, res).c.request('GET', '/x'))
      expect(e.kind, String(res.status)).toBe(kind)
      expect(e.message).toMatch(message)
    }
    expect(await failure(client(github, new Error('ECONNRESET')).c.request('GET', '/x'))).toMatchObject({ kind: 'network', message: 'github.com is not responding' })
  })

  it('paginazione di pagine che non sono array', async () => {
    const page = (n: number, next?: number) => json({ items: [n] }, next ? { headers: { link: `<https://api.github.com/x?page=${next}>; rel="next"` } } : {})
    const { c } = client(github, page(1, 2), page(2))
    expect(await c.all('/x?page=1', 10, (p) => (p as { items: number[] }).items)).toEqual([1, 2])
  })

  it('nextLink', () => {
    expect(nextLink(null)).toBeNull()
    expect(nextLink('<https://a.example/x?page=1>; rel="prev", <https://a.example/x?page=3>; rel="next"')).toBe('https://a.example/x?page=3')
  })
})
