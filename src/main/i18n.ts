import { type Lang, type MessageKey, type Params, type PluralKey, translate, translatePlural } from '../shared/i18n'

// Lingua dei testi del main (menu, dialog, errori): la imposta applyPreferences dalle preferenze
let current: Lang = 'en'

export const setLanguage = (lang: Lang): void => {
  current = lang
}
export const language = (): Lang => current
export const t = (key: MessageKey, params?: Params): string => translate(current, key, params)
export const tn = (base: PluralKey, count: number, params?: Params): string => translatePlural(current, base, count, params)
