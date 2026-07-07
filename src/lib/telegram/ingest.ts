// ─── Orchestration ingestion Telegram → supplier_products ────────────────────
// Identité résolue, idempotence via staging, upload image, UNE passe IA, insert
// en 'pending_review', puis modération RÉUTILISÉE (moderateSupplierProduct).
// Écrit exclusivement via service_role (côté serveur). Jamais depuis le client.

import { createAdminClient } from '@/lib/supabase/admin'
import { moderateSupplierProduct } from '@/lib/supplier-product-moderation'
import { extractProductFromTelegram, extractProductReply } from './extract'
import { photoIssueDecision } from './photo-quality'
import { telegramDownloadPhoto, telegramSendMessage } from './client'
import { buildSupplierWelcome } from './welcome'
import {
  msgLinkCodeInvalid,
  msgAlreadyLinked,
  msgCodeNotFound,
  msgCodeExpired,
  msgLinkFailed,
  msgLinkedSuccess,
  msgNotLinkedYet,
  msgRateLimited,
  msgNoCountry,
  msgLimitReached,
  msgPriceWithMad,
  msgPriceNoRate,
  msgPriceUnknown,
  msgProductReceived,
  msgAnalysisFailed,
  msgGuide,
  msgAskPrice,
  msgAskPriceAndTiers,
  msgReexplain,
  msgAskTiers,
  msgAskTierQty,
  msgReaskPrice,
  msgReaskTiers,
  msgConfirmUnit,
  msgReaskUnit,
  msgPhotoNotProduct,
  msgPhotoBlurry,
} from './messages'
import {
  decideAwaiting,
  interpretPriceReply,
  interpretTiersReply,
  interpretUnitReply,
  isConfusedReply,
  shouldReask,
} from './conversation'
import {
  upsertPending,
  getMostRecentPending,
  deletePending,
  bumpReask,
  switchPendingTo,
  type PendingRow,
} from './pending-store'
import { resolveSupplierCurrency, composePricing } from '@/lib/supplier-pricing'
import { matchKnownSaleUnit } from '@/lib/units'
import { getRateToMad } from '@/lib/fx'
import { checkProductLimit } from '@/lib/product-limit'
import { insertMoqTiers } from '@/lib/supplier/moq-tiers'
import {
  buildMessageKey,
  isValidLinkCodeFormat,
  pickLargestPhoto,
  type TelegramMessage,
  type TelegramUpdate,
} from './schema'

type Admin = ReturnType<typeof createAdminClient>

const BUCKET = 'supplier-product-images'
const UNIQUE_VIOLATION = '23505'
// Anti-abus : plafond de produits acceptés par compte Telegram et par heure
// (borne le coût IA/Storage même pour un fournisseur lié légitime).
const MAX_PRODUCTS_PER_HOUR = 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function nowIso(): string {
  return new Date().toISOString()
}

async function markInbound(admin: Admin, messageKey: string, fields: Record<string, unknown>): Promise<void> {
  await admin
    .from('telegram_inbound')
    .update({ ...fields, processed_at: nowIso() })
    .eq('telegram_message_id', messageKey)
}

type StagingClaim = {
  telegram_message_id: string
  telegram_user_id: number
  telegram_chat_id: number
  caption: string | null
  photo_file_id: string
  supplier_id: string | null
}

/**
 * Claim du staging — idempotence ET reprise après crash.
 * 'proceed' : nouvelle ligne, ou ligne bloquée (processing/failed/received) sans
 * produit → on (re)traite. 'skip' : déjà traité terminalement (produit créé,
 * inserted/duplicate/rejected) → ne rien refaire.
 */
async function ensureStagingClaim(admin: Admin, params: StagingClaim): Promise<'proceed' | 'skip'> {
  const { error } = await admin.from('telegram_inbound').insert({ ...params, status: 'processing' })
  if (!error) return 'proceed'
  if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message)

  const { data } = await admin
    .from('telegram_inbound')
    .select('status, supplier_product_id')
    .eq('telegram_message_id', params.telegram_message_id)
    .maybeSingle()
  const row = data as { status: string; supplier_product_id: string | null } | null
  if (!row) return 'skip'
  if (row.supplier_product_id || ['inserted', 'duplicate', 'rejected'].includes(row.status)) {
    return 'skip'
  }
  // Bloqué après un crash → on relance le traitement.
  await admin
    .from('telegram_inbound')
    .update({ status: 'processing', error: null })
    .eq('telegram_message_id', params.telegram_message_id)
  return 'proceed'
}

