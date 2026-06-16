'use server'

import { isValidMediaUrl } from '@/lib/product-media'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from './_guards'
import type {
  WholesaleTier,
  ProductSubmittedVia,
  ProductApprovalStatus,
  ProductAvailabilityType,
  ProductOriginDetail,
  PlatformMarginType,
  MediaItem,
  ImportPricingMode,
  ImportPriceUnit,
  TariffMode,
  ImportShippingMode,
} from '@/types/database'

function shippingModeToUnit(mode: ImportShippingMode | null): ImportPriceUnit {
  return mode === 'sea_volume_cbm' ? 'cbm' : 'kg'
}
import { calculatePlatformPrice, calculateNetAffiliateCommission, MIN_DELIVERY_FEE_MAD, DELIVERY_PROVISION_MAD } from '@/lib/utils'
import { getLogisticsSettings } from './logistics'
import { getRateToMad } from '@/lib/fx'
import { parseMoneyInput } from '@/lib/money'
import { parseRateInput, parsePercentInput } from '@/lib/rate'

export type ProductFormState = { error: string | null }

// ─── Upsert (create or update) ────────────────────────────────────────────────

/**
 * Create or update a product.
 * Pass a hidden `id` field to update; omit it to create.
 *
 * Business rules applied here:
 *  1. purchase_price_mad = local → purchase_price; imported → price × exchange_rate
 *  2. calculated_sale_price_mad = purchase_price_mad × (1 + margin / 100)
 *  3. active is forced to false whenever approval_status !== 'approved'
 *  4. approved_by and approved_at are auto-set when status flips to 'approved'
 *  5. submitted_by is set to the current user on create; preserved on update
 */
