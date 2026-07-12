'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatMAD } from '@/lib/utils'
import { confirmCashReceipt, rejectCashConfirmation } from '@/app/actions/guardian'

/**
 * Versements déclarés en attente de validation Abdou (DOUBLE CONFIRMATION —
 * la dette ne tombe qu'après confirmCashReceipt). Données sérialisables
 * uniquement — server actions importées directement (RÈGLE ABSOLUE CLAUDE.md #2).
 */

export interface PendingCashItem {
  id: string
  courierName: string
  courierType: string
  declaredAmountMad: number
  method: 'cash' | 'virement'
  declaredAt: string
  ordersCount: number
}

interface GuardianPendingCashPanelProps {
  items: PendingCashItem[]
}

export function GuardianPendingCashPanel({ items }: GuardianPendingCashPanelProps) {
  const t = useTranslations('admin.guardian')
  const te = useTranslations('errors')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Les RPC gardien renvoient parfois une clé `errors.xxx` brute — résolue ici,
  // comme src/components/account/delete-account-section.tsx.
  function resolveError(message: string) {
    return message.startsWith('errors.') ? te(message.slice('errors.'.length)) : message
  }

  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [errorItemId, setErrorItemId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function handleConfirm(confirmationId: string) {
    setErrorItemId(null)
    setRowError(null)
    startTransition(async () => {
      const res = await confirmCashReceipt({ confirmationId })
      if (res.error) {
        setErrorItemId(confirmationId)
        setRowError(resolveError(res.error))
        return
      }
      router.refresh()
    })
  }

  function openReject(id: string) {
    setRejectingId(id)
    setReason('')
    setErrorItemId(null)
    setRowError(null)
  }

  function cancelReject() {
    setRejectingId(null)
    setReason('')
    setErrorItemId(null)
    setRowError(null)
  }

  function submitReject(e: React.FormEvent) {
    e.preventDefault()
    if (!rejectingId) return
    const trimmed = reason.trim()
    if (!trimmed) {
      setErrorItemId(rejectingId)
      setRowError(t('rejectReasonRequired'))
      return
    }
    setErrorItemId(null)
    setRowError(null)
    startTransition(async () => {
      const res = await rejectCashConfirmation({ confirmationId: rejectingId, reason: trimmed })
      if (res.error) {
        setErrorItemId(rejectingId)
        setRowError(resolveError(res.error))
        return
      }
      cancelReject()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground bg-warning-soft border border-warning rounded-xl px-3 py-2.5">
        {t('pendingCashBanner')}
      </p>

      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        {items.length === 0 ? (
          <p className="text-sm text-muted p-5">{t('pendingCashEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-faint text-left border-b border-line bg-surface-2">
                  <th className="py-2.5 px-4 font-medium">{t('colCourier')}</th>
                  <th className="py-2.5 px-4 font-medium text-right">{t('colAmount')}</th>
                  <th className="py-2.5 px-4 font-medium">{t('colMethod')}</th>
                  <th className="py-2.5 px-4 font-medium text-right">{t('colOrdersCount')}</th>
                  <th className="py-2.5 px-4 font-medium">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line/60 last:border-0 align-top">
                    <td className="py-2.5 px-4 font-medium text-foreground">
                      {item.courierName}
                      <span className="block text-faint font-normal">
                        {item.courierType === 'company' ? t('typeCompany') : t('typePersonal')}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-medium text-foreground">
                      {formatMAD(item.declaredAmountMad)}
                    </td>
                    <td className="py-2.5 px-4 text-muted">
                      {item.method === 'virement' ? t('methodVirement') : t('methodCash')}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-muted">{item.ordersCount}</td>
                    <td className="py-2.5 px-4">
                      {rejectingId === item.id ? (
                        <form onSubmit={submitReject} className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t('reasonPlaceholder')}
                            disabled={isPending}
                            className="min-w-[160px] px-2.5 py-1.5 border border-line rounded-lg text-xs bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2"
                          />
                          <button
                            type="submit"
                            disabled={isPending}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-danger text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {isPending ? t('rejectSubmitting') : t('rejectConfirm')}
                          </button>
                          <button
                            type="button"
                            onClick={cancelReject}
                            disabled={isPending}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-line text-muted hover:bg-surface-2 transition-colors disabled:opacity-50"
                          >
                            {t('cancelAction')}
                          </button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleConfirm(item.id)}
                            disabled={isPending}
                            className="text-xs px-3 py-1.5 rounded-lg bg-success-soft text-success-fg border border-success hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {t('confirmCashAction')}
                          </button>
                          <button
                            type="button"
                            onClick={() => openReject(item.id)}
                            disabled={isPending}
                            className="text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-surface-2 transition-colors disabled:opacity-50"
                          >
                            {t('rejectAction')}
                          </button>
                        </div>
                      )}
                      {rowError && errorItemId === item.id && (
                        <p className="text-xs text-danger-fg mt-1">{rowError}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
