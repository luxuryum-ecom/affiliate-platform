// ─── Orchestration ingestion Telegram → supplier_products ────────────────────
// Identité résolue, idempotence via staging, upload image, UNE passe IA, insert
// en 'pending_review', puis modération RÉUTILISÉE (moderateSupplierProduct).
// Écrit exclusivement via service_role (côté serveur). Jamais depuis le client.

import { createAdminClient } from '@/lib/supabase/admin'
import { moderateSupplierProduct } from '@/lib/supplier-product-moderation'
import { extractProductFromTelegram } from './extract'
import { telegramDownloadPhoto, telegramSendMessage } from './client'
import { resolveSupplierCurrency, composePricing } from '@/lib/supplier-pricing'
import { getRateToMad } from '@/lib/fx'
import { checkProductLimit } from '@/lib/product-limit'
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
  const code = codeRaw.trim().toUpperCase()

  if (!isValidLinkCodeFormat(code)) {
    await telegramSendMessage(chatId, 'Code invalide. Format attendu : 8 caractères (ex. /link A7K2P9QX).')
    return
  }

  // Déjà lié ?
  const existingId = await resolveSupplierId(admin, telegramUserId)
  if (existingId) {
    await telegramSendMessage(chatId, 'Votre compte Telegram est déjà lié à votre espace fournisseur. ✅')
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
    await telegramSendMessage(chatId, 'Code introuvable. Générez un nouveau code depuis votre espace fournisseur.')
    return
  }
  if (link.link_code_expires_at && new Date(link.link_code_expires_at).getTime() < Date.now()) {
    await telegramSendMessage(chatId, 'Ce code a expiré. Générez-en un nouveau depuis votre espace fournisseur.')
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
    await telegramSendMessage(chatId, 'Liaison impossible (ce compte Telegram est peut-être déjà utilisé). Contactez le support.')
    return
  }

  await telegramSendMessage(
    chatId,
    'Compte lié ✅ Envoyez désormais une photo de produit avec une courte description (nom + prix en DH). Chaque produit sera vérifié par un administrateur avant publication.',
  )
}

// ── Ingestion d'un message produit (photo + légende) ─────────────────────────

async function ingestProductMessage(admin: Admin, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id
  const telegramUserId = msg.from!.id
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
    await telegramSendMessage(
      chatId,
      "Votre compte Telegram n'est pas encore lié. Ouvrez votre espace fournisseur, générez un code, puis envoyez : /link VOTRE_CODE.",
    )
    return
  }

  // Anti-abus / coût IA : plafond par compte Telegram et par heure.
  if ((await countRecentInbound(admin, telegramUserId)) > MAX_PRODUCTS_PER_HOUR) {
    await markInbound(admin, messageKey, { status: 'rejected', error: 'rate_limit' })
    await telegramSendMessage(chatId, 'Trop de produits envoyés en peu de temps. Réessayez dans une heure.')
    return
  }

  // Devise de saisie = devise du PAYS du fournisseur. Pas de pays → soumission
  // BLOQUÉE (avant l'IA, pour ne pas dépenser de tokens). Jamais de MAD supposé.
  const db = admin as unknown as Parameters<typeof resolveSupplierCurrency>[0]
  const currency = await resolveSupplierCurrency(db, supplierId)
  if (!currency) {
    await markInbound(admin, messageKey, { status: 'rejected', error: 'no_country' })
    await telegramSendMessage(
      chatId,
      "Configurez d'abord votre PAYS dans votre profil fournisseur (il détermine votre devise) avant d'envoyer un produit.",
    )
    return
  }

  // Limite de produits (abonnement) — barrière serveur (Telegram), avant l'IA.
  const limit = await checkProductLimit(db, supplierId)
  if (limit.isAtLimit) {
    await markInbound(admin, messageKey, { status: 'rejected', error: 'limit_reached' })
    await telegramSendMessage(
      chatId,
      `Limite de produits atteinte (${limit.currentCount}/${limit.maxAllowed} — plan ${limit.planName}). Passez à un plan supérieur pour en ajouter.`,
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

    const productName =
      clean.product_name ||
      msg.caption?.trim().slice(0, 80) ||
      'Produit Telegram (à compléter)'

    // Conversion devise source → MAD via le taux admin figé (snapshot).
    // Taux absent → mad NULL + flag (jamais 1, jamais deviné).
    const rate = await getRateToMad(db, currency)
    const pricing = composePricing(currency, rate, clean.price_source)

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
        min_quantity: 1,
        origin_country: 'Maroc',
        availability_type: 'local_stock',
        target_buyer_type: 'wholesaler',
        suggested_wholesale_price_mad: pricing.suggested_wholesale_price_mad,
        source_currency: pricing.source_currency,
        price_source: pricing.price_source,
        fx_rate_source_to_mad: pricing.fx_rate_source_to_mad,
        stock_quantity: clean.stock_quantity,
        lead_time_days: clean.lead_time_days,
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

    // Modération RÉUTILISÉE (même moteur que le formulaire web et l'import CSV).
    const moderation = moderateSupplierProduct({
      product_name: productName,
      description: clean.description,
      photos: [publicUrl],
      category: clean.category,
      min_quantity: 1,
      stock_quantity: clean.stock_quantity,
      lead_time_days: clean.lead_time_days,
      suggested_wholesale_price_mad: pricing.suggested_wholesale_price_mad,
      supplier_unit_price_usd: null,
      moq_tier_count: 0,
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

    await markInbound(admin, messageKey, {
      status: 'inserted',
      supplier_product_id: productId,
      ai_extraction: clean,
    })

    const priceLine =
      pricing.suggested_wholesale_price_mad != null
        ? `Prix : ${pricing.price_source} ${pricing.source_currency} ≈ ${pricing.suggested_wholesale_price_mad} DH`
        : pricing.reason === 'no_rate'
          ? `Prix : ${pricing.price_source ?? '?'} ${pricing.source_currency} (taux non encore configuré — l'admin le fixera)`
          : 'Prix : non détecté (à compléter)'
    await telegramSendMessage(
      chatId,
      `Produit reçu ✅\n• ${productName}\n• Catégorie : ${clean.category}${clean.subcategory ? ' / ' + clean.subcategory : ''}\n• ${priceLine}\nEn attente de validation par un administrateur avant publication.`,
    )
  } catch (e) {
    await markInbound(admin, messageKey, {
      status: 'failed',
      error: String(e instanceof Error ? e.message : e),
    })
    await telegramSendMessage(
      chatId,
      "Désolé, l'analyse de ce produit a échoué. Réessayez avec une photo nette et une courte description.",
    )
  }
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
      await telegramSendMessage(
        msg.chat.id,
        'Bienvenue 👋 Pour lier votre espace fournisseur : générez un code depuis le site, puis envoyez /link VOTRE_CODE. Ensuite, envoyez une photo de produit avec une courte description (nom + prix en DH).',
      )
    }
    return
  }

  if (msg.photo && msg.photo.length > 0) {
    await ingestProductMessage(admin, msg)
    return
  }

  // Message texte simple sans commande : guider.
  await telegramSendMessage(
    msg.chat.id,
    'Envoyez une photo du produit accompagnée d\'une courte description (nom + prix en DH). Si ce n\'est pas encore fait, liez votre compte avec /link VOTRE_CODE.',
  )
}
