'use client'

import { useState, useTransition } from 'react'
import { clearOrderFraudHold } from '@/app/actions/fraud'
import { useTranslations } from 'next-intl'

/**
 * Anti-fraude B7 (mig 124) — bloc de RETENUE fraude sur le détail commande admin.
 * Affiché quand la commande est retenue (score élevé, non levée). Bouton « lever »
 * → clearOrderFraudHold (server action, garde admin). Ne passe qu'une string
 * `orderId` à l'action (sérialisable — règle CLAUDE.md #2).
 */
export function FraudHoldControl({ orderId }: { orderId: string }) {
  const t = useTranslations('admin.fraudHold')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="mt-2 rounded-lg border border-danger bg-danger-soft px-3 py-2 space-y-2">
      <p className="text-xs text-danger-fg font-medium">{t('held')}</p>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setErr(null)
            const res = await clearOrderFraudHold(orderId)
            if (res.error) setErr(res.error)
          })
        }
        className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {isPending ? t('clearing') : t('clear')}
      </button>
      {err && <p className="text-xs text-danger-fg">{err}</p>}
    </div>
  )
}
