import { subscribe } from '@parcel/watcher'

/** Chiama onChange (con debounce) a ogni modifica sotto root. Restituisce la funzione per smettere. */
export async function watchRepo(root: string, onChange: () => void, debounceMs = 300): Promise<() => Promise<void>> {
  let timer: NodeJS.Timeout | undefined
  const subscription = await subscribe(
    root,
    (err) => {
      if (err) return
      clearTimeout(timer)
      timer = setTimeout(onChange, debounceMs)
    },
    { ignore: ['.git/objects', 'node_modules'] },
  )
  return async () => {
    clearTimeout(timer)
    await subscription.unsubscribe()
  }
}
