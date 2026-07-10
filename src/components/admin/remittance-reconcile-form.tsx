'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { reconcileRemittance } from '@/app/actions/remittances'
import { formatMAD } from '@/lib/utils'

/**
 * Carte de réconciliation pour UN livreur (groupe). Reçoit uniquement des données
 * sérialisables (strings/nombres) — RÈGLE ABSOLUE CLAUDE.md #2 : jamais de fonction
 * passée à un Client Component. `reconcileRemittance` est importé directement (server
 * action 'use server'), pas transmis en prop.
 */

export interface RemittanceOrderRow {
  orderId: string
  reference: string
  expectedAmountMad: number
  city: string
  deliveredAtLabel: string
  affiliateCommissionMad: number
  affiliateName: string
}

interface RemittanceReconcileFormProps {
  courierCode: string
  courierDisplayName: string
  orders: RemittanceOrderRow[]
}

const INPUT =
  'w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2'

export function RemittanceReconcileForm({
  courierCode,
  courierDisplayName,
  orders,
}: RemittanceReconcileFormProps) {
  const t = useTranslations('admin.remittances')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [checked, setChecked] = useState<Set<string>>(() => new Set(orders.map((o) => o.orderId)))
  const [courierName, setCourierName] = useState(courierDisplayName)
  const [receivedAmount, setReceivedAmount] = useState<string>('')
  const [receivedTouched, setReceivedTouched] = useState(false)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ count: number } | null>(null)

  const totalExpectedChecked = useMemo(
    () => orders.filter((o) => checked.has(o.orderId)).reduce((s, o) => s + o.expectedAmountMad, 0),
    [orders, checked],
  )

  // Montant reçu pré-rempli au total attendu tant que l'admin n'y a pas touché.
  const receivedValue = receivedTouched ? receivedAmount : String(totalExpectedChecked)
  const receivedNumber = Number(receivedValue.replace(',', '.'))
  const hasValidReceived = Number.isFinite(receivedNumber) && receivedNumber >= 0
  const gap = hasValidReceived ? totalExpectedChecked - receivedNumber : 0

  function toggleOrder(orderId: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  function toggleAll() {
    setChecked((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.orderId))))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const orderIds = Array.from(checked)
    if (orderIds.length === 0) {
      setError(t('validationNoOrders'))
      return
    }
    if (!hasValidReceived) {
      setError(t('validationNoOrders'))
      return
    }
    startTransition(async () => {
      const res = await reconcileRemittance({
        courierName: courierName.trim() || courierDisplayName,
        receivedAmount: receivedNumber,
        orderIds,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      setSuccess({ count: orderIds.length })
      router.refresh()
    })
  }

  if (success) {
    return (
      <div className="bg-success-soft border border-success rounded-xl p-5">
        <p className="text-sm font-semibold text-success-fg">{t('successTitle')}</p>
        <p className="text-xs text-success-fg mt-1">
          {t('successMessage', { count: success.count })}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 text-xs text-success-fg underline hover:no-underline"
        >
          {t('successAnother')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tableau des commandes du groupe */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-faint text-left border-b border-line">
              <th className="py-2 px-1 font-medium">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={checked.size === orders.length && orders.length > 0}
                    onChange={toggleAll}
                    aria-label={t('selectAll')}
                    className="rounded border-line"
                  />
                  <span className="hidden sm:inline">{t('colSelect')}</span>
                </label>
              </th>
              <th className="py-2 px-1 font-medium">{t('colRef')}</th>
              <th className="py-2 px-1 font-medium">{t('colCity')}</th>
              <th className="py-2 px-1 font-medium">{t('colDeliveredAt')}</th>
              <th className="py-2 px-1 font-medium text-right">{t('colExpected')}</th>
              <th className="py-2 px-1 font-medium text-right">{t('colCommission')}</th>
              <th className="py-2 px-1 font-medium">{t('colAffiliate')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderId} className="border-b border-line/60">
                <td className="py-2 px-1">
                  <input
                    type="checkbox"
                    checked={checked.has(o.orderId)}
                    onChange={() => toggleOrder(o.orderId)}
                    aria-label={o.reference}
                    className="rounded border-line"
                  />
                </td>
                <td className="py-2 px-1 font-medium text-foreground tabular-nums">{o.reference}</td>
                <td className="py-2 px-1 text-muted">{o.city}</td>
                <td className="py-2 px-1 text-muted tabular-nums">{o.deliveredAtLabel}</td>
                <td className="py-2 px-1 text-right tabular-nums text-foreground">
                  {formatMAD(o.expectedAmountMad)}
                </td>
                <td className="py-2 px-1 text-right tabular-nums text-muted">
                  {formatMAD(o.affiliateCommissionMad)}
                </td>
                <td className="py-2 px-1 text-muted">{o.affiliateName || t('noAffiliate')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formulaire de versement */}
      <div className="grid sm:grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor={`courierName-${courierCode}`}>
            {t('courierNameLabel')}
          </label>
          <input
            id={`courierName-${courierCode}`}
            type="text"
            value={courierName}
            disabled={isPending}
            onChange={(e) => setCourierName(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor={`received-${courierCode}`}>
            {t('receivedAmountLabel')}
          </label>
          <input
            id={`received-${courierCode}`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={receivedValue}
            disabled={isPending}
            onChange={(e) => {
              setReceivedTouched(true)
              setReceivedAmount(e.target.value)
            }}
            className={`${INPUT} tabular-nums`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor={`reference-${courierCode}`}>
            {t('referenceLabel')}
          </label>
          <input
            id={`reference-${courierCode}`}
            type="text"
            value={reference}
            disabled={isPending}
            placeholder={t('referencePlaceholder')}
            onChange={(e) => setReference(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor={`notes-${courierCode}`}>
            {t('notesLabel')}
          </label>
          <input
            id={`notes-${courierCode}`}
            type="text"
            value={notes}
            disabled={isPending}
            placeholder={t('notesPlaceholder')}
            onChange={(e) => setNotes(e.target.value)}
            className={INPUT}
          />
        </div>
      </div>

      {/* Écart en direct */}
      {hasValidReceived && checked.size > 0 && (
        gap === 0 ? (
          <p className="text-xs font-medium text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2 inline-block">
            {t('gapSettled')}
          </p>
        ) : gap > 0 ? (
          <div className="text-xs bg-warning-soft border border-warning rounded-lg px-3 py-2">
            <p className="font-semibold text-warning-fg">{t('gapCredit', { amount: formatMAD(gap) })}</p>
            <p className="text-warning-fg mt-0.5">{t('gapCreditExplain')}</p>
          </div>
        ) : (
          <p className="text-xs text-warning-fg bg-warning-soft border border-warning rounded-lg px-3 py-2">
            {t('gapOverpaid')}
          </p>
        )
      )}

      {error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || checked.size === 0}
        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {isPending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