async function countRecentInbound(admin: Admin, telegramUserId: number): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await admin
    .from('telegram_inbound')
    .select('id', { count: 'exact', head: true })
    .eq('telegram_user_id', telegramUserId)
    .gte('created_at', since)
  return count ?? 0
}

/**
 * Résout le fournisseur lié à un compte Telegram.
 * Sécurité : on vérifie que le profil a TOUJOURS le rôle 'supplier' — l'insert
 * produit passe par service_role (contourne la RLS), donc ce contrôle est à
 * notre charge.
 */
async function resolveSupplierId(admin: Admin, telegramUserId: number): Promise<string | null> {
  const { data: link } = await admin
    .from('telegram_supplier_links')
    .select('supplier_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()

  const supplierId = (link as { supplier_id: string } | null)?.supplier_id
  if (!supplierId) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', supplierId)
    .maybeSingle()

  if ((profile as { role: string } | null)?.role !== 'supplier') return null
  return supplierId
}

// ── Commande de liaison : /link <code> ───────────────────────────────────────

async function handleLinkCommand(admin: Admin, msg: TelegramMessage, codeRaw: string): Promise<void> {
  const chatId = msg.chat.id
  const telegramUserId = msg.from!.id
  const lc = msg.from!.language_code
  const code = codeRaw.trim().toUpperCase()

  if (!isValidLinkCodeFormat(code)) {
    await telegramSendMessage(chatId, msgLinkCodeInvalid(lc))
    return
  }

  // Déjà lié ?
  const existingId = await resolveSupplierId(admin, telegramUserId)
  if (existingId) {
    await telegramSendMessage(chatId, msgAlreadyLinked(lc))
    return
  }

  const { data: row } = await admin
    .from('telegram_supplier_links')
    .select('id, supplier_id, link_code_expires_at')
    .eq('link_code', code)
    .is('telegram_user_id', null)
    .maybeSingle()

  const link = row as { id: string; supplier_id: string; link_code_expires_at: string | null } | null
  if (!link) {
    await telegramSendMessage(chatId, msgCodeNotFound(lc))
    return
  }
  if (link.link_code_expires_at && new Date(link.link_code_expires_at).getTime() < Date.now()) {
    await telegramSendMessage(chatId, msgCodeExpired(lc))
    return
  }

  // Confirmation : on écrit telegram_user_id (réservé service_role). Garde anti-course.
  const { error } = await admin
    .from('telegram_supplier_links')
    .update({
      telegram_user_id: telegramUserId,
      telegram_username: msg.from!.username ?? null,
      linked_at: nowIso(),
      link_code: null,
      link_code_expires_at: null,
    })
    .eq('id', link.id)
    .is('telegram_user_id', null)

  if (error) {
    await telegramSendMessage(chatId, msgLinkFailed(lc))
    return
  }

  // Notif in-app au fournisseur : son Telegram vient d'être lié (sécurité — il peut
  // repérer une liaison qu'il n'aurait pas initiée). Best-effort : ne bloque jamais
  // la liaison. Insert service_role (aucune policy INSERT client sur notifications).
  try {
    await admin.from('notifications').insert({
      recipient_id: link.supplier_id,
      event: 'supplier_telegram_linked',
      payload: { telegramUsername: msg.from!.username ?? null },
      channels: ['in_app'],
    })
  } catch (e) {
    console.error('notify supplier_telegram_linked', e)
  }

  await telegramSendMessage(chatId, msgLinkedSuccess(lc))
}

// ── Ingestion d'un message produit (photo + légende) ─────────────────────────

async function ingestProductMessage(admin: Admin, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id
  const telegramUserId = msg.from!.id
  const lc = msg.from!.language_code
  const messageKey = buildMessageKey(msg.chat.id, msg.message_id)
  const largest = pickLargestPhoto(msg.photo ?? [])
  if (!largest) return

  const supplierId = await resolveSupplierId(admin, telegramUserId)

  // Idempotence + reprise après crash (claim atomique du staging).
  const claim = await ensureStagingClaim(admin, {
    telegram_message_id: messageKey,
    telegram_user_id: telegramUserId,
    telegram_chat_id: chatId,
    caption: msg.caption ?? null,
    photo_file_id: largest.file_id,
    supplier_id: supplierId,
  })
  if (claim === 'skip') return

  // Compte non lié → on journalise et on guide, aucun produit créé.
  if (!supplierId) {
    await markInbound(admin, messageKey, { status: 'rejected', error: 'compte_non_lie' })
    await telegramSendMessage(chatId, msgNotLinkedYet(lc))
    return
  }

  // Anti-abus / coût IA : plafond par compte Telegram et par heure.
  if ((await countRecentInbound(admin, telegramUserId)) > MAX_PRODUCTS_PER_HOUR) {
    await markInbound(admin, messageKey, { status: 'rejected', error: 'rate_limit' })
    await telegramSendMessage(chatId, msgRateLimited(lc))
    return
  }

  // Devise de saisie = devise du PAYS du fournisseur. Pas de pays → soumission
  // BLOQUÉE (avant l'IA, pour ne pas dépenser de tokens). Jamais de MAD supposé.
  const db = admin as unknown as Parameters<typeof resolveSupplierCurrency>[0]
  const currency = await resolveSupplierCurrency(db, supplierId)
  if (!currency) {
    await markInbound(admin, messageKey, { status: 'rejected', error: 'no_country' })
    await telegramSendMessage(chatId, msgNoCountry(lc))
    return
  }

  // Limite de produits (abonnement) — barrière serveur (Telegram), avant l'IA.
  const limit = await checkProductLimit(db, supplierId)
  if (limit.isAtLimit) {
    await markInbound(admin, messageKey, { status: 'rejected', error: 'limit_reached' })
    await telegramSendMessage(
      chatId,
      msgLimitReached(lc, {
        current: limit.currentCount,
        max: limit.maxAllowed,
        plan: limit.planName,
      }),
    )
    return
  }

  try {
    // Durcissement anti-régression : le préfixe d'isolation Storage doit être un UUID.
    if (!UUID_RE.test(supplierId)) throw new Error('supplier_id invalide')

    const photo = await telegramDownloadPhoto(largest.file_id)

    const safeKey = messageKey.replace(/[^a-zA-Z0-9_-]/g, '_')
    const path = `${supplierId}/${safeKey}.${photo.ext}`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, photo.bytes, { contentType: photo.mediaType, upsert: false })
    // Objet déjà présent (reprise après crash) → on réutilise le même chemin.
    if (upErr && !/exist|duplicate/i.test(upErr.message)) throw new Error(`upload: ${upErr.message}`)
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

    const clean = await extractProductFromTelegram({
      caption: msg.caption ?? null,
      imageBase64: photo.base64,
      imageMediaType: photo.mediaType,
    })

    // C2 — contrôle qualité photo (verdict IA du MÊME appel d'extraction).
    // NON-PRODUIT (selfie, capture, texte…) → on ne crée AUCUNE fiche, on guide le
    // fournisseur vers une vraie photo. FLOU → on crée quand même (vrai produit) +
    // flag admin + invitation à renvoyer une photo nette (géré plus bas).
    const photoDecision = photoIssueDecision(clean.photo_issue)
    if (photoDecision.block) {
      await telegramSendMessage(chatId, msgPhotoNotProduct(lc))
      await markInbound(admin, messageKey, { status: 'rejected', error: 'photo_not_product' })
      return
    }

    const productName =
      clean.product_name ||
      msg.caption?.trim().slice(0, 80) ||
      'Produit Telegram (à compléter)'

    // Conversion devise source → MAD via le taux admin figé (snapshot).
    // Taux absent → mad NULL + flag (jamais 1, jamais deviné).
    const rate = await getRateToMad(db, currency)
    const pricing = composePricing(currency, rate, clean.price_source)

    // Paliers de gros dégressifs : déjà VALIDÉS par sanitizeMoqTiers (Lot 1) dans
    // buildCleanExtraction (triés, prix strictement décroissant, échelle douteuse
    // → []). Le 1er palier (le plus petit) porte le MINIMUM de commande ; aucun
    // palier → min_quantity = 1 (défaut historique strictement inchangé).
    const moqTiers = clean.moq_tiers
    const minQuantity = moqTiers[0]?.min_quantity ?? 1

    // Insert en pending_review — JAMAIS publié directement.
    const { data: inserted, error: prodErr } = await admin
      .from('supplier_products')
      .insert({
        supplier_id: supplierId,
        supplier_type: 'morocco',
        product_name: productName,
        category: clean.category,
        subcategory: clean.subcategory,
        niche: clean.subcategory,
        description: clean.description,
        photos: [publicUrl],
        min_quantity: minQuantity,
        origin_country: 'Maroc',
        availability_type: 'local_stock',
        target_buyer_type: 'wholesaler',
        suggested_wholesale_price_mad: pricing.suggested_wholesale_price_mad,
        source_currency: pricing.source_currency,
        price_source: pricing.price_source,
        fx_rate_source_to_mad: pricing.fx_rate_source_to_mad,
        stock_quantity: clean.stock_quantity,
        // V5-bis.3 — déclaration via bot Telegram = mode 'telegram' ; horodate la
        // fraîcheur du stock UNIQUEMENT si un stock est réellement déclaré.
        stock_mode: 'telegram',
        stock_quantity_updated_at: clean.stock_quantity != null ? nowIso() : null,
        lead_time_days: clean.lead_time_days,
        // C1a — unité de vente en TEXTE LIBRE devinée par l'IA. On NE pose `unit` QUE
        // si ce n'est PAS une « pièce » (toute variante FR/AR/darija reconnue comme
        // pièce → on laisse le défaut colonne 'pcs') : produit sans unité strictement
        // inchangé (RÈGLE ABSOLUE). Le libre (« botte ») est stocké verbatim.
        ...(matchKnownSaleUnit(clean.unit) !== 'piece' ? { unit: clean.unit } : {}),
        // P3 — conditionnement DESCRIPTIF, posé UNIQUEMENT si détecté (les deux champs).
        // Non détecté → colonnes NULL → aucun conditionnement affiché (inchangé).
        ...(clean.pack_size != null && clean.pack_unit != null
          ? { pack_size: clean.pack_size, pack_unit: clean.pack_unit }
          : {}),
        approval_status: 'pending_review',
        source: 'telegram',
        telegram_message_id: messageKey,
      })
      .select('id')
      .single()

    // Double-garde idempotence : index unique sur telegram_message_id.
    if (prodErr) {
      if (prodErr.code === UNIQUE_VIOLATION) {
        await markInbound(admin, messageKey, { status: 'duplicate' })
        return
      }
      throw new Error(`insert produit: ${prodErr.message}`)
    }

    const productId = (inserted as { id: string }).id

    // Paliers (Lot 2) — best-effort comme le web/CSV : une erreur d'insert de
    // palier ne casse JAMAIS l'ingestion (la fiche est déjà en pending_review,
    // l'admin peut corriger). Prix VERBATIM en devise source (unit_price →
    // unit_price_usd) ; la conversion FX + marge se fait à l'approbation admin.
    const { error: tierErr } = await insertMoqTiers(
      admin,
      productId,
      moqTiers.map((t) => ({ min_quantity: t.min_quantity, unit_price_usd: t.unit_price })),
    )
    // Best-effort (n'interrompt jamais l'ingestion) MAIS observable — parité avec
    // le log CAT-IA-SUGGEST plus bas (finding @finance : ne pas rester silencieux).
    if (tierErr) console.error('ingest: insertMoqTiers', productId, tierErr)

    // Modération RÉUTILISÉE (même moteur que le formulaire web et l'import CSV).
    const moderation = moderateSupplierProduct({
      product_name: productName,
      description: clean.description,
      photos: [publicUrl],
      category: clean.category,
      min_quantity: minQuantity,
      stock_quantity: clean.stock_quantity,
      lead_time_days: clean.lead_time_days,
      suggested_wholesale_price_mad: pricing.suggested_wholesale_price_mad,
      supplier_unit_price_usd: null,
      moq_tier_count: moqTiers.length,
    })
    // C2 — photo FLOUE : fusionne le signal 'blurry_photo' et force au minimum une
    // revue admin (une fiche saine ne doit pas être auto-approuvée avec photo floue).
    const mergedSignals = photoDecision.signal
      ? [...new Set([...moderation.moderation_signals, photoDecision.signal])]
      : moderation.moderation_signals
    const mergedFlag =
      photoDecision.signal && moderation.moderation_flag === 'approved'
        ? 'review_required'
        : moderation.moderation_flag
    await admin
      .from('supplier_products')
      .update({
        moderation_flag: mergedFlag,
        ai_risk_score: moderation.ai_risk_score,
        moderation_reason: moderation.moderation_reason,
        moderation_signals: mergedSignals,
      })
      .eq('id', productId)

    // CAT-IA-SUGGEST — l'IA n'a trouvé AUCUNE catégorie correspondante et a proposé
    // un nouveau libellé (alors category='Autres', le filet). On range la proposition
    // dans la FILE DE VALIDATION (un valideur tranchera). BEST-EFFORT : un échec ici
    // ne bloque JAMAIS l'ingestion ; le produit reste utilisable sur 'Autres'.
    // Idempotent : index unique partiel (1 suggestion en attente par produit).
    if (clean.category === 'Autres' && clean.suggested_category) {
      const { error: sugErr } = await admin.from('category_suggestions').insert({
        supplier_product_id: productId,
        proposed_label: clean.suggested_category,
        source: 'telegram_ai',
      })
      if (sugErr && sugErr.code !== UNIQUE_VIOLATION) {
        console.error('category_suggestion insert:', sugErr.message)
      }
    }

    await markInbound(admin, messageKey, {
      status: 'inserted',
      supplier_product_id: productId,
      ai_extraction: clean,
    })

    // C2 — photo FLOUE : la fiche est créée (vrai produit) ; on invite le
    // fournisseur à renvoyer une photo nette AVANT de poursuivre le flux normal
    // (prix/unité). Best-effort, n'interrompt jamais la conversation.
    if (photoDecision.signal === 'blurry_photo') {
      await telegramSendMessage(chatId, msgPhotoBlurry(lc, { name: productName }))
    }

    // BRIQUE 3 — le produit est-il COMPLET, ou faut-il DEMANDER l'info manquante ?
    // Prix absent → on demande le prix ; prix présent sans palier → on propose les
    // paliers. Sinon (complet) → accusé de réception classique. Une question à la fois.
    // BRIQUE 3 / C1a — le prix manque-t-il ? Sinon on CONFIRME directement l'unité.
    // `proposed_unit` (unité détectée par l'IA, texte libre) est mémorisé dans les
    // DEUX cas → réutilisé pour la confirmation, avant ou après le prix.
    const awaiting = decideAwaiting({ price_source: clean.price_source, moq_tiers: moqTiers })
    if (awaiting === 'price') {
      // Prix manquant → on le demande d'abord (l'unité sera confirmée APRÈS le prix).
      await upsertPending(admin, {
        supplier_product_id: productId,
        supplier_id: supplierId,
        telegram_chat_id: chatId,
        telegram_lang: lc ?? null,
        awaiting: 'price',
        proposed_unit: clean.unit,
      })
      await telegramSendMessage(chatId, msgAskPriceAndTiers(lc, { name: productName }))
    } else {
      // Prix déjà présent (légende) → étape de CONFIRMATION de l'unité de vente (C1a).
      // L'accusé « reçu ✅ » n'est envoyé qu'APRÈS la confirmation (finalizeProduct).
      await upsertPending(admin, {
        supplier_product_id: productId,
        supplier_id: supplierId,
        telegram_chat_id: chatId,
        telegram_lang: lc ?? null,
        awaiting: 'unit',
        proposed_unit: clean.unit,
      })
      await telegramSendMessage(chatId, msgConfirmUnit(lc, { unit: clean.unit }))
    }
  } catch (e) {
    await markInbound(admin, messageKey, {
      status: 'failed',
      error: String(e instanceof Error ? e.message : e),
    })
    await telegramSendMessage(chatId, msgAnalysisFailed(lc))
  }
}

