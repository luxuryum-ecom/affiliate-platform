import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MarketplaceQuoteForm } from '@/components/wholesale/marketplace-quote-form'
import { MarketplaceDirectOrderForm } from '@/components/wholesale/marketplace-direct-order-form'
import { getSupplierProductCtaMode } from '@/lib/wholesale-cta'
import SampleRequestClient from './SampleRequestClient'
import type {
  Profile,
  SupplierProductPublic,
  SupplierType,
  SupplierProductAttachment,
  AttachmentType,
} from '@/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

const ATTACHMENT_ICON: Record<AttachmentType, string> = {
  pdf_datasheet: '📋',
  pdf_catalog:   '📒',
  image:         '🖼️',
  video:         '🎥',
}

const ATTACHMENT_LABEL: Record<AttachmentType, string> = {
  pdf_datasheet: 'Fiche technique',
  pdf_catalog:   'Catalogue PDF',
  image:         'Image',
  video:         'Vidéo',
}

export default async function MarketplaceProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const [productRes, attachmentsRes] = await Promise.all([
    supabase
      .from('supplier_products_wholesaler_read')
      .select(
        'id, product_name, category, niche, description, photos, min_quantity, origin_country, availability_type, suggested_wholesale_price_mad, public_name, public_description, approval_status, supplier_type, unit, stock_quantity, lead_time_days, created_at'
      )
      .eq('id', id)
      .single(),
    supabase
      .from('supplier_product_attachments')
      .select('id, filename, storage_path, attachment_type, file_size, created_at')
      .eq('supplier_product_id', id)
      .eq('admin_status', 'approved')
      .order('created_at', { ascending: true }),
  ])

  if (!productRes.data) notFound()

  type MarketplaceProduct = SupplierProductPublic & {
    supplier_type: SupplierType
    unit: string
    stock_quantity: number | null
    lead_time_days: number | null
  }

  const product = productRes.data as unknown as MarketplaceProduct
  const attachments = (attachmentsRes.data ?? []) as unknown as SupplierProductAttachment[]

  const displayName = product.public_name || product.product_name
  const displayDesc = product.public_description || product.description
  const isMorocco = product.supplier_type === 'morocco'
  const ctaMode = getSupplierProductCtaMode(product)
  const directUnitPrice = product.suggested_wholesale_price_mad ?? 0
  const directStock = product.stock_quantity

  const hasCatalog = attachments.some((a) => ['pdf_catalog', 'pdf_datasheet'].includes(a.attachment_type))
  const hasVideo   = attachments.some((a) => a.attachment_type === 'video')
  const hasImages  = attachments.some((a) => a.attachment_type === 'image')

  // Generate signed URLs for each attachment
  type AttachmentWithUrl = SupplierProductAttachment & { signedUrl: string | null }
  const attachmentsWithUrls: AttachmentWithUrl[] = await Promise.all(
    attachments.map(async (a) => {
      const { data: signed } = await supabase.storage
        .from('supplier-attachments')
        .createSignedUrl(a.storage_path, 3600)
      return { ...a, signedUrl: signed?.signedUrl ?? null }
    })
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/marketplace" className="text-gray-400 hover:text-gray-600 text-sm">← Marketplace</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">{displayName}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}><button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button></form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: images */}
          <div className="space-y-4">
            {product.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {product.photos.slice(0, 4).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`${displayName} ${i + 1}`}
                    className={`w-full object-cover rounded-xl ${i === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-square'}`}
                  />
                ))}
              </div>
            ) : (
              <div className="w-full aspect-[4/3] bg-gray-100 rounded-xl flex items-center justify-center text-5xl text-gray-300">📦</div>
            )}

            {/* Attachments */}
            {attachmentsWithUrls.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">Documents & médias</p>
                <div className="space-y-2">
                  {attachmentsWithUrls.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ATTACHMENT_ICON[a.attachment_type]}</span>
                        <div>
                          <p className="text-xs font-medium text-gray-800">{ATTACHMENT_LABEL[a.attachment_type]}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[160px]">{a.filename}</p>
                        </div>
                      </div>
                      {a.signedUrl && (
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                        >
                          Ouvrir →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: info + forms */}
          <div className="space-y-5">
            {/* Header */}
            <div>
              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isMorocco ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                  {isMorocco ? '🇲🇦 Maroc' : '🌍 International'}
                </span>
                {product.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{product.category}</span>
                )}
                {hasCatalog && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">📒 Catalogue dispo</span>
                )}
                {hasVideo && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">🎥 Vidéo dispo</span>
                )}
                {hasImages && product.photos.length === 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">🖼️ Photos dispo</span>
                )}
              </div>

              <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
              {displayDesc && <p className="text-sm text-gray-600 mt-2">{displayDesc}</p>}
            </div>

            {/* Key info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              {product.origin_country && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pays d&apos;origine</span>
                  <span className="font-medium text-gray-900">{product.origin_country}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Localisation stock</span>
                <span className={`font-medium ${product.availability_type === 'local_stock' ? 'text-green-700' : 'text-purple-700'}`}>
                  {product.availability_type === 'local_stock' ? '🇲🇦 Stock au Maroc' : 'Import sur demande'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">MOQ</span>
                <span className="font-medium text-gray-900">{product.min_quantity} {product.unit}</span>
              </div>
              {product.stock_quantity != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Stock</span>
                  <span className={`font-medium ${product.stock_quantity > 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {product.stock_quantity > 0 ? `${product.stock_quantity} ${product.unit}` : 'Épuisé'}
                  </span>
                </div>
              )}
              {product.lead_time_days != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Délai</span>
                  <span className="font-medium text-gray-900">{product.lead_time_days} jours</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                <span className="text-gray-500">{isMorocco ? 'Prix de gros' : 'Prix final TTC'}</span>
                <span className="font-bold text-gray-900 text-base">
                  {product.suggested_wholesale_price_mad != null
                    ? `${product.suggested_wholesale_price_mad} MAD`
                    : 'Sur devis'}
                </span>
              </div>
            </div>

            {!isMorocco && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                Prix défini par la plateforme. Transport et douane inclus. Paiement via Mozouna Group uniquement.
              </p>
            )}

            {ctaMode === 'direct' ? (
              <>
                {/* Primary: direct order */}
                <div className="bg-white rounded-xl border border-emerald-200 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Commander en gros</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Prix affiché, stock et MOQ connus — ajout au panier puis validation de commande.
                  </p>
                  <MarketplaceDirectOrderForm
                    supplierProductId={product.id}
                    unitPrice={directUnitPrice}
                    minQty={product.min_quantity}
                    stockCount={directStock}
                    unit={product.unit}
                  />
                </div>
                {/* Secondary: sample / document */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Demander un échantillon / document</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Recevez des photos, vidéos ou une fiche technique via la plateforme.
                  </p>
                  <SampleRequestClient supplierProductId={product.id} />
                </div>
                {/* Tertiary: quote for edge cases */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-600 mb-1">Volume important ou conditions spéciales ?</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Quantité hors stock disponible, délai personnalisé ou négociation tarifaire — notre équipe vous répond.
                  </p>
                  <MarketplaceQuoteForm supplierProductId={product.id} minQuantity={product.min_quantity} />
                </div>
              </>
            ) : (
              <>
                {/* Primary: quote */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Demander un devis</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Import, prix sur mesure ou volume à négocier — notre équipe prépare une offre.
                  </p>
                  <MarketplaceQuoteForm supplierProductId={product.id} minQuantity={product.min_quantity} />
                </div>
                {/* Secondary: sample / document */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Demander un échantillon / document</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Recevez des photos, vidéos ou une fiche technique via la plateforme.
                  </p>
                  <SampleRequestClient supplierProductId={product.id} />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
