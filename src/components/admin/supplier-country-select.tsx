'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { setSupplierCountry, type CountrySetupState } from '@/app/actions/users'
import { SUPPLIER_COUNTRIES } from '@/lib/supplier-countries'

const initialState: CountrySetupState = { error: null, success: false }

interface Props {
  profileId: string
  currentCountry: string | null
  /** Le fournisseur a explicitement demandé sa configuration (flag migration 066). */
  requested: boolean
}

/**
 * Édition admin du pays d'un fournisseur. Seul l'admin peut écrire country_code
 * (figé pour le fournisseur, trigger migration 054). Débloque l'onboarding.
 */
export function SupplierCountrySelect({ profileId, currentCountry, requested }: Props) {
  const t = useTranslations('admin.userDetail')
  const [state, action, isPending] = useActionState(setSupplierCountry, initialState)

  return (
    <div className="space-y-2">
      {!currentCountry && requested && (
        <p className="text-xs text-warning-fg bg-warning-soft border border-warning rounded-lg px-3 py-2">
          {t('requestedNotice')}
        </p>
      )}
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="profileId" value={profileId} />
        <select
          name="country_code"
          defaultValue={currentCountry ?? ''}
          required
          disabled={isPending}
          className="px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:opacity-60"
        >
          <option value="" disabled>{t('placeholder')}</option>
          {SUPPLIER_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.label} ({c.currency})
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? t('saving') : t('save')}
        </button>
      </form>
      {state.success && (
        <p className="text-xs text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2">
          {t('saved')}
        </p>
      )}
      {state.error && (
        <p className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
    </div>
  )
}
