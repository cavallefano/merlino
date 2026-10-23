const full = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' })
const thisYear = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const otherYear = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

export const formatDate = (seconds: number): string => full.format(seconds * 1000)

/** Per la lista: ora solo per l'anno in corso, altrimenti l'anno. */
export function formatShortDate(seconds: number): string {
  const date = new Date(seconds * 1000)
  return (date.getFullYear() === new Date().getFullYear() ? thisYear : otherYear).format(date)
}
