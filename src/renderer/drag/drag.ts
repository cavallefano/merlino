import { useAppStore } from '../stores/app'
import { reactive } from 'vue'
import { performDrop } from '../actions/branches'
import type { useRepoStore } from '../stores/repo'
import { type DragSource, dropAction, type DropTarget } from './drop-actions'

type Repo = ReturnType<typeof useRepoStore>
const MIME = 'application/x-merlino'

/** Trascinamento in corso. Durante il dragover Chromium non lascia leggere i dati, quindi l'origine sta qui. */
export const drag = reactive<{ source: DragSource | null; hover: string | null; label: string | null; x: number; y: number }>({
  source: null,
  hover: null,
  label: null,
  x: 0,
  y: 0,
})

export function resetDrag(): void {
  drag.source = null
  drag.hover = null
  drag.label = null
}

/** Elemento trascinabile dentro Merlino (drag HTML5). */
export function dragSource(source: DragSource) {
  return {
    draggable: true,
    onDragstart: (e: DragEvent) => {
      drag.source = source
      e.dataTransfer?.setData(MIME, '')
    },
    onDragend: resetDrag,
  }
}

/**
 * File trascinabile anche fuori da Merlino: se il main accetta il file, il drag diventa nativo (Electron startDrag) e nella
 * finestra arriva come un drag di file; altrimenti (file cancellato, troppo grande) resta un drag HTML5 interno.
 */
export function fileDragSource(repo: Repo, source: DragSource, item: { path: string; sha?: string }) {
  return {
    draggable: true,
    onDragstart: (e: DragEvent) => {
      drag.source = source
      if (window.api.startDrag(repo.root, item).ok) e.preventDefault()
      else e.dataTransfer?.setData(MIME, '')
    },
    onDragend: resetDrag,
  }
}

/** Destinazione: accetta il rilascio solo se dropAction lo ammette, mostra l'etichetta e al rilascio esegue. */
export function dropTarget(repo: Repo, target: DropTarget) {
  const key = JSON.stringify(target)
  const action = (e: DragEvent) =>
    drag.source ? dropAction(drag.source, target, e.altKey, {
          currentBranch: repo.info?.branch ?? null,
          remotes: repo.refs?.remotes ?? [],
          lang: useAppStore().preferences.language,
        }) : null
  return {
    class: { 'drop-hover': drag.hover === key },
    onDragover: (e: DragEvent) => {
      const a = action(e)
      if (!a) return
      e.preventDefault()
      e.stopPropagation()
      drag.hover = key
      drag.label = a.label
      drag.x = e.clientX
      drag.y = e.clientY
    },
    onDragleave: () => {
      if (drag.hover !== key) return
      drag.hover = null
      drag.label = null
    },
    onDrop: (e: DragEvent) => {
      const a = action(e)
      resetDrag()
      if (!a) return
      e.preventDefault()
      e.stopPropagation()
      void performDrop(repo, a.operation)
    },
  }
}