// ─── BRIQUE 3 — Complétion conversationnelle d'un produit en attente ──────────

type AckFields = {
  productName: string
  category: string
  subcategory: string
  suggested_wholesale_price_mad: number | null
  price_source: number | null
  source_currency: string | null
}

/** Accusé « Produit reçu ✅ » — ligne prix dérivée des champs FIGÉS du produit. */
function buildProductAck(lc: string | null | undefined, a: AckFields): string {
  const priceLine =
    a.suggested_wholesale_price_mad != null
      ? msgPriceWithMad(lc, { price: a.price_source ?? '?', currency: a.source_currency, mad: a.suggested_wholesale_price_mad })
      : a.source_currency != null && a.price_source != null
        ? msgPriceNoRate(lc, { price: a.price_source, currency: a.source_currency })
        : msgPriceUnknown(lc)
  return msgProductReceived(lc, {
    productName: a.productName,
    category: a.category,
    subcategory: a.subcategory,
    priceLine,
  })
}

type ProductAckRow = AckFields & {
  description: string | null
  photos: string[] | null
  min_quantity: number
  stock_quantity: number | null
  lead_time_days: number | null
}

/** Relit les champs du produit nécessaires à l'accusé + à la re-modération. */
async function fetchProductForAck(admin: Admin, productId: string): Promise<ProductAckRow | null> {
  const { data } = await admin
    .from('supplier_products')
    .select('product_name, category, subcategory, description, photos, min_quantity, stock_quantity, lead_time_days, suggested_wholesale_price_mad, price_source, source_currency')
    .eq('id', productId)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    productName: (r.product_name as string) ?? '',
    category: (r.category as string) ?? '',
    subcategory: (r.subcategory as string) ?? '',
    description: (r.description as string | null) ?? null,
    photos: (r.photos as string[] | null) ?? null,
    min_quantity: (r.min_quantity as number) ?? 1,
    stock_quantity: (r.stock_quantity as number | null) ?? null,
    lead_time_days: (r.lead_time_days as number | null) ?? null,
    suggested_wholesale_price_mad: (r.suggested_wholesale_price_mad as number | null) ?? null,
    price_source: (r.price_source as number | null) ?? null,
    source_currency: (r.source_currency as string | null) ?? null,
  }
}

