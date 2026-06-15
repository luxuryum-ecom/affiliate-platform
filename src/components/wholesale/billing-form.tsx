'use client'

import { useActionState } from 'react'
import { updateWholesalerBilling } from '@/app/actions/profile'
import type { Profile } from '@/types/database'

interface BillingFormLabels {
  fieldPhone: string
  fieldCity: string
  phonePlaceholder: string
  cityPlaceholder: string
  phoneHelp: string
  fieldCompany: string
  fieldIce: string
  fieldRc: string
  fieldBillingAddress: string
  companyPlaceholder: string
  icePlaceholder: string
  rcPlaceholder: string
  billingAddressPlaceholder: string
  saveBilling: string
  savingBilling: string
  billingUpdated: string
}

interface Props {
  profile: Profile | null
  labels?: BillingFormLabels
}

const defaultLabels: BillingFormLabels = {
  fieldPhone: 'Téléphone',
  fieldCity: 'Ville',
  phonePlaceholder: '+212600000000',
  cityPlaceholder: 'Ex : Casablanca',
  phoneHelp: 'Format international avec indicatif pays.',
  fieldCompany: 'Raison sociale / Nom de la société',
  fieldIce: "ICE (Identifiant Commun de l'Entreprise)",
  fieldRc: 'Registre de commerce (RC)',
  fieldBillingAddress: 'Adresse de facturation',
  companyPlaceholder: 'Ex : Sté Benali & Fils SARL',
  icePlaceholder: '000000000000000',
  rcPlaceholder: 'Ex : 123456',
  billingAddressPlaceholder: 'Ex : 12 Rue de la Liberté, Casablanca 20000',
  saveBilling: 'Enregistrer',
  savingBilling: 'Enregistrement…',
  billingUpdated: 'Informations de facturation mises à jour.',
}

export function WholesalerBillingForm({ profile, labels = defaultLabels }: Props) {
  const [state, action, isPending] = useActionState(updateWholesalerBilling, {
    error: null,
    success: false,
  })

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="bg-danger-soft border border-danger text-danger-fg text-sm rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="bg-success-soft border border-success text-success-fg text-sm rounded-xl px-4 py-3">
          {labels.billingUpdated}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="phone">
            {labels.fieldPhone}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={profile?.phone ?? ''}
            placeholder={labels.phonePlaceholder}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint text-start"
          />
          <p className="mt-1 text-xs text-faint">{labels.phoneHelp}</p>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="city">
            {labels.fieldCity}
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={profile?.city ?? ''}
            placeholder={labels.cityPlaceholder}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs text-muted mb-1" htmlFor="company_name">
            {labels.fieldCompany}
          </label>
          <input
            id="company_name"
            name="company_name"
            type="text"
            defaultValue={profile?.company_name ?? ''}
            placeholder={labels.companyPlaceholder}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="ice">
            {labels.fieldIce}
          </label>
          <input
            id="ice"
            name="ice"
            type="text"
            defaultValue={profile?.ice ?? ''}
            placeholder={labels.icePlaceholder}
            maxLength={20}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="registre_commerce">
            {labels.fieldRc}
          </label>
          <input
            id="registre_commerce"
            name="registre_commerce"
            type="text"
            defaultValue={profile?.registre_commerce ?? ''}
            placeholder={labels.rcPlaceholder}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs text-muted mb-1" htmlFor="billing_address">
            {labels.fieldBillingAddress}
          </label>
          <textarea
            id="billing_address"
            name="billing_address"
            rows={2}
            defaultValue={profile?.billing_address ?? ''}
            placeholder={labels.billingAddressPlaceholder}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none bg-surface text-foreground placeholder:text-faint"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? labels.savingBilling : labels.saveBilling}
        </button>
      </div>
    </form>
  )
}
