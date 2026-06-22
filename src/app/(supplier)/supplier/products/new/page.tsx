import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { SubmitProductForm } from '@/components/supplier/submit-product-form'
import { CountrySetupRequest } from '@/components/supplier/country-setup-request'
import { getProductLimitStatus } from '@/app/actions/premium'
import { resolveSupplierCurrency } from '@/lib/supplier-pricing'
import { getCategoryDisplayList } from '@/lib/categories/display'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplier.productNew')
  return { title: t('metaTitle') }
}

export default async function SupplierProductNewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, limitStatus, currency, categories] = await Promise.all([
    supabase.from('profiles').select('full_name, country_setup_requested').eq('id', user.id).single(),
    getProductLimitStatus(user.id),
    resolveSupplierCurrency(supabase, user.id),
    getCategoryDisplayList(),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name' | 'country_setup_requested'> | null

  const t = await getTranslations('supplier.productNew')
  const tc = await getTranslations('supplier.common')
  const tp = await getTranslations('supplier.products')

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/supplier/products"
        backLabel={tp('breadcrumb')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-2xl"
      />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('pageSubtitle')}</p>
        </div>

        {/* Limite produits atteinte → message ROUGE (tokens danger) */}
        {limitStatus.isAtLimit ? (
          <div className="bg-danger-soft border border-danger rounded-xl p-5 space-y-2">
            <p className="text-sm font-semibold text-danger-fg">{t('limitTitle')}</p>
            <p className="text-sm text-danger-fg">
              {t('limitBody', {
                plan: limitStatus.planName,
                max: limitStatus.maxAllowed,
                current: limitStatus.currentCount,
              })}
            </p>
            <Link
              href="/supplier/premium"
              className="inline-block mt-2 text-sm bg-danger text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('limitCta')}
            </Link>
          </div>
        ) : (
          <>
            {/* Proche de la limite → avertissement (tokens warning) */}
            {!limitStatus.isUnlimited && limitStatus.currentCount >= limitStatus.maxAllowed - 1 && (
              <div className="bg-warning-soft border border-warning rounded-xl p-4 mb-5 flex items-center justify-between gap-3">
                <p className="text-sm text-warning-fg">
                  {t('nearLimitBody', {
                    remaining: limitStatus.maxAllowed - limitStatus.currentCount,
                    plan: limitStatus.planName,
                  })}
                </p>
                <Link href="/supplier/premium" className="text-xs text-warning-fg underline shrink-0">
                  {t('nearLimitCta')}
                </Link>
              </div>
            )}

            <div className="bg-surface rounded-xl border border-line p-6">
              {currency === null ? (
                <CountrySetupRequest alreadyRequested={profile?.country_setup_requested ?? false} />
              ) : (
                <SubmitProductForm currency={currency} categories={categories} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