/** Re-modère le produit désormais complété (mêmes règles que le flux photo). */
async function rerunModeration(admin: Admin, productId: string, moqTierCount: number): Promise<void> {
  const p = await fetchProductForAck(admin, productId)
  if (!p) return
  const moderation = moderateSupplierProduct({
    product_name: p.productName,
    description: p.description,
    photos: p.photos ?? [],
    category: p.category,
    min_quantity: p.min_quantity,
    stock_quantity: p.stock_quantity,
    lead_time_days: p.lead_time_days,
    suggested_wholesale_price_mad: p.suggested_wholesale_price_mad,
    supplier_unit_price_usd: null,
    moq_tier_count: moqTierCount,
  })
  await admin
    .from('supplier_products')
    .update({
      moderation_flag: moderation.moderation_flag,
      ai_risk_score: moderation.ai_risk_score,
      moderation_reason: moderation.moderation_reason,
      moderation_signals: moderation.moderation_signals,
    })
    .eq('id', productId)
}

/** Fige le PRIX (± paliers) obtenu par réponse sur le produit (conversion FX incluse). */
async function applyPriceToProduct(
  admin: Admin,
  productId: string,
  supplierId: string,
  price: number,
  tiers: { min_quantity: number; unit_price: number }[],
): Promise<void> {
  const db = admin as unknown as Parameters<typeof resolveSupplierCurrency>[0]
  const currency = await resolveSupplierCurrency(db, supplierId)
  const rate = currency ? await getRateToMad(db, currency) : null
  const pricing = composePricing(currency, rate, price)
  const minQuantity = tiers[0]?.min_quantity ?? 1
  await admin
    .from('supplier_products')
    .update({
      suggested_wholesale_price_mad: pricing.suggested_wholesale_price_mad,
      source_currency: pricing.source_currency,
      price_source: pricing.price_source,
      fx_rate_source_to_mad: pricing.fx_rate_source_to_mad,
      min_quantity: minQuantity,
    })
    .eq('id', productId)
  if (tiers.length > 0) {
    await insertMoqTiers(admin, productId, tiers.map((t) => ({ min_quantity: t.min_quantity, unit_price_usd: t.unit_price })))
  }
}

