import { HostingClient } from '../../src/main/hosting/http'
import type { HostingService } from '../../src/shared/types'

export type Route = [method: string, path: string, body: unknown]

/** Un servizio finto: risponde per metodo e percorso (query compresa), 404 altrimenti, e registra le richieste. */
export function fakeService(service: HostingService, host: string, routes: Route[]) {
  const requests: { method: string; path: string; body: unknown }[] = []
  const fetch = async (url: string, init: RequestInit) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    const path = u.pathname + u.search
    requests.push({ method, path, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    const route = routes.find(([m, p]) => m === method && p === path)
    return route ? new Response(JSON.stringify(route[2])) : new Response('{"message":"404 Not Found"}', { status: 404 })
  }
  return { client: new HostingClient({ account: { service, host, username: 'ada' }, token: 'tok', fetch, log: () => {}, repo: null }), requests }
}
