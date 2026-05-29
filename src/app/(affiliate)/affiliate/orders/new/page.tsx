import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { getCities } from '@/app/actions/cities'
import { CreateOrderForm } from '@/components/affiliate/create-order-form'
import type { Product, City } from '@/types/database'

export const metadata = {
  title: 'Nouvelle commande — Espace Affilié',
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [profileRes, productsRes, allCities] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).single(),
    supabase
      .from('products')
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/affiliate/orders" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Mes commandes
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Nouvelle commande</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">
              Aucun produit disponible pour la vente COD pour l&apos;instant.
            </p>
            <Link
              href="/affiliate/products"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              Voir le catalogue →
            </Link>
          </div>
        ) : (
          <CreateOrderForm products={products} cities={cities} />
        )}
      </main>
    </div>
  )
}
