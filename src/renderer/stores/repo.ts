import { defineStore, getActivePinia } from 'pinia'
import { ref } from 'vue'
import type { RepoInfo } from '../../shared/types'

const storeId = (root: string) => `repo:${root}`

function define(root: string) {
  return defineStore(storeId(root), () => {
    const info = ref<RepoInfo | null>(null)
    const error = ref<string | null>(null)

    async function refresh() {
      const r = await window.api.repoInfo(root)
      if (r.ok) {
        info.value = r.value
        error.value = null
      } else {
        error.value = r.error.message
      }
    }

    return { root, info, error, refresh }
  })
}

const definitions = new Map<string, ReturnType<typeof define>>()

/** Uno store per ogni repo aperto (una tab). */
export function useRepoStore(root: string) {
  let useStore = definitions.get(root)
  if (!useStore) {
    useStore = define(root)
    definitions.set(root, useStore)
  }
  return useStore()
}

export function disposeRepoStore(root: string): void {
  const useStore = definitions.get(root)
  if (!useStore) return
  useStore().$dispose()
  delete getActivePinia()?.state.value[storeId(root)]
  definitions.delete(root)
}
