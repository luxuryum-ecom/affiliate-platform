'use server'

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, isLocale } from '@/i18n/request'

/**
 * Mémorise la langue choisie dans un cookie (1 an). Le rendu serveur la relit
 * via src/i18n/request.ts. Purement visuel — aucune donnée métier impactée.
 */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}
