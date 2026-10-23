import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AppSettings } from '../shared/types'

const DEFAULTS: AppSettings = { gitPath: 'git', openRepos: [], activeRepo: null, recentRepos: [] }
const MAX_RECENT = 10

/** Impostazioni dell'app in un file JSON. */
export class SettingsStore {
  private data: AppSettings

  constructor(private readonly file: string) {
    try {
      this.data = { ...structuredClone(DEFAULTS), ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>) }
    } catch {
      this.data = structuredClone(DEFAULTS)
    }
  }

  get(): AppSettings {
    return structuredClone(this.data)
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch }
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file) // scrittura atomica: un crash non lascia il file a metà
    return this.get()
  }
}

export function addRecent(list: string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT)
}