/** Fige les PALIERS obtenus par réponse (le prix unitaire était déjà présent). */
async function applyTiersToProduct(
  admin: Admin,
  productId: string,
  tiers: { min_quantity: number; unit_price: number }[],
): Promise<void> {
  if (tiers.length === 0) return
  await insertMoqTiers(admin, productId, tiers.map((t) => ({ min_quantity: t.min_quantity, unit_price_usd: t.unit_price })))
  await admin.from('supplier_products').update({ min_quantity: tiers[0].min_quantity }).eq('id', productId)
}

/** Fige l'UNITÉ DE VENTE confirmée/corrigée par le fournisseur (texte LIBRE, C1a).
 *  AFFICHAGE PUR : n'altère AUCUN prix / palier / commission (audit @finance). */
async function applyUnitToProduct(admin: Admin, productId: string, unit: string): Promise<void> {
  await admin.from('supplier_products').update({ unit }).eq('id', productId)
}

/** Compte les paliers réellement enregistrés (pour la re-modération à la finalisation). */
async function countMoqTiers(admin: Admin, productId: string): Promise<number> {
  const { count } = await admin
    .from('supplier_product_moq_tiers')
    .select('supplier_product_id', { count: 'exact', head: true })
    .eq('supplier_product_id', productId)
  return count ?? 0
}

