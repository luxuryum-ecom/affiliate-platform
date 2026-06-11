'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { convertQuoteToOrder } from '@/app/actions/quote-requests'
import type { ConvertQuoteFormState } from '@/app/actions/quote-requests'

const initial: ConvertQuoteFormState = { error: null }

export function ConvertQuoteButton({ requestId }: { requestId: string }) {
  const t = useTranslations('admin.convertQuote')
  const tc = useTranslations('admin.common')
  const [state, action, isPending] = useActionState(convertQuoteToOrder, initial)

  return (
    <form action={action}>
      <input type="hidden" name="request_id" value={requestId} />
      {state.error && (
        <p className="text-xs text-danger mb-2">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-sm font-medium py-2.5 px-4 rounded-lg transition-opacity focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {isPending ? t('submitting') : t('submitLabel')}
      </button>
    </form>
  )
}
