import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCities } from '@/app/actions/cities'
import { CreateOrderForm } from '@/components/affiliate/create-order-form'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations } from 'next-intl/server'
import type { Product, City } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('affiliate.ordersNew')
  return { title: t('metaTitle') }
}

type ProductOption = Pick<
  Product,
  | 'id'
  | 'name'
  | 'sell_price'
  | 'commission_amount'
  | 'delivery_fee_mad'
  | 'confirmation_fee_mad'
  | 'packaging_fee_mad'
>

export default async function NewAffiliateOrderPage() {
  const supabase = await createClient()
  const t = await getTranslations('affiliate.ordersNew')
  const tCommon = await getTranslations('affiliate.common')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [profileRes, productsRes, allCities] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).single(),
    supabase
      .from('products_catalog_read') // dette 073 — vue redacted (zéro coût/marge)
      .select('id, name, sell_price, commission_amount, delivery_fee_mad, confirmation_fee_mad, packaging_fee_mad')
      .eq('active', true)
      .eq('approval_status', 'approved')
      .eq('affiliate_enabled', true)
      .eq('availability_type', 'local_stock')
      .order('name'),
    getCities(),
  ])

  const profile = profileRes.data as { full_name: string } | null
  const products = (productsRes.data ?? []) as ProductOption[]
  const cities   = (allCities ?? [])
    .filter((c: Pick<City, 'id' | 'name' | 'delivery_fee_mad' | 'is_active'>) => c.is_active)
    .map((c: Pick<City, 'id' | 'name' | 'delivery_fee_mad' | 'is_active'>) => ({
      id: c.id,
      name: c.name,
      delivery_fee_mad: c.delivery_fee_mad,
    }))

  const formStrings = {
    sectionProduct: t('sectionProduct'),
    fieldProduct: t('fieldProduct'),
    productOption: t.raw('productOption') as string,
    fieldQuantity: t('fieldQuantity'),
    fieldSellPrice: t('fieldSellPrice'),
    priceMinError: t.raw('priceMinError') as string,
    summaryOrderTotal: t('summaryOrderTotal'),
    summaryDelivery: t('summaryDelivery'),
    summaryOps: t('summaryOps'),
    summaryMargin: t('summaryMargin'),
    summaryNote: t('summaryNote'),
    sectionCustomer: t('sectionCustomer'),
    fieldName: t('fieldName'),
    namePlaceholder: t('namePlaceholder'),
    fieldPhone: t('fieldPhone'),
    phonePlaceholder: t('phonePlaceholder'),
    fieldCity: t('fieldCity'),
    cityPlaceholder: t('cityPlaceholder'),
    cityOption: t.raw('cityOption') as string,
    cityFreeInput: t('cityFreeInput'),
    fieldAddress: t('fieldAddress'),
    addressPlaceholder: t('addressPlaceholder'),
    sectionSource: t('sectionSource'),
    fieldSource: t('fieldSource'),
    sourceWhatsapp: t('sourceWhatsapp'),
    sourcePhone: t('sourcePhone'),
    sourceManual: t('sourceManual'),
    fieldNotes: t('fieldNotes'),
    notesPlaceholder: t('notesPlaceholder'),
    backButton: t('backButton'),
    submitButton: t('submitButton'),
    submitting: t('submitting'),
    restockingWarning: t('restockingWarning'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/affiliate/orders"
        backLabel={t('backLink')}
        userName={profile?.full_name}
        signOutLabel={tCommon('signOut')}
        maxWidth="max-w-3xl"
      />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('emptyProducts')}</p>
            <Link
              href="/affiliate/products"
              className="mt-3 inline-block text-sm text-gold-500 hover:text-gold-600 hover:underline"
            >
              {t('viewCatalog')}
            </Link>
          </div>
        ) : (
          <CreateOrderForm products={products} cities={cities} strings={formStrings} />
        )}
      </main>
    </div>
  )
}