/** C1a — passe à l'étape de CONFIRMATION de l'unité et envoie le message dédié. */
async function askUnitConfirmation(admin: Admin, pending: PendingRow, lc: string | null | undefined): Promise<void> {
  await switchPendingTo(admin, pending.supplier_product_id, 'unit', pending.proposed_unit)
  await telegramSendMessage(pending.telegram_chat_id, msgConfirmUnit(lc, { unit: pending.proposed_unit ?? 'piece' }))
}

/** Produit complété → re-modère, supprime l'attente, envoie l'accusé « reçu ✅ ». */
async function finalizeProduct(admin: Admin, pending: PendingRow, lc: string | null | undefined, moqTierCount: number): Promise<void> {
  await rerunModeration(admin, pending.supplier_product_id, moqTierCount)
  await deletePending(admin, pending.supplier_product_id)
  const p = await fetchProductForAck(admin, pending.supplier_product_id)
  if (p) await telegramSendMessage(pending.telegram_chat_id, buildProductAck(lc, p))
}

/** Réponse inexploitable → redemander UNE fois, sinon abandonner (finaliser tel quel). */
async function reaskOrGiveUp(admin: Admin, pending: PendingRow, lc: string | null | undefined): Promise<void> {
  if (shouldReask(pending.reask_count)) {
    await bumpReask(admin, pending)
    await telegramSendMessage(
      pending.telegram_chat_id,
      pending.awaiting === 'price' ? msgReaskPrice(lc) : msgReaskTiers(lc),
    )
    return
  }
  // Abandon : on arrête de solliciter, le produit reste en modération (admin tranche).
  await finalizeProduct(admin, pending, lc, 0)
}

