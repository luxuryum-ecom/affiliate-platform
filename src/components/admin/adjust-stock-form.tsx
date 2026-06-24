'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { adjustStock, type ManualStockReason } from '@/app/actions/stock'

const MANUAL_REASONS: ManualStockReason[] = [
  'cadeau',
  'casse',
  'echantillon',
  'perte',
  'retour',
  'reappro',
]

const INPUT =
  'w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400'

interface AdjustStockFormProps {
  products: { id: string; name: string }[]
}

export function AdjustStockForm({ products }: AdjustStockFormProps) {
  const t = useTranslations('admin.stock')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<ManualStockReason | ''>('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const qtyNum = parseInt(qty, 10)
    if (!productId || !qtyNum || qtyNum === 0 || !reason) {
      setMessage({ ok: false, text: t('formIncomplete') })
      return
    }

    if (!confirming) {
      setConfirming(true)
      return
    }

    setConfirming(false)
    startTransition(async () => {
      const result = await adjustStock({
        productId,
        qtyDelta: qtyNum,
        note: note.trim() || undefined,
        reason: reason as ManualStockReason,
      })
      if (result.success && result.data) {
        setMessage({ ok: true, text: t('adjustSuccess', { balance: result.data.newBalance }) })
        setProductId('')
        setQty('')
        setReason('')
        setNote('')
        router.refresh()
      } else {
        setMessage({ ok: false, text: result.error ?? 'Erreur' })
      }
    })
  }

  const cancelConfirm = () => setConfirming(false)

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-surface border border-line rounded-xl p-5">
      {/* Produit */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('fieldProduct')}</label>
        <select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value)
            setConfirming(false)
          }}
          className={INPUT}
        >
          <option value="">{t('chooseProduct')}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Quantité */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('fieldQty')}</label>
        <input
          type="number"
          value={qty}
          onChange={(e) => {
            setQty(e.target.value)
            setConfirming(false)
          }}
          placeholder="0"
          className={INPUT}
        />
        <p className="mt-1 text-xs text-muted">{t('qtyHint')}</p>
      </div>

      {/* Raison */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('fieldReason')}</label>
        <select
          value={reason}
          onChange={(e) => {
            setReason(e.target.value as ManualStockReason)
            setConfirming(false)
          }}
          className={INPUT}
        >
          <option value="">{t('chooseReason')}</option>
          {MANUAL_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reason.${r}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('fieldNote')}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={INPUT} />
      </div>

      {/* Message feedback */}
      {message && (
        <p
          className={`text-xs px-3 py-2 rounded-lg ${
            message.ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Confirmation inline */}
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 py-2 bg-danger-soft text-danger-fg text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity border border-danger-fg/20"
          >
            {isPending ? '…' : t('confirmPrompt', { reason: reason || '?', qty: qty })}
          </button>
          <button
            type="button"
            onClick={cancelConfirm}
            className="px-4 py-2 text-sm text-muted border border-line rounded-lg hover:bg-surface-2 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? '…' : t('adjustButton')}
        </button>
      )}
    </form>
  )
}
