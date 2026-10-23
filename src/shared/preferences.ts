import type { DiffAlgorithm, Preferences } from './types'

export const DEFAULT_PREFERENCES: Preferences = {
  language: 'en',
  theme: 'system',
  panelLayout: 'horizontal',
  autoFetchMinutes: 10,
  fetchPrune: true,
  restoreTabs: true,
  subjectWarn: 50,
  subjectLimit: 72,
  bodyGuide: 72,
  diffSplit: false,
  diffIgnoreWhitespace: false,
  diffContext: 3,
  diffAlgorithm: 'default',
  codeFontSize: 12,
  tabSize: 4,
  editorApp: null,
  terminalApp: null,
  cloneFolder: null,
}

export const DIFF_ALGORITHMS = ['default', 'myers', 'minimal', 'patience', 'histogram'] as const satisfies readonly DiffAlgorithm[]
