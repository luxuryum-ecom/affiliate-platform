import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/admin/product-form'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTariffs } from '@/app/actions/tariffs'
import { getRatesMap } from '@/lib/fx'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('admin.productNew')
  return { title: t('metaTitle') }
}

export default async function NewProductPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const t = await getTranslations('admin.productNew')
  const tc = await getTranslations('admin.common')

  const [profileResult, tariffs, rates] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getTariffs(),
    getRatesMap(supabase),
  ])

  const profile = profileResult.data as { full_name: string } | null

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/products"
        backLabel={tc('product')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-foreground mb-6">{t('formTitle')}</h1>
        <div className="bg-surface rounded-xl border border-line p-6">
          <ProductForm tariffs={tariffs} rates={rates} />
        </div>
      </main>
    </div>
  )
}
