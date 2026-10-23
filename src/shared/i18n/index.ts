import { en } from './en'
import { it } from './it'

export type Lang = 'en' | 'it'
export type MessageKey = keyof typeof en
export type Messages = { [K in MessageKey]: string }
export type Params = Record<string, string | number>
/** Chiave di un plurale senza suffisso: "working.modified" per "working.modified.one" e "working.modified.other". */
export type PluralKey = { [K in MessageKey]: K extends `${infer B}.other` ? B : never }[MessageKey]

export const LANGUAGES = ['en', 'it'] as const satisfies readonly Lang[]
const dictionaries: Record<Lang, Messages> = { en, it }

/** Testo nella lingua scelta, con i segnaposto {nome} sostituiti; un segnaposto senza valore resta com'è. */
export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const text = dictionaries[lang][key]
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text
}

const pluralRules = new Map<Lang, Intl.PluralRules>()

/** Plurale: <base>.one o <base>.other secondo le regole della lingua; {count} è il numero. */
export function translatePlural(lang: Lang, base: PluralKey, count: number, params?: Params): string {
  let rules = pluralRules.get(lang)
  if (!rules) {
    rules = new Intl.PluralRules(lang)
    pluralRules.set(lang, rules)
  }
  const form = rules.select(count) === 'one' ? 'one' : 'other'
  return translate(lang, `${base}.${form}` as MessageKey, { count, ...params })
}

export const dateLocale = (lang: Lang): string => (lang === 'it' ? 'it-IT' : 'en-US')
