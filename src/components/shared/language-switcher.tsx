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

export function LanguageSwitcher() {
  const active = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function change(code: string) {
    if (code === active) return
    startTransition(async () => {
      await setLocale(code)
      router.refresh()
    })
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-gold-500/30 bg-black/30 p-0.5 backdrop-blur-sm"
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
          className={`rounded-md px-2 py-1 text-xs font-bold transition-colors disabled:opacity-60 ${
            active === l.code
              ? 'bg-gold-500 text-ink-900'
              : 'text-gold-300 hover:text-gold-200'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
