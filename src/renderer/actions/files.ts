import type { FileChange, TreeEntry, WorkingFile } from '../../shared/types'
import { t } from '../i18n'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import { popup } from './branches'
import { registry } from './builtin'

type Repo = ReturnType<typeof useRepoStore>

/** Un file di cui chiedere storia e blame: a un commit, o sul disco con sha null. */
export interface FileTarget {
  path: string
  sha: string | null
  history: boolean
  blame: boolean
}

export const commitFileTarget = (sha: string, f: FileChange): FileTarget => ({ path: f.path, sha, history: true, blame: f.status !== 'D' })

export const treeFileTarget = (sha: string, e: TreeEntry): FileTarget => ({ path: e.path, sha, history: true, blame: e.kind === 'file' })

/** Un file non tracciato non ha storia; uno nuovo o cancellato non ha righe da attribuire. */
export const workingFileTarget = (f: WorkingFile): FileTarget => ({
  path: f.path,
  sha: null,
  history: f.status !== '?',
  blame: f.status !== '?' && f.status !== 'A' && f.status !== 'D',
})

/** Il file mostrato a destra nella storia: diff del commit, contenuto dell'albero o modifiche locali. */
export function selectedFileTarget(repo: Repo): FileTarget | null {
  if (repo.page !== 'history') return null
  if (repo.view === 'working') return repo.working ? workingFileTarget(repo.working.file) : null
  const sha = repo.selected
  if (!sha) return null
  if (repo.detailMode === 'tree') return repo.treeFile && repo.fileContent ? treeFileTarget(sha, repo.treeFile) : null
  return repo.selectedFile ? commitFileTarget(sha, repo.selectedFile) : null
}

export function openBlame(repo: Repo, target: FileTarget | null) {
  if (target?.blame) repo.blame = { sha: target.sha, path: target.path }
}

export function fileMenu(repo: Repo, target: FileTarget) {
  return popup([
    { label: t('file.history'), enabled: target.history, run: () => repo.showFileHistory(target.path) },
    { label: t('file.blame'), enabled: target.blame, run: () => openBlame(repo, target) },
  ])
}

/** Storia e blame del file selezionato, nella tab attiva. */
export function registerFileActions(): void {
  const app = useAppStore()
  const repo = () => (app.active ? useRepoStore(app.active) : null)
  const target = () => {
    const r = repo()
    return r ? selectedFileTarget(r) : null
  }

  registry.register(
    {
      id: 'file.history',
      get title() { return t('action.file.history') },
      when: () => target()?.history === true,
      run: () => {
        const x = target()
        if (x) return repo()?.showFileHistory(x.path)
      },
    },
    {
      id: 'file.blame',
      get title() { return t('action.file.blame') },
      when: () => target()?.blame === true,
      run: () => {
        const r = repo()
        if (r) openBlame(r, selectedFileTarget(r))
      },
    },
  )
}
