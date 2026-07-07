import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatMAD, getWholesaleTier } from '@/lib/utils'
import { CartItemRow } from '@/components/wholesale/cart-item-row'
import { SubmitWholesaleOrderForm } from '@/components/wholesale/submit-order-form'
import { WhatsAppButton } from '@/components/wholesale/whatsapp-button'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { WholesaleCartItem, WholesaleCartItemWithProduct } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.cart')
  return { title: t('metaTitle') }
}

interface CartPageProps {
  searchParams: Promise<{ reordered?: string; skipped?: string }>
}

export default async function WholesaleCartPage({ searchParams }: CartPageProps) {
  const { reordered, skipped } = await searchParams
  // AM-1 — bilan du réassort (borné, entiers non négatifs).
  const reorderedCount = Math.max(0, Math.floor(Number(reordered)) || 0)
  const skippedCount = Math.max(0, Math.floor(Number(skipped)) || 0)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [profileResult, cartResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase
      .from('wholesale_cart_items')
      .select('*')
      .eq('buyer_id', user!.id)
      .order('added_at', { ascending: true }),
  ])

  const profile = profileResult.data as { full_name: string } | null

  // Fix mig 091 : la table `products` n'est plus lisible en direct par un grossiste
  // (policy SELECT staff-only). Les colonnes vitrine (nom, prix, paliers, stock, médias)
  // se lisent via la VUE redacted `products_catalog_read` (mig 089, accessible à tous les
  // rôles authentifiés). Affichage PUR — zéro coût/marge (factory_cost_mad exclu de la vue).
  // Le coût fournisseur (factory_cost_mad) n'est JAMAIS lu ici : il l'est côté serveur via
  // service_role dans submitWholesaleOrder (chemin argent isolé).
  const rawItems = (cartResult.data ?? []) as unknown as WholesaleCartItem[]
  const productIds = [...new Set(rawItems.map((i) => i.product_id))]
  const productById = new Map<string, Record<string, unknown>>()
  if (productIds.length) {
    const { data: prows } = (await supabase
      .from('products_catalog_read')
      .select('*')
      .in('id', productIds)) as { data: Record<string, unknown>[] | null }
    for (const p of prows ?? []) productById.set(p.id as string, p)
  }
  const items = rawItems
    .map((i) => ({ ...i, product: productById.get(i.product_id) }))
    .filter((i) => i.product) as unknown as WholesaleCartItemWithProduct[]

  // Étape 7.B — stock par VARIANTE (source de vérité, mig 105) pour le cap/clamp des
  // lignes panier. product_variants_read = vue security-definer (tous rôles authentifiés).
  // Map sérialisable variantId→stock_count transmise au Client (aucune fonction — règle #2).
  const variantIds = items.map((i) => i.variant_id).filter((v): v is string => !!v)
  const variantStockById: Record<string, number> = {}
  if (variantIds.length) {
    const { data: vRows } = (await supabase
      .from('product_variants_read')
      .select('id, stock_count')
      .in('id', variantIds)) as { data: { id: string; stock_count: number }[] | null }
    for (const r of vRows ?? []) variantStockById[r.id] = r.stock_count
  }

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
    <div className="min-h-screen bg-bg">
      {/* Navbar */}
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/wholesale/products"
        backLabel={tc('backToCatalog')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-3xl"
      />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-foreground mb-6">
          {t('pageTitle')}
          {items.length > 0 && (
            <span className="ms-2 text-sm font-normal text-faint">
              {t('itemCount', { count: items.length })}
            </span>
          )}
        </h1>

        {reorderedCount > 0 && (
          <div className="mb-6 bg-success-soft border border-success rounded-xl px-4 py-3 text-sm text-success-fg">
            {t('reorderedBanner', { count: reorderedCount })}
            {skippedCount > 0 && (
              <span className="block text-xs text-muted mt-1">
                {t('reorderedSkipped', { count: skippedCount })}
              </span>
            )}
          </div>
        )}

        {items.length === 0 ? (
          /* Empty cart */
          <div className="bg-surface rounded-2xl border border-line p-12 text-center space-y-4">
            <p className="text-3xl">🛒</p>
            <p className="text-sm text-muted">{t('emptyTitle')}</p>
            <Link
              href="/wholesale/products"
              className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('browseCatalog')}
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Cart items */}
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  variantStock={item.variant_id ? variantStockById[item.variant_id] ?? null : null}
                />
              ))}
            </div>

            {/* Order summary */}
            <div className="bg-surface rounded-2xl border border-line p-5 space-y-4">
              <h2 className="font-semibold text-foreground">{t('summary')}</h2>

              {/* Line items */}
              <ul className="space-y-2">
                {items.map((item) => {
                  const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
                  const unitPrice = tier ? tier.price_per_unit : item.product.sell_price
                  const subtotal = unitPrice * item.quantity
                  return (
                    <li key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted truncate max-w-[60%]">
                        {/* product.name is DB data */}
                        {item.product.name}{' '}
                        <span className="text-faint">× {item.quantity}</span>
                      </span>
                      <span className="font-medium text-foreground">{formatMAD(subtotal)}</span>
                    </li>
                  )
                })}
              </ul>

              {/* Total */}
              <div className="border-t border-line pt-3 flex items-center justify-between">
                <span className="font-semibold text-foreground">{t('estimatedTotal')}</span>
                <span className="text-xl font-bold text-foreground">{formatMAD(total)}</span>
              </div>

              <p className="text-xs text-faint">
                {t('priceNote')}
              </p>

              <p className="text-xs text-warning-fg bg-warning-soft border border-warning rounded-lg px-3 py-2">
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
                  <div className="w-full border-t border-line" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-surface px-2 text-faint">{t('orWhatsapp')}</span>
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
                className="block text-center text-sm text-muted hover:text-foreground transition-colors"
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
