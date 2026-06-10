import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

// Langues supportées. FR = défaut (public marocain), AR = RTL, EN.
export const LOCALES = ['fr', 'ar', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'
export const LOCALE_COOKIE = 'LOCALE'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

/**
 * Résout la langue active : cookie LOCALE (choix manuel persistant) en priorité,
 * sinon l'en-tête Accept-Language du navigateur/téléphone, sinon FR.
 */
function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue
  if (acceptLanguage) {
    const preferred = acceptLanguage
      .split(',')
      .map((part) => part.split(';')[0].trim().slice(0, 2).toLowerCase())
    const match = preferred.find((lang) => isLocale(lang))
    if (match) return match
  }
  return DEFAULT_LOCALE
}

// Mode "sans i18n routing" : on détermine la locale ici (cookie/header), pas via l'URL.
export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const base = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language')
  )

  // Maghreb : l'arabe utilise les chiffres LATINS (numéraux occidentaux).
  // On force le système de numération « latn » pour le formatage next-intl
  // (ICU pluriels {#}, nombres, dates), tout en gardant la langue arabe.
  // Les messages et le cookie restent sur la locale de base ('ar').
  const formattingLocale = base === 'ar' ? 'ar-u-nu-latn' : base

  return {
    locale: formattingLocale,
    messages: (await import(`../../messages/${base}.json`)).default,
  }
})
