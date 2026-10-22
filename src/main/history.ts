import { createHash } from 'node:crypto'
import type { Commit, GraphRow, HistoryPage, HistorySummary } from '../shared/types'
import { layoutGraph } from './git/graph'
import { LOG_FORMAT, parseLog } from './git/log'
import type { GitRunner } from './git/runner'
import { searchArgs } from './git/search'

/** Storia del repo in memoria (commit + grafo), ricalcolata solo quando cambiano ref, HEAD o ricerca. */
export class History {
  private key = ''
  private version = 0
  private commits: Commit[] = []
  private rows: GraphRow[] = []
  private lanes = 0
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly runner: GitRunner) {}

  /** Le richieste vanno in fila: due eventi ravvicinati non fanno due git log in parallelo. */
  load(query: string): Promise<HistorySummary> {
    const result = this.queue.then(() => this.reload(query.trim()))
    this.queue = result.catch(() => undefined)
    return result
  }

  page(start: number, count: number): HistoryPage {
    return {
      version: this.version,
      commits: this.commits.slice(start, start + count),
      rows: this.rows.slice(start, start + count),
    }
  }

  private async reload(query: string): Promise<HistorySummary> {
    const [refs, head] = await Promise.all([
      this.runner.run(['for-each-ref', '--format=%(objectname) %(refname)']),
      this.runner.run(['rev-parse', '-q', '--verify', 'HEAD'], { okCodes: [0, 1] }),
    ])
    const key = createHash('sha1').update(refs.stdout).update(head.stdout).update(query).digest('hex')
    if (key !== this.key) {
      const search = searchArgs(query)
      const args = ['log', '--exclude=refs/stash', '--all', '--date-order', '-z', '--decorate=full', `--format=${LOG_FORMAT}`, ...search.args]
      if (search.paths.length) args.push('--', ...search.paths)
      // ponytail: storia intera in memoria; streaming a blocchi se serviranno repo da milioni di commit
      this.commits = parseLog((await this.runner.run(args)).stdout)
      if (query) {
        this.rows = this.commits.map(() => ({ lane: 0, up: [] }))
        this.lanes = 0
      } else {
        const graph = layoutGraph(this.commits)
        this.rows = graph.rows
        this.lanes = graph.lanes
      }
      this.key = key
      this.version++
    }
    return { version: this.version, total: this.commits.length, lanes: this.lanes }
  }
}
