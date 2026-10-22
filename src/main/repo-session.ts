import type { CommandLogEntry } from '../shared/types'
import { GitRunner } from './git/runner'
import { watchRepo } from './watcher'

/** Un repo aperto: esegue git nella sua cartella e segnala quando cambia sul disco. */
export class RepoSession {
  readonly runner: GitRunner
  private stopWatching: (() => Promise<void>) | null = null

  constructor(
    readonly root: string,
    gitPath: () => string,
    log: (entry: CommandLogEntry) => void,
  ) {
    this.runner = new GitRunner(gitPath, root, log)
  }

  async start(onChanged: () => void): Promise<void> {
    this.stopWatching = await watchRepo(this.root, onChanged)
  }

  async dispose(): Promise<void> {
    await this.stopWatching?.()
    this.stopWatching = null
  }
}
