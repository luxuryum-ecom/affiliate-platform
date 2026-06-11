'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { cancelWholesaleOrderBuyer, updateWholesaleOrderBuyerNote } from '@/app/actions/orders'
import type { ActionState } from '@/types/orders'
import type { WholesaleOrderStatus } from '@/types/database'

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

function WhatsAppIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.524 5.847L0 24l6.338-1.499A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.003-1.369l-.36-.213-3.732.882.938-3.629-.234-.373A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182c5.421 0 9.818 4.398 9.818 9.818 0 5.421-4.397 9.818-9.818 9.818z" />
    </svg>
  )
}

interface Props {
  orderId: string
  currentNote: string | null
  status: WholesaleOrderStatus
  orderRef?: string | null
}

const init: ActionState = { error: null, success: false }

export function WholesalePendingActions({ orderId, currentNote, status, orderRef }: Props) {
  const t = useTranslations('wholesale.orderDetail')
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelWholesaleOrderBuyer, init)
  const [noteState, noteAction, notePending] = useActionState(updateWholesaleOrderBuyerNote, init)

  const shortRef = orderRef ?? orderId.slice(0, 8).toUpperCase()

  function handleCancel(e: React.FormEvent) {
    if (!window.confirm(t('pendingCancelConfirm'))) e.preventDefault()
  }

  if (status === 'pending') {
    return (
      <div className="bg-surface rounded-xl border border-warning p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('pendingModifyTitle')}</h2>
          <p className="text-xs text-muted mt-0.5">{t('pendingModifySubtitle')}</p>
        </div>

        <form action={noteAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <label className="block text-xs font-medium text-muted">{t('pendingNoteLabel')}</label>
          <textarea
            name="buyer_notes"
            defaultValue={currentNote ?? ''}
            rows={2}
            placeholder={t('pendingNotePlaceholder')}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none bg-surface text-foreground placeholder:text-faint"
          />
          {noteState.error && (
            <p className="text-xs text-danger-fg">{noteState.error}</p>
          )}
          {noteState.success && (
            <p className="text-xs text-success-fg">{t('pendingNoteUpdated')}</p>
          )}
          <button
            type="submit"
            disabled={notePending}
            className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {notePending ? t('pendingNoteSaving') : t('pendingNoteSave')}
          </button>
        </form>

        <hr className="border-line" />

        <form action={cancelAction} onSubmit={handleCancel}>
          <input type="hidden" name="orderId" value={orderId} />
          {cancelState.error && (
            <p className="text-xs text-danger-fg mb-2">{cancelState.error}</p>
          )}
          <button
            type="submit"
            disabled={cancelPending}
            className="px-4 py-1.5 text-xs font-medium bg-danger-soft text-danger-fg border border-danger rounded-lg hover:bg-danger hover:text-primary-foreground disabled:opacity-50 transition-colors"
          >
            {cancelPending ? t('pendingCancelCancelling') : t('pendingCancelBtn')}
          </button>
        </form>
      </div>
    )
  }

  if (status === 'confirmed' || status === 'sourcing' || status === 'shipped') {
    const msg = encodeURIComponent(
      t('pendingCancelWaMsg', { ref: shortRef })
    )
    return (
      <div className="bg-surface rounded-xl border border-warning p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('pendingCancelRequestTitle')}</h2>
          <p className="text-xs text-muted mt-0.5">{t('pendingCancelRequestSubtitle')}</p>
        </div>
        <a
          href={`https://wa.me/${WHATSAPP_PHONE}?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-success-fg text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <WhatsAppIcon />
          {t('pendingCancelWaBtn', { ref: shortRef })}
        </a>
      </div>
    )
  }

  if (status === 'delivered') {
    const msg = encodeURIComponent(
      t('pendingReturnWaMsg', { ref: shortRef })
    )
    return (
      <div className="bg-surface rounded-xl border border-line p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('pendingReturnTitle')}</h2>
          <p className="text-xs text-muted mt-0.5">{t('pendingReturnSubtitle')}</p>
        </div>
        <a
          href={`https://wa.me/${WHATSAPP_PHONE}?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-success-fg text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <WhatsAppIcon />
          {t('pendingReturnWaBtn', { ref: shortRef })}
        </a>
      </div>
    )
  }

  return null
}