/**
 * Réponse TEXTE d'un fournisseur : est-ce la réponse à une question en attente ?
 * Renvoie true si géré (attente trouvée + traitée), false sinon (→ guidage générique).
 * Scopé au fournisseur : on ne complète QUE ses propres produits.
 */
async function handleSupplierReply(admin: Admin, msg: TelegramMessage): Promise<boolean> {
  const telegramUserId = msg.from!.id
  const supplierId = await resolveSupplierId(admin, telegramUserId)
  if (!supplierId) return false

  const pending = await getMostRecentPending(admin, supplierId)
  if (!pending) return false

  const lc = msg.from!.language_code
  const text = (msg.text ?? '').trim()

  // L'IA lit la réponse (mêmes sanitizers que la photo). Échec IA → inexploitable.
  let reply: { price_source: number | null; moq_tiers: { min_quantity: number; unit_price: number }[] }
  try {
    reply = await extractProductReply(text)
  } catch {
    reply = { price_source: null, moq_tiers: [] }
  }

  if (pending.awaiting === 'price') {
    const outcome = interpretPriceReply({ price_source: reply.price_source, moq_tiers: reply.moq_tiers })
    if (outcome.kind === 'got_price') {
      // Prix (± paliers) obtenus dans la MÊME réponse. AUCUNE relance paliers (facultatifs).
      // C1a — au lieu de finaliser tout de suite, on CONFIRME l'unité de vente détectée ;
      // l'accusé « reçu ✅ » suivra la confirmation.
      await applyPriceToProduct(admin, pending.supplier_product_id, supplierId, outcome.price, outcome.tiers)
      await askUnitConfirmation(admin, pending, lc)
      return true
    }
    // Pas de prix exploitable. Confusion (« je comprends pas », « ? ») → ré-expliquer
    // simplement (borné). Sinon → redemander UNIQUEMENT le prix.
    if (isConfusedReply(text)) {
      if (shouldReask(pending.reask_count)) {
        await bumpReask(admin, pending)
        const p = await fetchProductForAck(admin, pending.supplier_product_id)
        await telegramSendMessage(pending.telegram_chat_id, msgReexplain(lc, { name: p?.productName ?? '' }))
      } else {
        await telegramSendMessage(pending.telegram_chat_id, msgReaskPrice(lc))
      }
      return true
    }
    await reaskOrGiveUp(admin, pending, lc)
    return true
  }

  if (pending.awaiting === 'unit') {
    // C1a — confirmation de l'unité de vente. « oui » → on garde l'unité détectée ;
    // sinon le fournisseur écrit la bonne unité (texte LIBRE) → on la fige. Puis le
    // produit est finalisé (accusé « reçu ✅ »). L'unité est AFFICHAGE PUR (aucun prix).
    const unitOutcome = interpretUnitReply(text)
    if (unitOutcome.kind === 'corrected') {
      await applyUnitToProduct(admin, pending.supplier_product_id, unitOutcome.unit)
    }
    if (unitOutcome.kind === 'corrected' || unitOutcome.kind === 'confirmed') {
      await finalizeProduct(admin, pending, lc, await countMoqTiers(admin, pending.supplier_product_id))
      return true
    }
    // Confusion (« je comprends pas ») ou réponse inexploitable → redemander l'unité
    // UNE fois (borné) ; épuisé → on finalise avec l'unité déjà détectée (admin tranche).
    if (shouldReask(pending.reask_count)) {
      await bumpReask(admin, pending)
      await telegramSendMessage(pending.telegram_chat_id, msgReaskUnit(lc))
    } else {
      await finalizeProduct(admin, pending, lc, await countMoqTiers(admin, pending.supplier_product_id))
    }
    return true
  }

  // awaiting === 'tiers' — paliers flexibles (0 à 3), « non », ou prix sans quantité.
  const outcome = interpretTiersReply(text, { price_source: reply.price_source, moq_tiers: reply.moq_tiers })
  if (outcome.kind === 'unusable') {
    await reaskOrGiveUp(admin, pending, lc)
    return true
  }
  if (outcome.kind === 'bare_price') {
    // Prix donné SANS quantité (« 140 ») → demander la quantité (prix échoé). Borné
    // comme un reask pour éviter toute boucle ; épuisé → on finalise (prix déjà là).
    if (shouldReask(pending.reask_count)) {
      await bumpReask(admin, pending)
      await telegramSendMessage(pending.telegram_chat_id, msgAskTierQty(lc, { price: outcome.price }))
    } else {
      await finalizeProduct(admin, pending, lc, 0)
    }
    return true
  }
  if (outcome.kind === 'got_tiers') {
    await applyTiersToProduct(admin, pending.supplier_product_id, outcome.tiers)
    await finalizeProduct(admin, pending, lc, outcome.tiers.length)
  } else {
    // 'declined' → pas de paliers, produit finalisé tel quel.
    await finalizeProduct(admin, pending, lc, 0)
  }
  return true
}

