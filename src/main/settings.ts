import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_PREFERENCES } from '../shared/preferences'
import type { AppSettings } from '../shared/types'

const DEFAULTS: AppSettings = {
  gitPath: 'git',
  openRepos: [],
  activeRepo: null,
  recentRepos: [],
  preferences: DEFAULT_PREFERENCES,
  commitTemplates: [],
  defaultTemplates: {},
  accounts: [],
  remoteAccounts: {},
}
const MAX_RECENT = 10

/** Impostazioni dell'app in un file JSON. */
export class SettingsStore {
  private data: AppSettings

  constructor(private readonly file: string) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppSettings>
      // Le preferenze si uniscono campo per campo: un file di una versione precedente prende i default di quelle nuove
      this.data = { ...structuredClone(DEFAULTS), ...saved, preferences: { ...DEFAULT_PREFERENCES, ...saved.preferences } }
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
