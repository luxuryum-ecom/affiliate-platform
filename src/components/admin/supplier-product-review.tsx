'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  approveSupplierProduct,
  rejectSupplierProduct,
  type SupplierProductState,
} from '@/app/actions/supplier-products'

const initial: SupplierProductState = { error: null }

interface ApproveFormProps {
  id: string
  publicName: string | null
  publicDescription: string | null
  platformMarginType: string
  platformMarginValue: number | null
  applyPlatformMargin: boolean
  adminNotes: string | null
}

export function ApproveSupplierProductForm({
  id,
  publicName,
  publicDescription,
  platformMarginType,
  platformMarginValue,
  applyPlatformMargin,
  adminNotes,
}: ApproveFormProps) {
  const t = useTranslations('admin.supplierProductReview')
  const [state, action, isPending] = useActionState(approveSupplierProduct, initial)

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

      {state?.error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
          {t('approveSuccess')}
        </p>
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
