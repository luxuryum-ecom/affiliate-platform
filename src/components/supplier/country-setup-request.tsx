'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { requestCountrySetup, type CountrySetupState } from '@/app/actions/users'

const initialState: CountrySetupState = { error: null, success: false }

interface Props {
  /** Le fournisseur a déjà signalé sa demande (flag persistant, migration 066). */
  alreadyRequested: boolean
}

/**
 * Transforme le mur « Pays non configuré » en demande actionnable : le fournisseur
 * signale qu'il attend la configuration de son pays par l'admin. Ne touche PAS
 * country_code (figé) — pose seulement country_setup_requested = true.
 */
export function CountrySetupRequest({ alreadyRequested }: Props) {
  const t = useTranslations('supplier.productNew')
  const [state, action, isPending] = useActionState(requestCountrySetup, initialState)

  const requested = alreadyRequested || state.success

  return (
    <div className="bg-warning-soft border border-warning rounded-xl p-5 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-warning-fg">{t('noCountryTitle')}</p>
        <p className="text-sm text-warning-fg">{t('noCountryBody')}</p>
      </div>

      {requested ? (
        <p className="text-sm font-medium text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2">
          ✓ {t('noCountryRequestSent')}
        </p>
      ) : (
        <form action={action}>
          <button
            type="submit"
            disabled={isPending}
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? t('noCountryRequesting') : t('noCountryRequestCta')}
          </button>
        </form>
      )}

      {state.error && (
        <p className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
    </div>
  )
}
