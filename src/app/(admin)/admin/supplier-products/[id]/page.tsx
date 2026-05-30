import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import {
  ApproveSupplierProductForm,
  RejectSupplierProductForm,
} from '@/components/admin/supplier-product-review'
import type { SupplierProduct, Profile, SupplierProductStatus } from '@/types/database'

export const metadata = { title: 'Examen produit fournisseur — Administration' }

const STATUS_BADGE: Record<SupplierProductStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente',  cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvé',    cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejeté',      cls: 'bg-red-100 text-red-600' },
}

type SupplierProductFull = SupplierProduct & {
  supplier: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'> | null
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSupplierProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data } = await supabase
    .from('supplier_products')
    .select('*, supplier:profiles!supplier_id(id, full_name, phone, city)')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const product = data as unknown as SupplierProductFull
  const badge = STATUS_BADGE[product.approval_status]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/supplier-products" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Produits fournisseurs
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
              {product.product_name}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Product details + Supplier identity (admin only) */}
          <div className="lg:col-span-2 space-y-4">

            {/* Product info card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h1 className="text-base font-semibold text-gray-900">{product.product_name}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-400 text-xs">Catégorie</dt>
                  <dd className="text-gray-900 font-medium">{product.category || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Niche</dt>
                  <dd className="text-gray-900 font-medium">{product.niche || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Pays d&apos;origine</dt>
                  <dd className="text-gray-900 font-medium">{product.origin_country || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Disponibilité</dt>
                  <dd className="text-gray-900 font-medium">
                    {product.availability_type === 'import_on_demand' ? 'Import / Demande' : 'Stock disponible'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Quantité minimale</dt>
                  <dd className="text-gray-900 font-medium">{product.min_quantity} u.</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Acheteur cible</dt>
                  <dd className="text-gray-900 font-medium">
                    {product.target_buyer_type === 'both' ? 'Grossiste + Affilié' : 'Grossiste uniquement'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-400 text-xs">Prix de gros suggéré</dt>
                  <dd className="text-gray-900 font-medium">
                    {product.suggested_wholesale_price_mad != null
                      ? `${product.suggested_wholesale_price_mad} MAD`
                      : '—'}
                  </dd>
                </div>
                {product.description && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 text-xs">Description</dt>
                    <dd className="text-gray-700 text-sm leading-relaxed mt-0.5">{product.description}</dd>
                  </div>
                )}
              </dl>

              {/* Photos */}
              {product.photos.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-2">Photos ({product.photos.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {product.photos.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                      >
                        Photo {i + 1} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Supplier identity (admin only — never shown to wholesalers) */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
                Identité fournisseur — Admin uniquement
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-amber-600 text-xs">Nom</dt>
                  <dd className="text-gray-900 font-medium">{product.supplier?.full_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-amber-600 text-xs">Téléphone</dt>
                  <dd className="text-gray-900 font-medium">{product.supplier?.phone ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-amber-600 text-xs">Ville</dt>
                  <dd className="text-gray-900 font-medium">{product.supplier?.city ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-amber-600 text-xs">ID fournisseur</dt>
                  <dd className="text-gray-500 font-mono text-xs">{product.supplier_id}</dd>
                </div>
              </dl>
              {product.supplier_private_notes && (
                <div className="mt-3">
                  <p className="text-amber-600 text-xs mb-1">Notes privées du fournisseur</p>
                  <p className="text-gray-700 text-sm bg-white rounded-lg px-3 py-2 border border-amber-100">
                    {product.supplier_private_notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Admin actions */}
          <div className="space-y-4">

            {/* Approve form */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Approuver</h2>
              <ApproveSupplierProductForm
                id={product.id}
                publicName={product.public_name}
                publicDescription={product.public_description}
                platformMarginType={product.platform_margin_type}
                platformMarginValue={product.platform_margin_value}
                adminNotes={product.admin_notes}
              />
            </div>

            {/* Reject form */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Rejeter</h2>
              <RejectSupplierProductForm
                id={product.id}
                adminNotes={product.admin_notes}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
