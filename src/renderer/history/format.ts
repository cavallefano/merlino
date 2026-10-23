import { dateLocale, type Lang } from '../../shared/i18n'
import { useAppStore } from '../stores/app'

type Formats = Record<'full' | 'thisYear' | 'otherYear', Intl.DateTimeFormat>
const cache = new Map<Lang, Formats>()

/** I formati nella lingua scelta, creati una volta per lingua. */
function formats(): Formats {
  const lang = useAppStore().preferences.language
  let f = cache.get(lang)
  if (!f) {
    const locale = dateLocale(lang)
    f = {
      full: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
      thisYear: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      otherYear: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    }
    cache.set(lang, f)
  }
  return f
}

export const formatDate = (seconds: number): string => formats().full.format(seconds * 1000)

/** Per la lista: ora solo per l'anno in corso, altrimenti l'anno. */
export function formatShortDate(seconds: number): string {
  const date = new Date(seconds * 1000)
  const f = formats()
  return (date.getFullYear() === new Date().getFullYear() ? f.thisYear : f.otherYear).format(date)
}
