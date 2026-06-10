'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { requestInvoice } from '@/app/actions/invoice'
import type { ActionState } from '@/types/orders'
import type { Profile } from '@/types/database'

const initial: ActionState = { error: null, success: false }

interface Props {
  orderId: string
  profile: Pick<Profile, 'company_name' | 'ice' | 'registre_commerce' | 'billing_address'>
}

export function InvoiceRequestForm({ orderId, profile }: Props) {
  const t = useTranslations('wholesale.orderDetail')
  const [state, action, isPending] = useActionState(requestInvoice, initial)
  const [open, setOpen] = useState(false)

  if (state.success) {
    return (
      <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
        {t('invoiceFormSuccess')}
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
        >
          {t('invoiceFormCta')}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{t('invoiceFormTitle')}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          {t('invoiceFormCancel')}
        </button>
      </div>

      <p className="text-xs text-gray-500">{t('invoiceFormHint')}</p>

      <form action={action} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('invoiceFormCompany')}
            </label>
            <input
              name="company_name"
              defaultValue={profile.company_name ?? ''}
              placeholder={t('invoiceFormCompanyPlaceholder')}
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('invoiceFormIce')}
            </label>
            <input
              name="ice"
              defaultValue={profile.ice ?? ''}
              placeholder={t('invoiceFormIcePlaceholder')}
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('invoiceFormRc')}
            </label>
            <input
              name="registre_commerce"
              defaultValue={profile.registre_commerce ?? ''}
              placeholder={t('invoiceFormRcPlaceholder')}
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('invoiceFormAddress')}
            </label>
            <input
              name="billing_address"
              defaultValue={profile.billing_address ?? ''}
              placeholder={t('invoiceFormAddressPlaceholder')}
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        {state.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? t('invoiceFormSubmitting') : t('invoiceFormSubmit')}
        </button>
      </form>
    </div>
  )
}
