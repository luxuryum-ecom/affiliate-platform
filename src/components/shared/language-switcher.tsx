'use client'

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setLocale } from '@/app/actions/locale'

const LANGS = [
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'AR' },
  { code: 'en', label: 'EN' },
] as const

/**
 * Sélecteur de langue.
 * variant="dark" (défaut) : thème sombre/or — accueil, espace affilié.
 * variant="light" : en-têtes blancs — espaces grossiste / fournisseur.
 */
export function LanguageSwitcher({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  // useLocale peut renvoyer un suffixe de formatage (ex. 'ar-u-nu-latn') —
  // on compare sur la langue de base.
  const active = useLocale().split('-')[0]
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function change(code: string) {
    if (code === active) return
    startTransition(async () => {
      await setLocale(code)
      router.refresh()
    })
  }

  const container =
    variant === 'light'
      ? 'border-gray-300 bg-gray-100'
      : 'border-gold-500/30 bg-black/30 backdrop-blur-sm'

  const buttonClasses = (isActive: boolean) => {
    if (variant === 'light') {
      return isActive ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
    }
    return isActive ? 'bg-gold-500 text-ink-900' : 'text-gold-300 hover:text-gold-200'
  }

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border p-0.5 ${container}`}
      role="group"
      aria-label="Langue"
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => change(l.code)}
          disabled={isPending}
          aria-pressed={active === l.code}
          className={`rounded-md px-2 py-1 text-xs font-bold transition-colors disabled:opacity-60 ${buttonClasses(
            active === l.code
          )}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
