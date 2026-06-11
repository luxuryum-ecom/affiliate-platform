import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/admin/product-form'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTariffs } from '@/app/actions/tariffs'
import { getRatesMap } from '@/lib/fx'
import { getTranslations } from 'next-intl/server'
import type { Product } from '@/types/database'

interface EditProductPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata() {
  const t = await getTranslations('admin.productEdit')
  return { title: t('metaTitle') }
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const t = await getTranslations('admin.productEdit')
  const tc = await getTranslations('admin.common')
  const tp = await getTranslations('admin.products')

  const [profileResult, productResult, tariffs, rates] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('products').select('*').eq('id', id).single(),
    getTariffs(),
    getRatesMap(supabase),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const product = productResult.data as Product | null

  if (!product) notFound()

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={product.name}
        backHref="/admin/products"
        backLabel={tp('backProducts')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              product.active
                ? 'bg-success-soft text-success-fg border-success'
                : 'bg-surface-2 text-faint border-line'
            }`}
          >
            {product.active ? t('statusActive') : t('statusDraft')}
          </span>
        </div>

        <div className="bg-surface rounded-xl border border-line p-6">
          <ProductForm product={product} tariffs={tariffs} rates={rates} />
        </div>
      </main>
    </div>
  )
}
