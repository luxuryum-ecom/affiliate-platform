import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD, getWholesaleTier } from '@/lib/utils'
import { CartItemRow } from '@/components/wholesale/cart-item-row'
import { SubmitWholesaleOrderForm } from '@/components/wholesale/submit-order-form'
import { WhatsAppButton } from '@/components/wholesale/whatsapp-button'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type { WholesaleCartItemWithProduct } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.cart')
  return { title: t('metaTitle') }
}

export default async function WholesaleCartPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [profileResult, cartResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase
      .from('wholesale_cart_items')
      .select('*, product:products(*)')
      .eq('buyer_id', user!.id)
      .order('added_at', { ascending: true }),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const items = (cartResult.data ?? []) as unknown as WholesaleCartItemWithProduct[]

  const t = await getTranslations('wholesale.cart')
  const tc = await getTranslations('wholesale.common')

  // Server-side total — accurate snapshot used for WhatsApp message
  const total = items.reduce((sum, item) => {
    const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
    const unitPrice = tier ? tier.price_per_unit : item.product.sell_price
    return sum + unitPrice * item.quantity
  }, 0)

  const WHATSAPP_PHONE =
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/wholesale/products"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              {tc('backToCatalog')}
            </Link>
            <span className="text-gray-300">{tc('breadcrumbSep')}</span>
            <span className="font-semibold text-gray-900 text-sm">{t('pageTitle')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <LanguageSwitcher variant="light" />
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-6">
          {t('pageTitle')}
          {items.length > 0 && (
            <span className="ms-2 text-sm font-normal text-gray-400">
              {t('itemCount', { count: items.length })}
            </span>
          )}
        </h1>

        {items.length === 0 ? (
          /* Empty cart */
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-4">
            <p className="text-3xl">🛒</p>
            <p className="text-sm text-gray-500">{t('emptyTitle')}</p>
            <Link
              href="/wholesale/products"
              className="inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              {t('browseCatalog')}
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Cart items */}
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow key={item.id} item={item} />
              ))}
            </div>

            {/* Order summary */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">{t('summary')}</h2>

              {/* Line items */}
              <ul className="space-y-2">
                {items.map((item) => {
                  const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
                  const unitPrice = tier ? tier.price_per_unit : item.product.sell_price
                  const subtotal = unitPrice * item.quantity
                  return (
                    <li key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 truncate max-w-[60%]">
                        {/* product.name is DB data */}
                        {item.product.name}{' '}
                        <span className="text-gray-400">× {item.quantity}</span>
                      </span>
                      <span className="font-medium text-gray-900">{formatMAD(subtotal)}</span>
                    </li>
                  )
                })}
              </ul>

              {/* Total */}
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <span className="font-semibold text-gray-900">{t('estimatedTotal')}</span>
                <span className="text-xl font-bold text-gray-900">{formatMAD(total)}</span>
              </div>

              <p className="text-xs text-gray-400">
                {t('priceNote')}
              </p>

              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('estimateWarning')}
              </p>

              <SubmitWholesaleOrderForm
                labels={{
                  deliverySection: t('deliverySection'),
                  deliveryOptional: t('deliveryOptional'),
                  fieldCity: t('fieldCity'),
                  fieldCityPlaceholder: t('fieldCityPlaceholder'),
                  fieldAddress: t('fieldAddress'),
                  fieldAddressPlaceholder: t('fieldAddressPlaceholder'),
                  fieldNotes: t('fieldNotes'),
                  fieldNotesPlaceholder: t('fieldNotesPlaceholder'),
                  submitOrder: t('submitOrder'),
                  submittingOrder: t('submittingOrder'),
                }}
              />

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-400">{t('orWhatsapp')}</span>
                </div>
              </div>

              <WhatsAppButton
                items={items}
                total={total}
                phone={WHATSAPP_PHONE}
              />

              {/* Continue shopping */}
              <Link
                href="/wholesale/products"
                className="block text-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                {t('continueShopping')}
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
