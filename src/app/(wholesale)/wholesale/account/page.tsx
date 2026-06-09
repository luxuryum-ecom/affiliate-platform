import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { WholesalerBillingForm } from '@/components/wholesale/billing-form'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              {tc('backToDashboard')}
            </Link>
            <span className="text-gray-300">{tc('breadcrumbSep')}</span>
            <span className="font-semibold text-gray-900 text-sm">{t('pageTitle')}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <LanguageSwitcher variant="light" />
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Profile summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('infoTitle')}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-gray-400">{t('fieldName')}</dt>
              <dd className="text-gray-800 font-medium">{profile?.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">{t('fieldPhone')}</dt>
              <dd className="text-gray-800">{profile?.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">{t('fieldCity')}</dt>
              <dd className="text-gray-800">{profile?.city ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">{t('fieldStatus')}</dt>
              <dd className="text-gray-800 capitalize">{profile?.status}</dd>
            </div>
          </dl>
        </div>

        {/* Billing fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">{t('billingTitle')}</h2>
          <p className="text-xs text-gray-400 mb-4">
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
