'use client'

import { useActionState } from 'react'
import { addSupplierIssue } from '@/app/actions/supplier-issues'
import { useTranslations } from 'next-intl'
import type { Profile } from '@/types/database'

type Props = {
  suppliers: Pick<Profile, 'id' | 'full_name'>[]
}

export default function AddIssueForm({ suppliers }: Props) {
  const t = useTranslations('admin.addIssueForm')
  const [state, action, isPending] = useActionState(addSupplierIssue, { error: null })

  const issueTypes = [
    { value: 'delay',                  label: t('issueDelay') },
    { value: 'quality_problem',        label: t('issueQuality') },
    { value: 'wrong_quantity',         label: t('issueQuantity') },
    { value: 'communication_problem',  label: t('issueCommunication') },
    { value: 'other',                  label: t('issueOther') },
  ]

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
          {t('success')}
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('supplierLabel')}</label>
          <select
            name="supplier_id"
            required
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="">{t('selectPlaceholder')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{t('issueTypeLabel')}</label>
          <select
            name="issue_type"
            required
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="">{t('selectPlaceholder')}</option>
            {issueTypes.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {t('deliveryDaysLabel')}
            <span className="text-faint font-normal ml-1">{t('deliveryDaysHint')}</span>
          </label>
          <input
            type="number"
            name="delivery_days"
            min={1}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            placeholder={t('deliveryDaysPlaceholder')}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {t('notesLabel')}
            <span className="text-faint font-normal ml-1">{t('notesHint')}</span>
          </label>
          <input
            type="text"
            name="notes"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            placeholder={t('notesPlaceholder')}
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  )
}
