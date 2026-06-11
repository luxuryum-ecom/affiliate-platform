import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { WholesalerBillingForm } from '@/components/wholesale/billing-form'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.account')
  return { title: t('metaTitle') }
}

export default async function WholesalerAccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  const t = await getTranslations('wholesale.account')
  const tc = await getTranslations('wholesale.common')

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/wholesale/dashboard"
        backLabel={tc('backToDashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-3xl"
      />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Profile summary */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('infoTitle')}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-faint">{t('fieldName')}</dt>
              <dd className="text-foreground font-medium">{profile?.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('fieldPhone')}</dt>
              <dd className="text-foreground">{profile?.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('fieldCity')}</dt>
              <dd className="text-foreground">{profile?.city ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('fieldStatus')}</dt>
              <dd className="text-foreground capitalize">{profile?.status}</dd>
            </div>
          </dl>
        </div>

        {/* Billing fields */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">{t('billingTitle')}</h2>
          <p className="text-xs text-faint mb-4">
            {t('billingSubtitle')}
          </p>
          <WholesalerBillingForm
            profile={profile}
            labels={{
              fieldCompany: t('fieldCompany'),
              fieldIce: t('fieldIce'),
              fieldRc: t('fieldRc'),
              fieldBillingAddress: t('fieldBillingAddress'),
              companyPlaceholder: t('companyPlaceholder'),
              icePlaceholder: t('icePlaceholder'),
              rcPlaceholder: t('rcPlaceholder'),
              billingAddressPlaceholder: t('billingAddressPlaceholder'),
              saveBilling: t('saveBilling'),
              savingBilling: t('savingBilling'),
              billingUpdated: t('billingUpdated'),
            }}
          />
        </div>
      </main>
    </div>
  )
}
