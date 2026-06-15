'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toggleWholesaleAccess } from '@/app/actions/users'

interface Props {
  profileId: string
  initialValue: boolean
}

export function WholesaleAccessToggle({ profileId, initialValue }: Props) {
  const t = useTranslations('admin.wholesaleAccessToggle')
  const [enabled, setEnabled] = useState(initialValue)
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    const next = !enabled
    setEnabled(next)
    const fd = new FormData()
    fd.set('profileId', profileId)
    fd.set('wholesale_access', String(next))
    startTransition(() => toggleWholesaleAccess(fd))
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={handleToggle}
        disabled={isPending}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gold-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          enabled ? 'bg-primary' : 'bg-line'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${enabled ? 'text-foreground' : 'text-faint'}`}>
        {isPending ? t('updating') : enabled ? t('enabled') : t('disabled')}
      </span>
    </div>
  )
}
