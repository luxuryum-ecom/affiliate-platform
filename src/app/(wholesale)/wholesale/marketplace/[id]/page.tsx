import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { MarketplaceQuoteForm } from '@/components/wholesale/marketplace-quote-form'
import { MarketplaceDirectOrderForm } from '@/components/wholesale/marketplace-direct-order-form'
import { getSupplierProductCtaMode } from '@/lib/wholesale-cta'
import { computeStockFreshness, stockAgeDays, stockNeedsConfirmation, stockNeedsWatch } from '@/lib/supplier-stock-freshness'
import { formatMAD, formatQty } from '@/lib/utils'
import { getMeaningfulDescription } from '@/lib/product-media'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
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

  const [productRes, attachmentsRes, mirrorRes] = await Promise.all([
    supabase
      .from('supplier_products_wholesaler_read')
      .select(
        'id, product_name, category, niche, description, photos, min_quantity, origin_country, availability_type, suggested_wholesale_price_mad, public_name, public_description, approval_status, supplier_type, unit, stock_quantity, stock_mode, stock_quantity_updated_at, lead_time_days, created_at'
      )
      .eq('id', id)
      .single(),
    supabase
      .from('supplier_product_attachments')
      .select('id, filename, storage_path, attachment_type, file_size, created_at')
      .eq('supplier_product_id', id)
      .eq('admin_status', 'approved')
      .order('created_at', { ascending: true }),
    // V5-bis.2/C4 — stock PROPRE (entrepôt) du produit miroir lié à ce produit fournisseur.
    // Lecture via la vue redacted `products_catalog_read` (zéro coût/marge, GRANT authenticated,
    // filtre active+approved). Pas de miroir / inactif → null → « Sur commande » (fail-safe).
    supabase
      .from('products_catalog_read')
      .select('stock_count')
      .eq('source_supplier_product_id', id)
      .maybeSingle(),
  ])

  if (!productRes.data) notFound()

  type MarketplaceProduct = SupplierProductPublic & {
    supplier_type: SupplierType
    unit: string
    stock_quantity: number | null
    stock_mode: string | null
    stock_quantity_updated_at: string | null
    lead_time_days: number | null
  }

  const product = productRes.data as unknown as MarketplaceProduct
  const attachments = (attachmentsRes.data ?? []) as unknown as SupplierProductAttachment[]

  const displayName = product.public_name || product.product_name
  const displayDesc = getMeaningfulDescription(displayName, product.public_description || product.description)
  const isMorocco = product.supplier_type === 'morocco'
  const directUnitPrice = product.suggested_wholesale_price_mad ?? 0

  // CTA d'affichage (A1) — décidé UNIQUEMENT sur origine + stock fournisseur, SANS
  // dépendre du miroir catalogue : Maroc local_stock + prix + stock > 0 → 'direct' ;
  // import / pas de prix / rupture → 'rfq'. La sur-commande (qty > stock) bascule en
  // devis côté formulaire (réactif). Le miroir reste exigé/garanti côté SERVEUR
  // (addMarketplaceToCart + auto-provision à l'approbation) — défense en profondeur.
  const ctaMode = getSupplierProductCtaMode(product)
  const directMinQty = product.min_quantity
  const directStock = product.stock_quantity

  // V5-bis.2 — signal de fraîcheur du stock fournisseur, 3 PALIERS (C2 tranché Abdou).
  // Option A : JAMAIS bloquant, pur signal d'affichage. Calcul SERVEUR ; on ne rend
  // qu'une string i18n déjà résolue (jamais de fonction passée à un Client Component —
  // cf. régression stockAvailable). Pas de somme avec le stock propre (la page lit la
  // source fournisseur vivante, pas le miroir → zéro double-comptage).
  //   • frais (< 3 j)      → pas de badge
  //   • à surveiller (3-14 j) → badge GRIS « Mis à jour il y a X jours »
  //   • à confirmer (> 14 j / inconnu) → badge ORANGE « À confirmer »
  const stockFreshness = computeStockFreshness(product.stock_quantity_updated_at)
  const hasDeclaredStock = product.stock_quantity != null && product.stock_quantity > 0
  const stockBadge: { tone: 'confirm' | 'watch'; label: string } | null = !hasDeclaredStock
    ? null
    : stockNeedsConfirmation(stockFreshness)
      ? { tone: 'confirm', label: t('infoStockToConfirm') }
      : stockNeedsWatch(stockFreshness)
        ? { tone: 'watch', label: t('infoStockUpdatedDaysAgo', { days: stockAgeDays(product.stock_quantity_updated_at) ?? 0 }) }
        : null

  // V5-bis.2/C4 (tranché Abdou) — on n'additionne JAMAIS stock propre + fournisseur (évite
  // le double-comptage du miroir). On affiche SÉPARÉMENT : « Dispo immédiate » (stock propre
  // entrepôt, miroir) et « Dispo fournisseur » (stock déclaré + badge fraîcheur). Si le stock
  // propre est nul/absent mais le fournisseur en a → badge « Sur commande » (jamais de refus,
  // Option A). Lecture serveur, valeurs sérialisables.
  const ownStock = (mirrorRes.data?.stock_count ?? null) as number | null
  const unitSuffix = product.unit?.trim() ? ` ${product.unit.trim()}` : ''
  const onBackorder =
    (ownStock == null || ownStock <= 0) && product.stock_quantity != null && product.stock_quantity > 0

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


  return (
    <div className="theme-dark min-h-screen bg-bg">
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
                  // Fallback initiales si l'image est cassée (cohérent avec le reste du site).
                  <ProductThumbnail
                    key={i}
                    src={url}
                    name={`${displayName} ${i + 1}`}
                    className={`w-full rounded-xl text-3xl ${i === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-square'}`}
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
                <span className="font-medium text-foreground">{formatQty(product.min_quantity)}{product.unit?.trim() ? ` ${product.unit.trim()}` : ''}</span>
              </div>
              {/* V5-bis.2/C4 — stock affiché SÉPARÉMENT (jamais sommé) : propre vs fournisseur */}
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t('infoStockOwn')}</span>
                <span className={`font-medium ${ownStock != null && ownStock > 0 ? 'text-success-fg' : 'text-faint'}`}>
                  {ownStock != null && ownStock > 0 ? (
                    `${formatQty(ownStock)}${unitSuffix}`
                  ) : onBackorder ? (
                    <span className="inline-block align-middle text-xs font-medium rounded-full px-2 py-0.5 border text-warning-fg bg-warning-soft border-warning">
                      {t('infoOnBackorder')}
                    </span>
                  ) : (
                    t('infoStockOut')
                  )}
                </span>
              </div>
              {product.stock_quantity != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{t('infoStockSupplier')}</span>
                  <span className={`font-medium ${product.stock_quantity > 0 ? 'text-success-fg' : 'text-danger-fg'}`}>
                    {product.stock_quantity > 0
                      ? `${formatQty(product.stock_quantity)}${unitSuffix}`
                      : t('infoStockOut')
                    }
                    {stockBadge && (
                      <span
                        className={`ms-2 inline-block align-middle text-xs font-medium rounded-full px-2 py-0.5 border ${
                          stockBadge.tone === 'confirm'
                            ? 'text-warning-fg bg-warning-soft border-warning'
                            : 'text-muted bg-surface-2 border-line'
                        }`}
                      >
                        {stockBadge.label}
                      </span>
                    )}
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
                    ? formatMAD(product.suggested_wholesale_price_mad)
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
                    unit={product.unit?.trim() ?? ''}
                    locale={locale}
                    tDirect={{
                      stockNote: t('directStockNote', { moq: directMinQty, unit: product.unit?.trim() ?? '' }),
                      qtyLabel: t('directQtyLabel'),
                      qtyMin: t('directQtyMin', { min: directMinQty }),
                      unitPrice: t('directUnitPrice'),
                      subtotal: t('directSubtotal'),
                      stockAvailable: directStock != null && directStock > 0
                        ? t('directStockAvailable', { count: formatQty(directStock), unit: product.unit?.trim() ?? '' })
                        : '',
                      outOfStock: t('directOutOfStock'),
                      stockOk: t('directStockOk'),
                      addToCart: t('directAddToCart'),
                      adding: t('directAdding'),
                      addedSuccess: t('directAddedSuccess'),
                      viewCart: t('directViewCart'),
                      overOrderTitle: t('overOrderTitle'),
                      overOrderDesc: t('overOrderDesc'),
                      overOrderCta: t('overOrderCta'),
                      addToCartRestockingWarning: t('addToCartRestockingWarning'),
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
                {/* Tertiary: quote for edge cases — cible de l'ancre #quote (sur-commande) */}
                <div id="quote" className="bg-bg rounded-xl border border-line p-4 scroll-mt-20">
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
                      profilePhysical: t('quoteFormProfilePhysical'),
                      profileSocial: t('quoteFormProfileSocial'),
                      profileEcom: t('quoteFormProfileEcom'),
                      profileImporter: t('quoteFormProfileImporter'),
                      vol1: t('quoteFormVol1'),
                      vol2: t('quoteFormVol2'),
                      vol3: t('quoteFormVol3'),
                      vol4: t('quoteFormVol4'),
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Primary: quote — cible de l'ancre #quote */}
                <div id="quote" className="bg-surface rounded-xl border border-line p-4 scroll-mt-20">
                  <p className="text-sm font-semibold text-foreground mb-1">{t('quoteTitle')}</p>
                  <p className="text-xs text-muted mb-3">{t('quoteSubtitle')}</p>
                  <MarketplaceQuoteForm
                    supplierProductId={product.id}
                    minQuantity={product.min_quantity}
                    showShippingMode={product.availability_type !== 'local_stock'}
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
                      profilePhysical: t('quoteFormProfilePhysical'),
                      profileSocial: t('quoteFormProfileSocial'),
                      profileEcom: t('quoteFormProfileEcom'),
                      profileImporter: t('quoteFormProfileImporter'),
                      vol1: t('quoteFormVol1'),
                      vol2: t('quoteFormVol2'),
                      vol3: t('quoteFormVol3'),
                      vol4: t('quoteFormVol4'),
                      shippingLabel: t('quoteFormShippingLabel'),
                      shippingNone: t('quoteFormShippingNone'),
                      shippingAir: t('quoteFormShippingAir'),
                      shippingSeaTextile: t('quoteFormShippingSeaTextile'),
                      shippingSeaVolume: t('quoteFormShippingSeaVolume'),
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
