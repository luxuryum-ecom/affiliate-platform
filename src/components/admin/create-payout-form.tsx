'use client'

import { useActionState, useEffect, useState } from 'react'
import { createPayout, type CreatePayoutState } from '@/app/actions/payouts'
import { formatMAD } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface Affiliate {
  id: string
  full_name: string
  approvedCommissionTotal: number
  approvedCommissionCount: number
}

interface CreatePayoutFormProps {
  affiliates: Affiliate[]
}

const initial: CreatePayoutState = { error: null, success: false, payoutId: null, amount: null }

const INPUT =
  'w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2'

export function CreatePayoutForm({ affiliates }: CreatePayoutFormProps) {
  const t = useTranslations('admin.createPayoutForm')
  const [state, action, isPending] = useActionState(createPayout, initial)
  const [selectedId, setSelectedId] = useState('')

  // Clé d'idempotence stable pour ce rendu du formulaire : un double-clic soumet
  // la MÊME clé → la RPC ne crée qu'un seul versement. Générée côté client (après
  // montage) pour éviter tout décalage d'hydratation SSR.
  const [idempotencyKey, setIdempotencyKey] = useState('')
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID())
  }, [])

  const eligibleAffiliates = affiliates.filter((a) => a.approvedCommissionCount > 0)
  const selected = eligibleAffiliates.find((a) => a.id === selectedId) ?? null

  if (state.success) {
    return (
      <div className="bg-success-soft border border-success rounded-xl p-5">
        <p className="text-sm font-semibold text-success-fg">{t('successTitle')}</p>
        {/* ARGENT: formatMAD inchangé */}
        <p className="text-xs text-success-fg mt-1">
          {t('successAmount', { amount: formatMAD(state.amount ?? 0) })}
        </p>
        <p className="text-xs text-success-fg mt-0.5">
          {t('successRef', { ref: state.payoutId?.slice(0, 8).toUpperCase() ?? '' })}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 text-xs text-success-fg underline hover:no-underline"
        >
          {t('successCreateAnother')}
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      {/* Clé d'idempotence — anti double-versement. Non modifiable par l'utilisateur. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">
          {t('affiliateLabel')} <span className="text-danger-fg">{t('affiliateRequired')}</span>
        </label>
        <select
          name="affiliateId"
          required
          disabled={isPending}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={INPUT}
        >
          <option value="">{t('affiliatePlaceholder')}</option>
          {eligibleAffiliates.map((a) => (
            <option key={a.id} value={a.id}>
              {/* ARGENT: formatMAD inchangé — option text ne supporte pas JSX, interpolation string */}
              {`${a.full_name} — ${formatMAD(a.approvedCommissionTotal)}`}
            </option>
          ))}
        </select>
        {eligibleAffiliates.length === 0 && (
          <p className="text-xs text-warning-fg mt-1">
            {t('noEligible')}
          </p>
        )}
      </div>

      {/* Montant DÉRIVÉ — lecture seule. L'admin ne saisit rien, il valide. */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">
          {t('amountLabel')}
        </label>
        {/* ARGENT: formatMAD inchangé — affichage lecture seule */}
        <div className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface-2 tabular-nums font-semibold text-foreground">
          {selected ? formatMAD(selected.approvedCommissionTotal) : '—'}
        </div>
        <p className="text-xs text-faint mt-1">
          {t('amountNote')}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">
          {t('referenceLabel')}
        </label>
        <input
          name="reference"
          type="text"
          disabled={isPending}
          placeholder={t('referencePlaceholder')}
          className={INPUT}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">{t('notesLabel')}</label>
        <input
          name="notes"
          type="text"
          disabled={isPending}
          placeholder={t('notesPlaceholder')}
          className={INPUT}
        />
      </div>

      {state.error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <p className="text-xs text-warning-fg bg-warning-soft border border-warning rounded-lg px-3 py-2">
        {t('warning')}
      </p>

      <button
        type="submit"
        disabled={isPending || !selected || !idempotencyKey}
        className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {isPending
          ? t('submitting')
          : selected
            /* ARGENT: formatMAD inchangé */
            ? t('submitWithAmount', { amount: formatMAD(selected.approvedCommissionTotal) })
            : t('submit')}
      </button>
    </form>
  )
}