export async function upsertProduct(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return { error: authError ?? 'Erreur.' }

  // ── Basic fields ──────────────────────────────────────────────────────────

  const id = (formData.get('id') as string) || null
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string)?.trim()) || null

  // ── Availability (migration 007) ──────────────────────────────────────────

  const availability_type = (formData.get('availability_type') as string) || 'local_stock'
  const origin_detail_raw = (formData.get('origin_detail') as string) || null
  // import_on_demand has no local origin detail
  const origin_detail: string | null =
    availability_type === 'import_on_demand' ? null : origin_detail_raw

  // affiliate_enabled is forced false for import_on_demand
  const affiliate_enabled_raw = formData.get('affiliate_enabled') === 'on'
  const affiliate_enabled = availability_type === 'import_on_demand' ? false : affiliate_enabled_raw

  // ── Sourcing ──────────────────────────────────────────────────────────────

  const supplier_name = ((formData.get('supplier_name') as string)?.trim()) || null
  const origin_country = ((formData.get('origin_country') as string)?.trim()) || null
  const source_notes = ((formData.get('source_notes') as string)?.trim()) || null
  const submitted_via = (formData.get('submitted_via') as string) || 'admin_dashboard'

  // ── Cost & margin ─────────────────────────────────────────────────────────

  // PRIX D'ACHAT (devise source) — validé en CHAÎNE décimale stricte (money.ts),
  // chaîne verbatim stockée : zéro parseFloat. Vide → null (inchangé). Number()
  // dérivé (purchasePriceNum) alimente la conversion FX (= ancien parseFloat).
  const purchasePriceRaw = formData.get('purchase_price')
  const purchasePriceStr = typeof purchasePriceRaw === 'string' ? purchasePriceRaw.trim() : ''
  const purchasePriceR = purchasePriceStr !== '' ? parseMoneyInput(purchasePriceStr) : null
  const purchase_price = purchasePriceR && purchasePriceR.ok ? purchasePriceR.value : null
  const purchasePriceNum = purchasePriceR && purchasePriceR.ok ? Number(purchasePriceR.value) : null

  const purchase_currency = (formData.get('purchase_currency') as string) || 'MAD'
  // Réconciliation Étape 2 : exchange_rate_to_mad devient un OVERRIDE manuel.
  // S'il est fourni (> 0) on le respecte ; sinon, pour une devise ≠ MAD on prend le
  // taux central (current_exchange_rates) ; MAD ⇒ 1. Le calcul aval est inchangé.
  // TAUX override — validé en CHAÎNE décimale stricte (rate.ts, ≤8 déc, > 0) ; la
  // valeur numérique dérivée (Number) alimente la conversion (identique à l'ancien
  // parseFloat). Vide/invalide → null → repli sur le taux central (inchangé).
  const exrR = parseRateInput(formData.get('exchange_rate_to_mad'))
  const exchange_rate_explicit = exrR.ok ? Number(exrR.value) : null
  const exchange_rate_to_mad =
    exchange_rate_explicit !== null && exchange_rate_explicit > 0
      ? exchange_rate_explicit
      : purchase_currency !== 'MAD'
        ? (await getRateToMad(supabase, purchase_currency)) ?? 1
        : 1

  // platform_margin_type: 'percentage' | 'fixed'
  // Accept both the new field name and legacy 'margin_percentage' form field.
  const platform_margin_type = (
    (formData.get('platform_margin_type') as string) || 'percentage'
  ) as PlatformMarginType

  // platform_margin_value: preferred new field; fall back to legacy margin_percentage
  const margin_value_raw =
    formData.get('platform_margin_value') ?? formData.get('margin_percentage')
  // MARGE — % (rate.ts, 0–100) si type 'percentage' ; MONTANT (money.ts) si 'fixed'.
  // Chaîne verbatim stockée ; Number() pour le calcul (= ancien parseFloat pour saisie
  // valide). VIDE → défaut 20 ; 0 explicite CONSERVÉ ; hors bornes/invalide → erreur.
  const marginRawStr = typeof margin_value_raw === 'string' ? margin_value_raw.trim() : ''
  const marginParse =
    platform_margin_type === 'percentage'
      ? parsePercentInput(marginRawStr)
      : parseMoneyInput(marginRawStr)
  let marginInvalid = false
  let platform_margin_value_str: string
  if (marginRawStr === '') {
    platform_margin_value_str = '20' // défaut marge plateforme affilié (stratégie acquisition lancement)
  } else if (!marginParse.ok) {
    platform_margin_value_str = '20'
    marginInvalid = true
  } else {
    // Saisie valide (0 inclus) → conservée VERBATIM. Correctif du piège « 0 → défaut » :
    // un admin qui saisit explicitement 0 % (produit d'appel, vente au coût) obtient
    // bien 0, plus le défaut. Seul le champ VIDE retombe sur le défaut (branche ci-dessus).
    platform_margin_value_str = marginParse.value
  }
  const platform_margin_value = Number(platform_margin_value_str)

  // Keep margin_percentage in sync for backward compat with any legacy reads
  const margin_percentage =
    platform_margin_type === 'percentage' ? platform_margin_value_str : '0'

  // FEES — montants validés (money.ts), chaîne verbatim stockée ; Number() pour la
  // commission préview. Correctif du piège « 0 → défaut » : VIDE → défaut, mais un 0
  // explicite est CONSERVÉ (ex. confirmation gérée par l'affilié → frais 0). Invalide
  // → défaut (comportement inchangé).
  const moneyOrDefault = (raw: FormDataEntryValue | null, def: string): string => {
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (s === '') return def
    const r = parseMoneyInput(s)
    return r.ok ? r.value : def
  }
  const confirmation_fee_mad = moneyOrDefault(formData.get('confirmation_fee_mad'), '10')
  const packaging_fee_mad = moneyOrDefault(formData.get('packaging_fee_mad'), '10')
  const delivery_fee_mad = moneyOrDefault(formData.get('delivery_fee_mad'), '0')
  const confFeeNum = Number(confirmation_fee_mad)
  const packFeeNum = Number(packaging_fee_mad)

  // ── Computed pricing ──────────────────────────────────────────────────────
  // locally_produced → price is already in MAD
  // imported_but_in_morocco_stock | import_on_demand → price needs conversion

  const needsConversion =
    origin_detail === 'imported_but_in_morocco_stock' ||
    availability_type === 'import_on_demand'

  let purchase_price_mad: number | null = null
  let calculated_sale_price_mad: number | null = null

  if (purchasePriceNum !== null) {
    // CONVERSION FX — half-up centimes `Math.round(montant × taux × 100) / 100`
    // (validé @finance + GO Abdou, lot FX). Bascule depuis `toFixed(2)` : ±1 ct sur
    // ~0,1 % des imports tombant pile sur une demi-centime, aux nouveaux/re-saves
    // uniquement (le passé figé n'est jamais re-converti). Convention unique = cohérence audit.
    purchase_price_mad = needsConversion
      ? Math.round(purchasePriceNum * exchange_rate_to_mad * 100) / 100
      : purchasePriceNum

    calculated_sale_price_mad = calculatePlatformPrice(
      purchase_price_mad,
      platform_margin_type,
      platform_margin_value
    )
  }

  // ── Factory cost (migration 016) — explicit MAD cost set by admin ────────

  // RÈGLE ARGENT n°4 — coût usine explicite validé en CHAÎNE décimale stricte (money.ts),
  // passé verbatim à la colonne numeric : zéro parseFloat. Absent → repli sur le
  // purchase_price_mad calculé (inchangé). Saisie invalide (négatif, >2 déc., non
  // numérique) → erreur explicite au lieu d'un repli/arrondi silencieux.
  // `factoryCostNum` (Number d'une chaîne déjà validée ≤2 déc.) ne sert qu'au calcul
  // de la commission préview et à la validation — valeur identique à l'ancien parseFloat.
  const factory_cost_mad_raw = formData.get('factory_cost_mad') as string
  const factoryCostStr =
    typeof factory_cost_mad_raw === 'string' ? factory_cost_mad_raw.trim() : ''
  let factory_cost_mad: string | number | null
  let factoryCostInvalid = false
  if (factoryCostStr !== '') {
    const r = parseMoneyInput(factoryCostStr)
    if (r.ok) factory_cost_mad = r.value
    else {
      factory_cost_mad = null
      factoryCostInvalid = true
    }
  } else {
    factory_cost_mad = purchase_price_mad
  }
  const factoryCostNum = factory_cost_mad === null ? null : Number(factory_cost_mad)

  // ── Règle capital affilié (migration 073) ─────────────────────────────────
  // Pour un produit affilié saisi manuellement (local_stock, affiliate_enabled),
  // le prix catalogue EST le capital : usine + marge + packaging + confirmation + 35.
  // Le champ sell_price du formulaire est IGNORÉ anti-POST-direct — on dérive côté serveur.
  // Même dérivation à la création ET à la mise à jour (y compris approbation).
  //
  // Défense en profondeur (#1 audit @security) : on EXCLUT les miroirs fournisseur
  // (source_supplier_product_id non-null). Leur sell_price capte DÉJÀ la marge du
  // miroir (régression 2026-06-14) — y appliquer la dérivation capital doublonnerait
  // la marge. Périmètre aligné sur le filtre de la migration 073.
  let isMirrorProduct = false
  if (id) {
    const { data: existingMirror } = (await supabase
      .from('products')
      .select('source_supplier_product_id')
      .eq('id', id)
      .single()) as {
        data: { source_supplier_product_id: string | null } | null
        error: unknown
      }
    isMirrorProduct = existingMirror?.source_supplier_product_id != null
  }
  const isAffiliateLocalStock =
    affiliate_enabled === true && availability_type === 'local_stock' && !isMirrorProduct

  // ── Sales fields ──────────────────────────────────────────────────────────

  // RÈGLE ARGENT n°4 — prix de vente validé en CHAÎNE décimale stricte (money.ts),
  // stocké verbatim : zéro parseFloat. `sellPriceNum` (Number d'une chaîne validée
  // ≤2 déc.) ne sert qu'au calcul de la commission préview et à la validation > 0 —
  // valeur identique à l'ancien parseFloat (commission bit-identique).
  const sellPriceR = parseMoneyInput(formData.get('sell_price'))
  let sell_price: string | null = sellPriceR.ok ? sellPriceR.value : null
  let sellPriceNum = sellPriceR.ok ? Number(sellPriceR.value) : NaN
  const wholesale_min_qty = parseInt(formData.get('wholesale_min_qty') as string) || 1
  const stock_count = parseInt(formData.get('stock_count') as string) || 0

  // ── Dérivation prix catalogue (capital) pour produits affiliés locaux ─────
  // Appliqué AVANT la validation sell_price → la garde passe sur la valeur dérivée.
  if (isAffiliateLocalStock) {
    // Coût usine explicite obligatoire (pas de repli sur purchase_price_mad).
    if (factoryCostStr === '') {
      return { error: 'Le coût usine (prix_usine) est obligatoire pour un produit affilié.' }
    }
    if (factoryCostNum !== null) {
      // capital = calculatePlatformPrice(usine, marge) + packaging + confirmation + provision livraison
      const capital =
        calculatePlatformPrice(factoryCostNum, platform_margin_type, platform_margin_value) +
        packFeeNum +
        confFeeNum +
        DELIVERY_PROVISION_MAD
      sell_price = capital.toFixed(2)
      sellPriceNum = capital
    }
  }

  // ── Auto-compute commission from cost formula ─────────────────────────────
  // commission = sell_price − factory_cost − platform_margin − delivery_fee − confirmation_fee − packaging_fee
  // Returns 0 when affiliate is disabled or factory_cost_mad is not set yet.

  // Base de livraison de l'aperçu — différenciée selon le type de produit :
  // - affilié local (capital rule) : provision fixe 35 incluse dans le prix →
  //   commission au prix catalogue = 0 exactement (cohérent avec la règle capital).
  // - autres produits : défaut logistique planché (D2), identique à l'affichage.
  const logisticsSettings = isAffiliateLocalStock ? null : await getLogisticsSettings()
  const previewDeliveryFee = isAffiliateLocalStock
    ? DELIVERY_PROVISION_MAD
    : Math.max(
        MIN_DELIVERY_FEE_MAD,
        logisticsSettings ? Number(logisticsSettings.default_delivery_fee_mad) : 35
      )

  const commission_amount: number = (() => {
    if (!affiliate_enabled || factoryCostNum === null) return 0
    const raw = calculateNetAffiliateCommission({
      affiliateSellPrice: sellPriceNum,
      factoryCostMad: factoryCostNum,
      marginType: platform_margin_type,
      marginValue: platform_margin_value,
      packagingFee: packFeeNum,
      // Affilié local : provision fixe (dans le capital) → commission au catalogue = 0.
      // Autres : défaut logistique planché (D2).
      deliveryFee: previewDeliveryFee,
      confirmationFee: confFeeNum,
      quantity: 1,
    })
    return Math.max(0, raw)
  })()

  // ── Import-on-demand display fields (migrations 019 + 020) ──────────────
  // Only stored when availability_type = 'import_on_demand'; cleared otherwise.

  const estimated_delivery_days_raw = formData.get('estimated_delivery_days') as string
  const estimated_delivery_days: number | null =
    availability_type === 'import_on_demand' && estimated_delivery_days_raw
      ? parseInt(estimated_delivery_days_raw) || null
      : null

  // ── Tariff mode (migration 021) ───────────────────────────────────────────
  const tariff_mode_raw = (formData.get('tariff_mode') as string) || 'global'
  const tariff_mode: TariffMode =
    availability_type === 'import_on_demand' &&
    (tariff_mode_raw === 'global' || tariff_mode_raw === 'custom')
      ? tariff_mode_raw
      : 'global'

  // ── Import shipping mode (migration 022) — must be declared before import_price_unit ──
  const import_shipping_mode_raw = (formData.get('import_shipping_mode') as string) || null
  const import_shipping_mode: ImportShippingMode | null =
    availability_type === 'import_on_demand' &&
    import_shipping_mode_raw !== null &&
    ['air_door_to_door_kg', 'sea_textile_kg', 'sea_volume_cbm'].includes(import_shipping_mode_raw)
      ? (import_shipping_mode_raw as ImportShippingMode)
      : null

  // ── Migration 020 — import cost model (legacy fields kept for backward compat) ──
  // RÈGLE ARGENT n°4 — prix d'import estimé validé en CHAÎNE décimale stricte (money.ts),
  // passé verbatim : zéro parseFloat. Affichage seul, aucun calcul. Vide/zéro/invalide → null.
  const estimated_import_price_mad_raw = formData.get('estimated_import_price_mad') as string
  const estimatedImportR =
    availability_type === 'import_on_demand' && estimated_import_price_mad_raw
      ? parseMoneyInput(estimated_import_price_mad_raw)
      : null
  const estimated_import_price_mad: string | null =
    estimatedImportR && estimatedImportR.ok && !/^0+(\.0+)?$/.test(estimatedImportR.value)
      ? estimatedImportR.value
      : null

  // Unit auto-derived from shipping mode
  const import_price_unit: ImportPriceUnit | null =
    availability_type === 'import_on_demand' && import_shipping_mode !== null
      ? shippingModeToUnit(import_shipping_mode)
      : null

  const import_notes_raw = ((formData.get('import_notes') as string) || '').trim()
  const import_notes: string | null =
    availability_type === 'import_on_demand' && import_notes_raw ? import_notes_raw : null

  // Keep estimated_cost_mad in sync with estimated_import_price_mad for backward compat
  const estimated_cost_mad: string | null = estimated_import_price_mad

  // ── Approval ──────────────────────────────────────────────────────────────

  const approval_status = (formData.get('approval_status') as string) || 'draft'
  const active_raw = formData.get('active') === 'on'

  // Gate: active only allowed when approved
  const active = approval_status === 'approved' ? active_raw : false

  // ── Validation ────────────────────────────────────────────────────────────

  if (!name) return { error: 'Le nom du produit est requis.' }
  if (!['local_stock', 'import_on_demand'].includes(availability_type))
    return { error: 'Type de disponibilité invalide.' }
  if (
    availability_type === 'local_stock' &&
    origin_detail &&
    !['locally_produced', 'imported_but_in_morocco_stock'].includes(origin_detail)
  )
    return { error: "Origine du produit invalide." }
  if (!['draft', 'pending_review', 'approved', 'rejected'].includes(approval_status))
    return { error: "Statut d'approbation invalide." }
  if (!['admin_dashboard', 'telegram_future', 'supplier_future'].includes(submitted_via))
    return { error: 'Canal de soumission invalide.' }
  if (!['MAD', 'USD', 'AED'].includes(purchase_currency))
    return { error: 'Devise invalide. Utilisez MAD, USD ou AED.' }
  if (!sellPriceR.ok || sellPriceNum <= 0)
    return { error: 'Le prix de vente doit être supérieur à 0 MAD.' }
  if (factoryCostInvalid)
    return { error: 'Le coût usine doit être un montant valide (max 2 décimales).' }
  if (factoryCostNum !== null && factoryCostNum < 0)
    return { error: 'Le coût usine ne peut pas être négatif.' }
  if (wholesale_min_qty < 1) return { error: 'La quantité minimale doit être ≥ 1.' }
  if (stock_count < 0) return { error: 'Le stock ne peut pas être négatif.' }
  if (exchange_rate_to_mad <= 0)
    return { error: "Le taux de change doit être supérieur à 0." }
  if (!['percentage', 'fixed'].includes(platform_margin_type))
    return { error: 'Type de marge invalide. Utilisez percentage ou fixed.' }
  if (marginInvalid)
    return { error: 'La marge est invalide (pourcentage 0–100, ou montant ≥ 0 si marge fixe).' }

  // ── Parse JSON fields ─────────────────────────────────────────────────────

  // VALIDATION SERVEUR des paliers (défense en profondeur) : le client sérialise les
  // paliers en JSON dans un champ caché ; on ne fait JAMAIS confiance au prix client
  // (un POST direct pourrait injecter un prix négatif, NaN, >2 déc ou aberrant). Chaque
  // palier doit avoir min_qty entier ≥ 1 et price_per_unit fini, > 0, à ≤ 2 décimales
  // (RÈGLE ARGENT n°4). Un palier malformé est ÉCARTÉ (même filtre que le client rowToTier).
  let wholesale_tiers: WholesaleTier[] = []
  try {
    const rawTiers = JSON.parse((formData.get('wholesale_tiers') as string) || '[]')
    if (!Array.isArray(rawTiers)) return { error: 'Format des paliers de prix invalide.' }
    if (rawTiers.length > 20) return { error: 'Trop de paliers de prix (maximum 20).' }
    wholesale_tiers = rawTiers
      .filter((t: unknown): t is WholesaleTier => {
        if (typeof t !== 'object' || t === null) return false
        const { min_qty: minQty, max_qty: maxQty, price_per_unit: price } = t as Record<string, unknown>
        if (typeof minQty !== 'number' || !Number.isInteger(minQty) || minQty < 1) return false
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return false
        if (Number(price.toFixed(2)) !== price) return false // > 2 décimales → rejet
        if (maxQty != null && (typeof maxQty !== 'number' || !Number.isInteger(maxQty) || maxQty < minQty)) return false
        return true
      })
      .map((t) => ({
        min_qty: t.min_qty,
        max_qty: t.max_qty ?? undefined,
        price_per_unit: t.price_per_unit,
      }))
    // Cohérence inter-paliers : tri croissant par min_qty + rejet des doublons et
    // chevauchements. getWholesaleTier prend le PREMIER match (.find) → sans cet ordre,
    // un chevauchement rendrait le prix facturé dépendant de l'ordre du tableau (manipulable).
    wholesale_tiers.sort((a, b) => a.min_qty - b.min_qty)
    for (let i = 1; i < wholesale_tiers.length; i++) {
      const prev = wholesale_tiers[i - 1]
      const cur = wholesale_tiers[i]
      if (cur.min_qty <= prev.min_qty) return { error: 'Paliers de prix en doublon ou mal ordonnés.' }
      if (prev.max_qty != null && prev.max_qty >= cur.min_qty) return { error: 'Paliers de prix qui se chevauchent.' }
    }
  } catch {
    return { error: 'Format des paliers de prix invalide.' }
  }

  // media — new JSONB array [{url, type}]
  let media: MediaItem[] = []
  try {
    const parsed = JSON.parse((formData.get('media') as string) || '[]') as MediaItem[]
    media = parsed.filter((m) => {
      if (!m?.url?.trim()) return false
      return isValidMediaUrl(m.url)
    })
  } catch {
    media = []
  }

  // legacy images — derive from media for backward compat with any pages still using images[]
  const images = media.filter((m) => m.type === 'image').map((m) => m.url)

  // ── Build payload ─────────────────────────────────────────────────────────

  const now = new Date().toISOString()

  const base = {
    name,
    description,
    availability_type: availability_type as ProductAvailabilityType,
    origin_detail: origin_detail as ProductOriginDetail | null,
    affiliate_enabled,
    supplier_name,
    origin_country,
    submitted_via: submitted_via as ProductSubmittedVia,
    source_notes,
    purchase_price,
    purchase_currency,
    exchange_rate_to_mad,
    purchase_price_mad,
    margin_percentage,
    calculated_sale_price_mad,
    platform_margin_type,
    platform_margin_value: platform_margin_value_str,
    factory_cost_mad,
    confirmation_fee_mad,
    packaging_fee_mad,
    delivery_fee_mad,
    approval_status: approval_status as ProductApprovalStatus,
    active,
    sell_price,
    commission_amount,
    wholesale_min_qty,
    wholesale_tiers,
    stock_count,
    media,
    images,
    estimated_cost_mad: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : estimated_cost_mad,
    estimated_delivery_days: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : estimated_delivery_days,
    import_pricing_mode: null as ImportPricingMode | null,
    estimated_import_price_mad: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : estimated_import_price_mad,
    import_price_unit: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : import_price_unit,
    import_notes: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : import_notes,
    tariff_mode,
    import_shipping_mode: availability_type === 'import_on_demand' ? import_shipping_mode : null,
  }

  if (id) {
    // ── Update ──────────────────────────────────────────────────────────────

    // Fetch current record to check previous approval_status
    const { data: existing } = await supabase
      .from('products')
      .select('approval_status, approved_by, approved_at, submitted_by')
      .eq('id', id)
      .single() as {
        data: {
          approval_status: string
          approved_by: string | null
          approved_at: string | null
          submitted_by: string | null
        } | null
        error: unknown
      }

    const wasApproved = existing?.approval_status === 'approved'
    const isNowApproved = approval_status === 'approved'

    const updatePayload = {
      ...base,
      // Set approved_by/at when transitioning to approved
      approved_by:
        isNowApproved && !wasApproved
          ? userId
          : isNowApproved
          ? (existing?.approved_by ?? userId)
          : null,
      approved_at:
        isNowApproved && !wasApproved
          ? now
          : isNowApproved
          ? (existing?.approved_at ?? now)
          : null,
    }

    const { error } = await supabase.from('products').update(updatePayload).eq('id', id)
    if (error) return { error: error.message }
  } else {
    // ── Create ──────────────────────────────────────────────────────────────

    const insertPayload = {
      ...base,
      submitted_by: userId,
      approved_by: approval_status === 'approved' ? userId : null,
      approved_at: approval_status === 'approved' ? now : null,
    }

    const { error } = await supabase.from('products').insert(insertPayload)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/products')
  redirect('/admin/products')
}

// ─── Toggle active ────────────────────────────────────────────────────────────

/**
 * Toggle active flag.
 * Refuses to activate a product that is not yet approved.
 */
export async function toggleProductActive(id: string, newActive: boolean): Promise<void> {
  const { supabase, error } = await requireAdmin()
  if (error) return

  if (newActive) {
    // Guard: only allow activation if product is approved
    const { data } = await supabase
      .from('products')
      .select('approval_status')
      .eq('id', id)
      .single() as { data: { approval_status: string } | null; error: unknown }

    if (data?.approval_status !== 'approved') return
  }

  await supabase.from('products').update({ active: newActive }).eq('id', id)
  revalidatePath('/admin/products')
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteProduct(id: string): Promise<void> {
  const { supabase, error } = await requireAdmin()
  if (error) return

  await supabase.from('products').delete().eq('id', id)
  revalidatePath('/admin/products')
}