// ── Point d'entrée appelé par le webhook ─────────────────────────────────────

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message ?? update.edited_message
  if (!msg || !msg.from) return
  // Ignorer les autres bots.
  if (msg.from.is_bot) return

  const admin = createAdminClient()
  const text = msg.text?.trim()

  if (text && (text.startsWith('/link') || text.startsWith('/start'))) {
    const parts = text.split(/\s+/)
    const code = parts[1]
    if (code) {
      await handleLinkCommand(admin, msg, code)
    } else {
      // LOT 5 — accueil bilingue (FR/darija) : guide l'envoi produit + recommande
      // le format des paliers. Numéro WhatsApp depuis la config publique (jamais en dur).
      const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'
      await telegramSendMessage(
        msg.chat.id,
        buildSupplierWelcome(msg.from.language_code, whatsappPhone),
      )
    }
    return
  }

  // Une PHOTO est TOUJOURS un nouveau produit — jamais la réponse à une question
  // (cas limite : autre photo au lieu de répondre → NOUVEAU produit).
  if (msg.photo && msg.photo.length > 0) {
    await ingestProductMessage(admin, msg)
    return
  }

  // BRIQUE 3 — un texte peut être la RÉPONSE à une question en attente (prix/paliers).
  // Si oui, on complète le produit ; sinon on retombe sur le guidage générique.
  if (text) {
    const handled = await handleSupplierReply(admin, msg)
    if (handled) return
  }

  // Message texte simple sans commande ni attente : guider.
  await telegramSendMessage(msg.chat.id, msgGuide(msg.from.language_code))
}
