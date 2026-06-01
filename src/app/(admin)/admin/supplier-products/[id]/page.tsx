import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import {
  ApproveSupplierProductForm,
  RejectSupplierProductForm,
} from '@/components/admin/supplier-product-review'
import {
  MODERATION_FLAG_LABELS,
  MODERATION_SIGNAL_LABELS,
  SUPPLIER_PRODUCT_STATUS_BADGES,
  type ModerationSignal,
} from '@/lib/supplier-product-moderation'
import type {
  SupplierProduct,
  Profile,
  SupplierType,
  SupplierProductMoqTier,
} from '@/types/database'

export const metadata = { title: 'Examen produit fournisseur — Administration' }

const SUPPLIER_TYPE_BADGE: Record<SupplierType, { label: string; cls: string }> = {
  morocco:       { label: '🇲🇦 Fournisseur Maroc',        cls: 'bg-emerald-100 text-emerald-700' },
  international: { label: '🌍 Fournisseur International', cls: 'bg-blue-100 text-blue-700' },
}

type SupplierProductFull = SupplierProduct & {
  supplier: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'> | null
  supplier_product_moq_tiers: SupplierProductMoqTier[]
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
    .select(`
      *,
      supplier:profiles!supplier_id(id, full_name, phone, city),
      supplier_product_moq_tiers(min_quantity, unit_price_usd)
    `)
    .eq('id', id)
    .single()

  if (!data) notFound()

  const product = data as unknown as SupplierProductFull
  const badge = SUPPLIER_PRODUCT_STATUS_BADGES[product.approval_status]
  const tiers = product.supplier_product_moq_tiers ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/supplier-products" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Modération produits
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

          <div className="lg:col-span-2 space-y-4">

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">
                Modération IA — Admin uniquement
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-indigo-500 text-xs">Signal IA</dt>
                  <dd className="text-gray-900 font-medium">
                    {product.moderation_flag
                      ? MODERATION_FLAG_LABELS[product.moderation_flag]
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-indigo-500 text-xs">Score de risque</dt>
                  <dd className="text-gray-900 font-bold tabular-nums">
                    {product.ai_risk_score != null ? `${product.ai_risk_score} / 100` : '—'}
                  </dd>
                </div>
                {product.moderation_signals.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-indigo-500 text-xs">Alertes</dt>
                    <dd className="flex flex-wrap gap-1.5 mt-1">
                      {product.moderation_signals.map((s) => (
                        <span
                          key={s}
                          className="text-xs px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-indigo-800"
                        >
                          {MODERATION_SIGNAL_LABELS[s as ModerationSignal] ?? s}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-indigo-500 text-xs">Motif de modération</dt>
                  <dd className="text-gray-700 text-sm mt-0.5 bg-white rounded-lg px-3 py-2 border border-indigo-100">
                    {product.moderation_reason ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h1 className="text-base font-semibold text-gray-900">{product.product_name}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SUPPLIER_TYPE_BADGE[product.supplier_type].cls}`}>
                  {SUPPLIER_TYPE_BADGE[product.supplier_type].label}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-400 text-xs">Catégorie</dt>
                  <dd className="text-gray-900 font-medium">{product.category || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">MOQ</dt>
                  <dd className="text-gray-900 font-medium">{product.min_quantity} {product.unit}</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Stock</dt>
                  <dd className="text-gray-900 font-medium">
                    {product.stock_quantity != null ? product.stock_quantity.toLocaleString('fr-MA') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Délai (jours)</dt>
                  <dd className="text-gray-900 font-medium">
                    {product.lead_time_days != null ? product.lead_time_days : '—'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-400 text-xs">Prix suggéré (fournisseur)</dt>
                  <dd className="text-gray-900 font-medium">
                    {product.suggested_wholesale_price_mad != null
                      ? `${product.suggested_wholesale_price_mad} MAD`
                      : product.supplier_unit_price_usd != null
                        ? `${product.supplier_unit_price_usd} USD / u.`
                        : '—'}
                  </dd>
                </div>
                {tiers.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 text-xs mb-1">Paliers de prix (fournisseur)</dt>
                    <dd>
                      <ul className="text-sm text-gray-800 space-y-1">
                        {tiers
                          .sort((a, b) => a.min_quantity - b.min_quantity)
                          .map((t, i) => (
                            <li key={i} className="bg-gray-50 rounded px-2 py-1">
                              {t.min_quantity}+ u. → {t.unit_price_usd} USD / u.
                            </li>
                          ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {product.description && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 text-xs">Description</dt>
                    <dd className="text-gray-700 text-sm leading-relaxed mt-0.5">{product.description}</dd>
                  </div>
                )}
              </dl>

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

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
                Fournisseur — Admin uniquement
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
              </dl>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Approuver (publier marketplace)</h2>
              <ApproveSupplierProductForm
                id={product.id}
                publicName={product.public_name}
                publicDescription={product.public_description}
                platformMarginType={product.platform_margin_type}
                platformMarginValue={product.platform_margin_value}
                adminNotes={product.admin_notes}
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Bloquer</h2>
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
