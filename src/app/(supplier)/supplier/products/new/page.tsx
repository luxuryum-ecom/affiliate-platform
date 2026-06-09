import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { SubmitProductForm } from '@/components/supplier/submit-product-form'
import { getProductLimitStatus } from '@/app/actions/premium'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplier.productNew')
  return { title: t('metaTitle') }
}

export default async function SupplierProductNewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, limitStatus] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    getProductLimitStatus(user.id),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null

  const t = await getTranslations('supplier.productNew')
  const tc = await getTranslations('supplier.common')
  const tp = await getTranslations('supplier.products')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/products" className="text-gray-400 hover:text-gray-600 text-sm">
              ← {tp('breadcrumb')}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('pageSubtitle')}
          </p>
        </div>

        {/* Product limit warning */}
        {limitStatus.isAtLimit ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-2">
            <p className="text-sm font-semibold text-red-700">{t('limitTitle')}</p>
            <p className="text-sm text-red-600">
              {t('limitBody', {
                plan: limitStatus.planName,
                max: limitStatus.maxAllowed,
                current: limitStatus.currentCount,
              })}
            </p>
            <Link
              href="/supplier/premium"
              className="inline-block mt-2 text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              {t('limitCta')}
            </Link>
          </div>
        ) : (
          <>
            {/* Soft warning when near limit */}
            {!limitStatus.isUnlimited && limitStatus.currentCount >= limitStatus.maxAllowed - 1 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-center justify-between gap-3">
                <p className="text-sm text-amber-700">
                  {t('nearLimitBody', {
                    remaining: limitStatus.maxAllowed - limitStatus.currentCount,
                    plan: limitStatus.planName,
                  })}
                </p>
                <Link href="/supplier/premium" className="text-xs text-amber-700 underline shrink-0">
                  {t('nearLimitCta')}
                </Link>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <SubmitProductForm />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
