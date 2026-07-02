'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  approveSupplierProduct,
  rejectSupplierProduct,
  type SupplierProductState,
} from '@/app/actions/supplier-products'

const initial: SupplierProductState = { error: null }

// LOT 4 — parité stricte avec le serveur (MAX_MOQ_TIERS_FORM = 20).
const MAX_TIER_ROWS = 20

// Clés d'erreur i18n renvoyées par le serveur (traduites côté client). Toute autre
// valeur d'`error` est une chaîne legacy → affichée verbatim (repli sûr).
const MOQ_ERROR_KEYS = new Set([
  'moqRowInvalid',
  'moqTiersRejected',
  'moqFirstTierMismatch',
  'moqInvalid',
])

interface EditableTier {
  qty: string
  price: string
}

interface ApproveFormProps {
  id: string
  publicName: string | null
  publicDescription: string | null
  platformMarginType: string
  platformMarginValue: number | null
  applyPlatformMargin: boolean
  adminNotes: string | null
  // LOT 4 — éditeur MOQ + paliers
  minQuantity: number
  sourceCurrency: string | null
  fxRateSourceToMad: number | null
  existingTiers: EditableTier[]
}

export function ApproveSupplierProductForm({
  id,
  publicName,
  publicDescription,
  platformMarginType,
  platformMarginValue,
  applyPlatformMargin,
  adminNotes,
  minQuantity,
  sourceCurrency,
  fxRateSourceToMad,
  existingTiers,
}: ApproveFormProps) {
  const t = useTranslations('admin.supplierProductReview')
  const [state, action, isPending] = useActionState(approveSupplierProduct, initial)

  // Éditeur paliers PRÉ-REMPLI avec l'existant → « ne rien changer » round-trippe à
  // l'identique (zéro wipe). N lignes dynamiques (add/remove, plafond MAX_TIER_ROWS).
  const [rows, setRows] = useState<EditableTier[]>(existingTiers)

  const addRow = () =>
    setRows((r) => (r.length >= MAX_TIER_ROWS ? r : [...r, { qty: '', price: '' }]))
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx))
  const updateRow = (idx: number, patch: Partial<EditableTier>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)))

  // MAD LECTURE SEULE (affichage pur, jamais stocké, hors ledger) : conversion FX
  // indicative AVANT marge. Number() sur une chaîne money validée (≤2 déc) = pattern
  // établi (money.ts), pas de parseFloat. Cas douteux → null (aucun MAD fabriqué).
  const madOf = (price: string): number | null => {
    if (!/^\d+(\.\d{1,2})?$/.test(price.trim())) return null
    if (fxRateSourceToMad == null || !(fxRateSourceToMad > 0)) return null
    const n = Number(price)
    if (!(n > 0)) return null
    return Math.round(n * fxRateSourceToMad)
  }

  const currencyLabel = sourceCurrency ?? t('sourceCurrencyFallback')
  const errorText =
    state?.error && MOQ_ERROR_KEYS.has(state.error) ? t(state.error) : state?.error

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {t('publicName')}
        </label>
        <input
          name="public_name"
          type="text"
          defaultValue={publicName ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-muted"
          placeholder={t('publicNamePlaceholder')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {t('publicDescription')}
        </label>
        <textarea
          name="public_description"
          rows={3}
          defaultValue={publicDescription ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-muted resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('marginType')}
          </label>
          <select
            name="platform_margin_type"
            defaultValue={platformMarginType}
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-muted"
          >
            <option value="percentage">{t('marginTypePercentage')}</option>
            <option value="fixed">{t('marginTypeFixed')}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('marginValue')}
          </label>
          <input
            name="platform_margin_value"
            type="number"
            min={0}
            step="0.01"
            defaultValue={platformMarginValue ?? 15}
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-muted"
            placeholder={t('marginValuePlaceholder')}
          />
        </div>
      </div>

      {/* Toggle marge — AFFICHAGE VITRINE UNIQUEMENT (jamais le prix facturé). */}
      <div className="rounded-lg border border-line bg-surface-2 p-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="apply_platform_margin"
            defaultChecked={applyPlatformMargin}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-line text-gold-500 focus:ring-gold-400"
          />
          <span className="text-sm">
            <span className="block font-medium text-foreground">{t('applyMarginLabel')}</span>
            <span className="block text-xs text-muted mt-0.5">{t('applyMarginHint')}</span>
          </span>
        </label>
      </div>

      {/* ── LOT 4 — Éditeur MOQ + paliers dégressifs (devise fournisseur) ── */}
      <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-3">
        <input type="hidden" name="moq_editor_present" value="1" />
        <input type="hidden" name="moq_tier_count" value={rows.length} />

        <div>
          <p className="text-sm font-medium text-foreground">{t('moqSectionTitle')}</p>
          <p className="text-xs text-muted mt-0.5">{t('moqSectionHint')}</p>
        </div>

        <div className="w-1/2">
          <label className="block text-sm font-medium text-foreground mb-1">
            {t('moqLabel')}
          </label>
          <input
            name="min_quantity"
            type="number"
            min={1}
            step={1}
            defaultValue={minQuantity}
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-muted"
          />
        </div>

        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-xs text-muted italic">{t('tierEmptyHint')}</p>
          )}
          {rows.map((row, i) => {
            const mad = madOf(row.price)
            return (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-faint mb-1">{t('tierQtyLabel')}</label>
                  <input
                    name={`tier_${i}_qty`}
                    type="number"
                    min={1}
                    step={1}
                    value={row.qty}
                    onChange={(e) => updateRow(i, { qty: e.target.value })}
                    disabled={isPending}
                    className="w-full px-2.5 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2 disabled:text-muted"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-faint mb-1">
                    {t('tierPriceLabel', { currency: currencyLabel })}
                  </label>
                  <input
                    name={`tier_${i}_price`}
                    type="text"
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) => updateRow(i, { price: e.target.value })}
                    disabled={isPending}
                    className="w-full px-2.5 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2 disabled:text-muted"
                  />
                  <span className="block text-xs text-faint mt-0.5 tabular-nums">
                    {mad != null ? t('tierMadHint', { mad }) : t('tierMadUnknown')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={isPending}
                  className="mb-6 px-2.5 py-2 text-xs text-danger-fg border border-danger rounded-lg hover:bg-danger-soft transition-colors disabled:opacity-50"
                  aria-label={t('removeTierBtn')}
                >
                  {t('removeTierBtn')}
                </button>
              </div>
            )
          })}
          {rows.length < MAX_TIER_ROWS && (
            <button
              type="button"
              onClick={addRow}
              disabled={isPending}
              className="text-xs text-gold-600 hover:text-gold-700 font-medium disabled:opacity-50"
            >
              {t('addTierBtn')}
            </button>
          )}
        </div>
        <p className="text-xs text-faint">{t('moqMadNote')}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {t('adminNotes')}
        </label>
        <textarea
          name="admin_notes"
          rows={2}
          defaultValue={adminNotes ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-muted resize-none"
          placeholder={t('adminNotesPlaceholder')}
        />
      </div>

      {errorText && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {errorText}
        </p>
      )}
      {state?.success && (
        <>
          <p className="text-sm text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
            {t('approveSuccess')}
          </p>
          {state.priceBaseBelowFirstTier && (
            <p className="text-sm text-warning-fg bg-warning-soft border border-warning px-3 py-2 rounded-lg">
              {t('priceBaseBelowFirstTierWarning')}
            </p>
          )}
        </>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? t('approving') : t('approveBtn')}
      </button>
    </form>
  )
}

interface RejectFormProps {
  id: string
  adminNotes: string | null
}

export function RejectSupplierProductForm({ id, adminNotes }: RejectFormProps) {
  const t = useTranslations('admin.supplierProductReview')
  const [state, action, isPending] = useActionState(rejectSupplierProduct, initial)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {t('blockReason')}
        </label>
        <textarea
          name="admin_notes"
          rows={2}
          defaultValue={adminNotes ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-muted resize-none"
          placeholder={t('blockReasonPlaceholder')}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
          {t('blockSuccess')}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-danger-soft text-danger-fg border border-danger text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? t('blocking') : t('blockBtn')}
      </button>
    </form>
  )
}
