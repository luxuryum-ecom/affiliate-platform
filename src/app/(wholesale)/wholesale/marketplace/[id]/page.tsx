import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { MarketplaceQuoteForm } from '@/components/wholesale/marketplace-quote-form'
import { MarketplaceDirectOrderForm } from '@/components/wholesale/marketplace-direct-order-form'
import { getSupplierProductCtaMode } from '@/lib/wholesale-cta'
import { findCatalogLink } from '@/lib/wholesale-catalog-link'
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

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const t = await getTranslations('wholesale.marketplaceDetail')
  const supabase = await createClient()
  const { data } = await supabase
    .from('supplier_products_wholesaler_read')
    .select('public_name, product_name')
    .eq('id', id)
    .single()
  const name = data?.public_name || data?.product_name || t('metaFallback')
  return { title: t('metaTitle', { name }) }
}

export default async function MarketplaceProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, tCommon, locale] = await Promise.all([
    getTranslations('wholesale.marketplaceDetail'),
    getTranslations('wholesale.common'),
    getLocale(),
  ])

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
  const directUnitPrice = product.suggested_wholesale_price_mad ?? 0

  // Commande directe = candidat 'direct' ET miroir catalogue interne commandable.
  // Sans miroir, le checkout refuserait : on rétrograde donc en 'rfq' AVANT
  // d'afficher le CTA (source de vérité unique partagée avec addMarketplaceToCart).
  const catalogLink =
    getSupplierProductCtaMode(product) === 'direct'
      ? await findCatalogLink(supabase, product)
      : null
  const ctaMode: 'direct' | 'rfq' = catalogLink ? 'direct' : 'rfq'

  // Seuils RÉELLEMENT appliqués au checkout = cumul des gardes fournisseur ET
  // catalogue (cart.ts). On les affiche pour ne pas « déplacer le mur » : MOQ =
  // max des deux, stock = min des deux. Sans miroir, valeurs fournisseur brutes.
  const directMinQty = catalogLink
    ? Math.max(product.min_quantity, catalogLink.wholesale_min_qty)
    : product.min_quantity
  const directStock = catalogLink
    ? product.stock_quantity == null
      ? catalogLink.stock_count
      : Math.min(product.stock_quantity, catalogLink.stock_count)
    : product.stock_quantity

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

  const attachmentLabel: Record<AttachmentType, string> = {
    pdf_datasheet: t('attachmentPdfDatasheet'),
    pdf_catalog:   t('attachmentPdfCatalog'),
    image:         t('attachmentImage'),
    video:         t('attachmentVideo'),
  }

  const ATTACHMENT_ICON: Record<AttachmentType, string> = {
    pdf_datasheet: '📋',
    pdf_catalog:   '📒',
    image:         '🖼️',
    video:         '🎥',
  }

  const numLocale = locale === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA'

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={displayName}
        backHref="/wholesale/marketplace"
        backLabel={tCommon('backToMarketplace')}
        userName={profile?.full_name}
        signOutLabel={tCommon('signOut')}
        maxWidth="max-w-5xl"
      />

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
              <div className="w-full aspect-[4/3] bg-surface-2 rounded-xl flex items-center justify-center text-5xl text-faint">📦</div>
            )}

            {/* Attachments */}
            {attachmentsWithUrls.length > 0 && (
              <div className="bg-surface rounded-xl border border-line p-4">
                <p className="text-sm font-semibold text-foreground mb-3">{t('attachmentsTitle')}</p>
                <div className="space-y-2">
                  {attachmentsWithUrls.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ATTACHMENT_ICON[a.attachment_type]}</span>
                        <div>
                          <p className="text-xs font-medium text-foreground">{attachmentLabel[a.attachment_type]}</p>
                          <p className="text-xs text-faint truncate max-w-[160px]">{a.filename}</p>
                        </div>
                      </div>
                      {a.signedUrl && (
                        <a
                          href={a.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 bg-surface-2 hover:bg-surface border border-line text-muted rounded-lg transition-colors"
                        >
                          {t('attachmentOpen')}
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
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isMorocco ? 'bg-success-soft text-success-fg border border-success' : 'bg-surface-2 text-muted border border-line'}`}>
                  {isMorocco ? `🇲🇦 ${t('badgeMorocco')}` : `🌍 ${t('badgeIntl')}`}
                </span>
                {product.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">{product.category}</span>
                )}
                {hasCatalog && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">📒 {t('badgeCatalog')}</span>
                )}
                {hasVideo && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">🎥 {t('badgeVideo')}</span>
                )}
                {hasImages && product.photos.length === 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">🖼️ {t('badgePhotos')}</span>
                )}
              </div>

              <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
              {displayDesc && <p className="text-sm text-muted mt-2">{displayDesc}</p>}
            </div>

            {/* Key info */}
            <div className="bg-bg rounded-xl p-4 space-y-2 border border-line">
              {product.origin_country && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{t('infoOrigin')}</span>
                  <span className="font-medium text-foreground">{product.origin_country}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t('infoStockLocation')}</span>
                <span className={`font-medium ${product.availability_type === 'local_stock' ? 'text-success-fg' : 'text-muted'}`}>
                  {product.availability_type === 'local_stock'
                    ? `🇲🇦 ${t('infoStockMorocco')}`
                    : t('infoImportOnDemand')
                  }
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t('infoMoq')}</span>
                <span className="font-medium text-foreground">{product.min_quantity} {product.unit}</span>
              </div>
              {product.stock_quantity != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{t('infoStock')}</span>
                  <span className={`font-medium ${product.stock_quantity > 0 ? 'text-success-fg' : 'text-danger-fg'}`}>
                    {product.stock_quantity > 0
                      ? `${product.stock_quantity.toLocaleString(numLocale)} ${product.unit}`
                      : t('infoStockOut')
                    }
                  </span>
                </div>
              )}
              {product.lead_time_days != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{t('infoLeadTime')}</span>
                  <span className="font-medium text-foreground">{t('infoLeadTimeDays', { days: product.lead_time_days })}</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-1 border-t border-line">
                <span className="text-muted">{isMorocco ? t('infoPriceMorocco') : t('infoPriceImport')}</span>
                <span className="font-bold text-foreground text-base">
                  {product.suggested_wholesale_price_mad != null
                    ? `${product.suggested_wholesale_price_mad.toLocaleString(numLocale)} MAD`
                    : t('infoOnQuote')
                  }
                </span>
              </div>
            </div>

            {!isMorocco && (
              <p className="text-xs text-muted bg-surface-2 rounded-lg px-3 py-2 border border-line">
                {t('importPriceNote')}
              </p>
            )}

            {ctaMode === 'direct' ? (
              <>
                {/* Primary: direct order */}
                <div className="bg-surface rounded-xl border border-success p-4">
                  <p className="text-sm font-semibold text-foreground mb-1">{t('directOrderTitle')}</p>
                  <p className="text-xs text-muted mb-3">{t('directOrderSubtitle')}</p>
                  <MarketplaceDirectOrderForm
                    supplierProductId={product.id}
                    unitPrice={directUnitPrice}
                    minQty={directMinQty}
                    stockCount={directStock}
                    unit={product.unit}
                    locale={locale}
                    tDirect={{
                      stockNote: t('directStockNote', { moq: directMinQty, unit: product.unit }),
                      qtyLabel: t('directQtyLabel'),
                      qtyMin: t('directQtyMin', { min: directMinQty }),
                      unitPrice: t('directUnitPrice'),
                      subtotal: t('directSubtotal'),
                      stockAvailable: directStock != null && directStock > 0
                        ? t('directStockAvailable', { count: directStock.toLocaleString(numLocale), unit: product.unit })
                        : '',
                      outOfStock: t('directOutOfStock'),
                      stockOk: t('directStockOk'),
                      addToCart: t('directAddToCart'),
                      adding: t('directAdding'),
                      addedSuccess: t('directAddedSuccess'),
                      viewCart: t('directViewCart'),
                    }}
                  />
                </div>
                {/* Secondary: sample / document */}
                <div className="bg-surface rounded-xl border border-line p-4">
                  <p className="text-sm font-semibold text-foreground mb-1">{t('sampleTitle')}</p>
                  <p className="text-xs text-muted mb-3">{t('sampleSubtitle')}</p>
                  <SampleRequestClient
                    supplierProductId={product.id}
                    tSample={{
                      typeLabel: t('sampleRequestTypeLabel'),
                      typePlaceholder: t('sampleRequestTypePlaceholder'),
                      typePhotos: t('sampleTypePhotos'),
                      typeVideo: t('sampleTypeVideo'),
                      typeTechnicalSheet: t('sampleTypeTechnicalSheet'),
                      typeSample: t('sampleTypeSample'),
                      messageLabel: t('sampleMessageLabel'),
                      messagePlaceholder: t('sampleMessagePlaceholder'),
                      submit: t('sampleSubmit'),
                      submitting: t('sampleSubmitting'),
                      success: t('sampleSuccess'),
                      successSubtitle: t('sampleSuccessSubtitle'),
                      trackLink: t('sampleTrackLink'),
                    }}
                  />
                </div>
                {/* Tertiary: quote for edge cases */}
                <div className="bg-bg rounded-xl border border-line p-4">
                  <p className="text-sm font-medium text-muted mb-1">{t('quoteSpecialTitle')}</p>
                  <p className="text-xs text-faint mb-3">{t('quoteSpecialSubtitle')}</p>
                  <MarketplaceQuoteForm
                    supplierProductId={product.id}
                    minQuantity={product.min_quantity}
                    tQuote={{
                      qtyLabel: t('quoteFormQtyLabel'),
                      qtyMin: t('quoteFormQtyMin', { min: product.min_quantity }),
                      activityLabel: t('quoteFormActivityLabel'),
                      activityPlaceholder: t('quoteFormActivityPlaceholder'),
                      volumeLabel: t('quoteFormVolumeLabel'),
                      volumePlaceholder: t('quoteFormVolumePlaceholder'),
                      volumeHint: t('quoteFormVolumeHint'),
                      tier1: t('quoteFormTier1'),
                      tier2: t('quoteFormTier2'),
                      tier3: t('quoteFormTier3'),
                      tier4: t('quoteFormTier4'),
                      countryLabel: t('quoteFormCountryLabel'),
                      cityLabel: t('quoteFormCityLabel'),
                      cityPlaceholder: t('quoteFormCityPlaceholder'),
                      whatsappLabel: t('quoteFormWhatsappLabel'),
                      whatsappPlaceholder: t('quoteFormWhatsappPlaceholder'),
                      notesLabel: t('quoteFormNotesLabel'),
                      notesPlaceholder: t('quoteFormNotesPlaceholder'),
                      cancel: t('quoteFormCancel'),
                      submit: t('quoteFormSubmit'),
                      submitting: t('quoteFormSubmitting'),
                      cta: t('quoteFormCta'),
                      success: t('quoteSuccess'),
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Primary: quote */}
                <div className="bg-surface rounded-xl border border-line p-4">
                  <p className="text-sm font-semibold text-foreground mb-1">{t('quoteTitle')}</p>
                  <p className="text-xs text-muted mb-3">{t('quoteSubtitle')}</p>
                  <MarketplaceQuoteForm
                    supplierProductId={product.id}
                    minQuantity={product.min_quantity}
                    tQuote={{
                      qtyLabel: t('quoteFormQtyLabel'),
                      qtyMin: t('quoteFormQtyMin', { min: product.min_quantity }),
                      activityLabel: t('quoteFormActivityLabel'),
                      activityPlaceholder: t('quoteFormActivityPlaceholder'),
                      volumeLabel: t('quoteFormVolumeLabel'),
                      volumePlaceholder: t('quoteFormVolumePlaceholder'),
                      volumeHint: t('quoteFormVolumeHint'),
                      tier1: t('quoteFormTier1'),
                      tier2: t('quoteFormTier2'),
                      tier3: t('quoteFormTier3'),
                      tier4: t('quoteFormTier4'),
                      countryLabel: t('quoteFormCountryLabel'),
                      cityLabel: t('quoteFormCityLabel'),
                      cityPlaceholder: t('quoteFormCityPlaceholder'),
                      whatsappLabel: t('quoteFormWhatsappLabel'),
                      whatsappPlaceholder: t('quoteFormWhatsappPlaceholder'),
                      notesLabel: t('quoteFormNotesLabel'),
                      notesPlaceholder: t('quoteFormNotesPlaceholder'),
                      cancel: t('quoteFormCancel'),
                      submit: t('quoteFormSubmit'),
                      submitting: t('quoteFormSubmitting'),
                      cta: t('quoteFormCta'),
                      success: t('quoteSuccess'),
                    }}
                  />
                </div>
                {/* Secondary: sample / document */}
                <div className="bg-surface rounded-xl border border-line p-4">
                  <p className="text-sm font-semibold text-foreground mb-1">{t('sampleTitle')}</p>
                  <p className="text-xs text-muted mb-3">{t('sampleSubtitle')}</p>
                  <SampleRequestClient
                    supplierProductId={product.id}
                    tSample={{
                      typeLabel: t('sampleRequestTypeLabel'),
                      typePlaceholder: t('sampleRequestTypePlaceholder'),
                      typePhotos: t('sampleTypePhotos'),
                      typeVideo: t('sampleTypeVideo'),
                      typeTechnicalSheet: t('sampleTypeTechnicalSheet'),
                      typeSample: t('sampleTypeSample'),
                      messageLabel: t('sampleMessageLabel'),
                      messagePlaceholder: t('sampleMessagePlaceholder'),
                      submit: t('sampleSubmit'),
                      submitting: t('sampleSubmitting'),
                      success: t('sampleSuccess'),
                      successSubtitle: t('sampleSuccessSubtitle'),
                      trackLink: t('sampleTrackLink'),
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
