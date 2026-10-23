import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { Result } from '../../shared/ipc'
import { DEFAULT_PREFERENCES } from '../../shared/preferences'
import type { AppSettings, CommandLogEntry, CommitTemplate, GitCheck, Preferences, RepoInfo } from '../../shared/types'
import { disposeRepoStore, useRepoStore } from './repo'

const MAX_LOG = 500
let uiErrorId = -1

export interface PromptField {
  key: string
  label: string
  type?: 'text' | 'checkbox'
  value?: string | boolean
}

export interface PromptRequest {
  title: string
  fields: PromptField[]
  /** Testo del pulsante di conferma. */
  confirm: string
}

export type PromptValues = Record<string, string | boolean>

export type SettingsSection = 'general' | 'commit' | 'diff' | 'integrations' | 'git'

export const useAppStore = defineStore('app', () => {
  const git = ref<GitCheck | null>(null)
  const tabs = ref<string[]>([])
  const active = ref<string | null>(null)
  const recent = ref<string[]>([])
  const error = ref<string | null>(null)
  const log = ref<CommandLogEntry[]>([])
  const outputOpen = ref(false)
  const paletteOpen = ref(false)
  /** Dialog di input aperto (Electron non implementa window.prompt). */
  const promptRequest = shallowRef<(PromptRequest & { resolve: (values: PromptValues | null) => void }) | null>(null)
  /** Ultima riga di avanzamento del clone in corso; null se non si sta clonando. */
  const cloneProgress = ref<string | null>(null)
  let cloneParent: string | null = null
  const settings = ref<AppSettings | null>(null)
  const preferences = computed(() => settings.value?.preferences ?? DEFAULT_PREFERENCES)
  /** Sezione della schermata Impostazioni aperta; null = chiusa. */
  const settingsSection = ref<SettingsSection | null>(null)

  async function updatePreferences(patch: Partial<Preferences>): Promise<boolean> {
    const r = await window.api.updatePreferences(patch)
    if (r.ok) settings.value = r.value
    else error.value = r.error.message
    return r.ok
  }

  // La libreria si aggiorna subito in locale (si scrive senza attese) e si salva dopo 400 ms di pausa
  let templatesTimer: ReturnType<typeof setTimeout> | undefined
  let pendingTemplates: CommitTemplate[] | null = null

  function saveTemplates(list: CommitTemplate[]) {
    if (!settings.value) return
    settings.value = { ...settings.value, commitTemplates: list }
    pendingTemplates = list
    clearTimeout(templatesTimer)
    templatesTimer = setTimeout(() => void flushTemplates(), 400)
  }

  async function flushTemplates() {
    clearTimeout(templatesTimer)
    const list = pendingTemplates
    pendingTemplates = null
    if (!list) return
    const r = await window.api.saveCommitTemplates(list)
    // Dal main serve solo defaultTemplates: i template locali possono essere già più nuovi
    if (r.ok && settings.value) settings.value = { ...settings.value, defaultTemplates: r.value.defaultTemplates }
    else if (!r.ok) error.value = r.error.message
  }

  async function setDefaultTemplate(root: string, id: string | null) {
    await flushTemplates()
    const r = await window.api.setDefaultTemplate(root, id)
    if (r.ok && settings.value) settings.value = { ...settings.value, defaultTemplates: r.value.defaultTemplates }
    else if (!r.ok) error.value = r.error.message
  }

  function addLog(entry: CommandLogEntry) {
    log.value.push(entry)
    if (log.value.length > MAX_LOG) log.value.shift()
  }

  /** Errori del renderer: finiscono nel pannello di output. */
  function pushUiError(err: unknown) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    addLog({ id: uiErrorId--, repo: null, args: [], startedAt: Date.now(), durationMs: 0, exitCode: null, ok: false, stderr: message })
    outputOpen.value = true
  }

  /** Da chiamare una volta, all'avvio. */
  async function init() {
    window.api.onCommandLogged(addLog)
    window.api.onRepoChanged((root) => {
      if (tabs.value.includes(root)) void useRepoStore(root).refresh()
    })
    window.api.onOpenPath((path) => void open(path))
    window.api.onProgress(({ root, line }) => {
      if (root === cloneParent) cloneProgress.value = line
      else if (tabs.value.includes(root)) useRepoStore(root).progress = line
    })
    window.addEventListener('focus', () => {
      if (active.value) void useRepoStore(active.value).refresh()
    })
    log.value = await window.api.getCommandLog()
    settings.value = await window.api.getSettings()
    git.value = await window.api.checkGit()
    if (git.value.ok) await restore()
  }

  async function restore() {
    const s = await window.api.getSettings()
    settings.value = s
    recent.value = s.recentRepos
    for (const path of s.openRepos) {
      // Senza "Riapri le tab" si dimenticano anche le tab della sessione precedente
      if (!s.preferences.restoreTabs || !(await open(path, false))) await window.api.closeRepo(path)
    }
    const initial = await window.api.takeInitialPath()
    if (initial) await open(initial)
    else activate(s.activeRepo && tabs.value.includes(s.activeRepo) ? s.activeRepo : (tabs.value[0] ?? null))
  }

  async function setGitPath(path: string) {
    git.value = await window.api.setGitPath(path)
    if (git.value.ok) await restore()
  }

  async function addTab(result: Result<RepoInfo>, focus: boolean): Promise<boolean> {
    if (!result.ok) {
      error.value = result.error.message
      return false
    }
    error.value = null
    const { root } = result.value
    useRepoStore(root).info = result.value
    if (!tabs.value.includes(root)) tabs.value.push(root)
    recent.value = (await window.api.getSettings()).recentRepos
    if (focus) activate(root)
    return true
  }

  const open = async (path: string, focus = true) => addTab(await window.api.openRepo(path), focus)
  const initRepo = async (path: string) => addTab(await window.api.initRepo(path), true)

  async function pickAndOpen() {
    const path = await window.api.pickRepoFolder()
    if (path) await open(path)
  }

  async function pickAndInit() {
    const path = await window.api.pickRepoFolder()
    if (path) await initRepo(path)
  }

  /** Chiede dei valori con il dialog; null se annullato. */
  function prompt(request: PromptRequest): Promise<PromptValues | null> {
    promptRequest.value?.resolve(null)
    return new Promise((resolve) => {
      promptRequest.value = { ...request, resolve }
    })
  }

  function closePrompt(values: PromptValues | null) {
    promptRequest.value?.resolve(values)
    promptRequest.value = null
  }

  async function cloneRepo() {
    const values = await prompt({ title: 'Clona repository', fields: [{ key: 'url', label: 'URL' }], confirm: 'Scegli la cartella…' })
    const url = String(values?.url ?? '').trim()
    if (!url) return
    const parent = await window.api.pickRepoFolder(preferences.value.cloneFolder ?? undefined)
    if (!parent) return
    cloneParent = parent
    cloneProgress.value = 'Clone in corso…'
    const r = await window.api.clone(url, parent)
    cloneParent = null
    cloneProgress.value = null
    if (r.ok) await open(r.value)
    else error.value = r.error.message
  }

  function activate(root: string | null) {
    active.value = root
    void window.api.setActiveRepo(root)
  }

  async function close(root: string) {
    const i = tabs.value.indexOf(root)
    if (i === -1) return
    tabs.value.splice(i, 1)
    if (active.value === root) activate(tabs.value[Math.min(i, tabs.value.length - 1)] ?? null)
    await window.api.closeRepo(root)
    disposeRepoStore(root)
  }

  function cycle(step: 1 | -1) {
    if (tabs.value.length < 2 || !active.value) return
    const i = tabs.value.indexOf(active.value)
    activate(tabs.value[(i + step + tabs.value.length) % tabs.value.length] ?? null)
  }

  return {
    git, tabs, active, recent, error, log, outputOpen, paletteOpen, promptRequest, cloneProgress,
    settings, preferences, settingsSection, updatePreferences, saveTemplates, flushTemplates, setDefaultTemplate,
    init, setGitPath, open, initRepo, pickAndOpen, pickAndInit, activate, close, cycle, pushUiError, prompt, closePrompt, cloneRepo,
  }
})
