import { type MessageKey, type Params, type PluralKey, translate, translatePlural } from '../shared/i18n'
import { useAppStore } from './stores/app'

// Leggono la lingua dalle preferenze a ogni chiamata: nei template e nei computed si aggiornano da sole
const lang = () => useAppStore().preferences.language
export const t = (key: MessageKey, params?: Params): string => translate(lang(), key, params)
export const tn = (base: PluralKey, count: number, params?: Params): string => translatePlural(lang(), base, count, params)
