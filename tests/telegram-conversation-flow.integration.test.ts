/**
 * BRIQUE 3 — Flux conversationnel bout en bout (intégration LOCAL).
 *
 * Pilote handleTelegramUpdate contre le Supabase LOCAL réel (writes
 * telegram_pending_products + supplier_products), en mockant :
 *  - @/lib/telegram/client   → telegramSendMessage capturé, telegramDownloadPhoto stub
 *  - @/lib/telegram/extract  → extractProductFromTelegram / extractProductReply contrôlés
 *  - @/lib/supabase/admin    → createAdminClient renvoie un client LOCAL (service_role)
 *
 * RÈGLES ABSOLUES : LOCAL uniquement (getLocalSupabaseEnv, jamais .env.local/prod),
 * aucun secret en dur, teardown best-effort.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// ── Mock admin → client LOCAL réel (service_role) ────────────────────────────
vi.mock('@/lib/supabase/admin', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { getLocalSupabaseEnv } = await import('../e2e/assert-local-supabase')
  const { url, serviceKey } = getLocalSupabaseEnv()
  const client = createClient(url, serviceKey, { auth: { persistSession: false } })
  return { createAdminClient: () => client }
})

// ── Mock client Telegram (aucun réseau) ──────────────────────────────────────
vi.mock('@/lib/telegram/client', () => ({
  telegramSendMessage: vi.fn(async () => {}),
  telegramDownloadPhoto: vi.fn(async () => ({
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'),
    mediaType: 'image/jpeg' as const,
    ext: 'jpg',
  })),
}))

// ── Mock extraction IA (déterministe, pas de Haiku) ──────────────────────────
vi.mock('@/lib/telegram/extract', () => ({
  extractProductFromTelegram: vi.fn(),
  extractProductReply: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { telegramSendMessage } from '@/lib/telegram/client'
import { extractProductFromTelegram, extractProductReply } from '@/lib/telegram/extract'
import { handleTelegramUpdate } from '@/lib/telegram/ingest'
import { sendDueReminders } from '@/lib/telegram/reminders'
import { msgAskPriceAndTiers, msgReexplain, msgReaskPrice, msgConfirmUnit } from '@/lib/telegram/messages'
import type { CleanExtraction } from '@/lib/telegram/schema'
import type { TelegramUpdate } from '@/lib/telegram/schema'

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const admin = createAdminClient()

const TAG = `conv-${Date.now()}`
let supplierA = ''
let supplierB = ''
const chatA = 900000001
const chatB = 900000002
const userA = 700000001
const userB = 700000002
const createdUsers: string[] = []

function fakeClean(p: Partial<CleanExtraction>): CleanExtraction {
  return {
    product_name: 'Ceinture cuir',
    category: 'Autres',
    subcategory: '',
    description: 'desc',
    price_source: null,
    stock_quantity: null,
    lead_time_days: null,
    unit: 'piece',
    pack_size: null,
    pack_unit: null,
    suggested_category: null,
    moq_tiers: [],
    photo_issue: 'ok',
    ...p,
  } as CleanExtraction
}

async function seedSupplier(email: string, tgUser: number): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: 'Conv-Local-Test-7731',
    email_confirm: true,
    user_metadata: { full_name: 'Conv Supplier', role: 'supplier', country_code: 'MA' },
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  const uid = created.user!.id
  createdUsers.push(uid)
  await admin.from('profiles').update({ role: 'supplier', status: 'approved', country_code: 'MA' }).eq('id', uid)
  await admin.from('telegram_supplier_links').delete().eq('supplier_id', uid)
  await admin.from('telegram_supplier_links').insert({ supplier_id: uid, telegram_user_id: tgUser, linked_at: new Date().toISOString() })
  return uid
}

function photoUpdate(chatId: number, userId: number, lang = 'fr', messageId = Date.now() % 1_000_000): TelegramUpdate {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      chat: { id: chatId },
      from: { id: userId, is_bot: false, language_code: lang },
      photo: [{ file_id: `f-${messageId}`, file_size: 1000 }],
      caption: 'produit',
    },
  } as TelegramUpdate
}

function textUpdate(chatId: number, userId: number, text: string, lang = 'fr', messageId = Date.now() % 1_000_000): TelegramUpdate {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      chat: { id: chatId },
      from: { id: userId, is_bot: false, language_code: lang },
      text,
    },
  } as TelegramUpdate
}

const lastSent = (): { chatId: number; text: string } => {
  const calls = mocked(telegramSendMessage).mock.calls
  const [chatId, text] = calls[calls.length - 1] as [number, string]
  return { chatId, text }
}

async function pendingFor(supplierId: string) {
  const { data } = await admin
    .from('telegram_pending_products')
    .select('supplier_product_id, awaiting, reask_count, asked_at, reminded_at, telegram_chat_id, telegram_lang')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as null | { supplier_product_id: string; awaiting: string; reask_count: number; asked_at: string; reminded_at: string | null; telegram_chat_id: number; telegram_lang: string | null }
}

async function productPrice(id: string) {
  const { data } = await admin.from('supplier_products').select('suggested_wholesale_price_mad, price_source, source_currency').eq('id', id).maybeSingle()
  return data as null | { suggested_wholesale_price_mad: number | null; price_source: number | null; source_currency: string | null }
}

async function purgeInbound() {
  // Le staging idempotent réutilise (chat_id, message_id) → purge pour re-jouer.
  await admin.from('telegram_inbound').delete().in('telegram_chat_id', [chatA, chatB])
}

beforeAll(async () => {
  supplierA = await seedSupplier(`${TAG}-a@local.test`, userA)
  supplierB = await seedSupplier(`${TAG}-b@local.test`, userB)
  await purgeInbound()
})

afterAll(async () => {
  for (const uid of [supplierA, supplierB]) {
    await admin.from('supplier_products').delete().eq('supplier_id', uid)
    await admin.from('telegram_supplier_links').delete().eq('supplier_id', uid)
  }
  for (const uid of createdUsers) {
    try { await admin.auth.admin.deleteUser(uid) } catch { /* best-effort (cf. dette suppression compte) */ }
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  // Défaut : réponse « rien d'exploitable » (les cas prix précis surchargent via Once).
  mocked(extractProductReply).mockResolvedValue({ price_source: null, moq_tiers: [] })
})

// Isolation stricte : chaque test repart d'un fournisseur sans produit, sans
// attente et sans staging (le staging idempotent bloquerait un message_id réutilisé).
afterEach(async () => {
  for (const uid of [supplierA, supplierB]) {
    if (uid) await admin.from('supplier_products').delete().eq('supplier_id', uid)
  }
  await purgeInbound()
})

describe('BRIQUE 3 — flux conversationnel (LOCAL)', () => {
  it('1) photo SANS prix → prix+paliers d\'un coup → CONFIRMATION unité → « oui » → complété', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Ceinture cuir', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 111001))

    const pend = await pendingFor(supplierA)
    expect(pend?.awaiting).toBe('price')
    // UN message explicatif complet (prix + paliers + exemple tout-d'un-coup)
    expect(lastSent().text).toBe(msgAskPriceAndTiers('fr', { name: 'Ceinture cuir' }))
    const productId = pend!.supplier_product_id

    // Réponse TOUT D'UN COUP : prix + 2 paliers → prix appliqué, PUIS confirmation d'unité (C1a)
    mocked(extractProductReply).mockResolvedValueOnce({
      price_source: 160,
      moq_tiers: [{ min_quantity: 50, unit_price: 140 }, { min_quantity: 200, unit_price: 120 }],
    })
    await handleTelegramUpdate(textUpdate(chatA, userA, '160 dh, 50=140, 200=120', 'fr', 111002))

    // C1a — le prix est DÉJÀ appliqué (+ paliers), mais on confirme d'abord l'unité.
    expect((await pendingFor(supplierA))?.awaiting).toBe('unit')
    expect(lastSent().text).toBe(msgConfirmUnit('fr', { unit: 'piece' }))
    expect((await productPrice(productId))?.suggested_wholesale_price_mad).toBe(160)

    // « oui » → produit finalisé.
    mocked(extractProductReply).mockResolvedValueOnce({ price_source: null, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, 'oui', 'fr', 111003))

    const price = await productPrice(productId)
    expect(price?.suggested_wholesale_price_mad).toBe(160) // MAD, rate=1
    expect(price?.source_currency).toBe('MAD')
    expect(await pendingFor(supplierA)).toBeNull() // finalisé après confirmation unité
    const { count } = await admin.from('supplier_product_moq_tiers').select('id', { count: 'exact', head: true }).eq('supplier_product_id', productId)
    expect(count).toBe(2)
    await admin.from('supplier_products').delete().eq('id', productId)
  })

  it('2) photo COMPLÈTE → CONFIRMATION unité → « oui » → accusé reçu ✅', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(
      fakeClean({ product_name: 'Sac complet', price_source: 250, moq_tiers: [{ min_quantity: 50, unit_price: 220 }] }),
    )
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 222001))
    // C1a — prix déjà présent → on confirme l'unité AVANT l'accusé.
    expect((await pendingFor(supplierA))?.awaiting).toBe('unit')
    expect(lastSent().text).toBe(msgConfirmUnit('fr', { unit: 'piece' }))

    mocked(extractProductReply).mockResolvedValueOnce({ price_source: null, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, 'oui', 'fr', 222002))
    expect(await pendingFor(supplierA)).toBeNull()
    expect(lastSent().text).toContain('✅') // accusé « Produit reçu ✅ »
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })

  it('3) réponse « 160 » SEUL → confirmation unité CORRIGÉE (« botte » libre) → complété, unité verbatim', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Tapis', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 333001))
    const productId = (await pendingFor(supplierA))!.supplier_product_id

    // Juste le prix → prix appliqué (pas de relance paliers), PUIS confirmation d'unité.
    mocked(extractProductReply).mockResolvedValueOnce({ price_source: 160, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, '160', 'fr', 333002))
    expect((await pendingFor(supplierA))?.awaiting).toBe('unit')

    // Le fournisseur CORRIGE l'unité en texte LIBRE « botte » → figée verbatim + finalisé.
    mocked(extractProductReply).mockResolvedValueOnce({ price_source: null, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, 'botte', 'fr', 333003))
    expect(await pendingFor(supplierA)).toBeNull() // complété
    expect(lastSent().text).toContain('✅') // accusé « Produit reçu ✅ »
    expect((await productPrice(productId))?.suggested_wholesale_price_mad).toBe(160)
    // Unité LIBRE stockée VERBATIM (jamais écrasée vers pièce).
    const { data: prod } = await admin.from('supplier_products').select('unit').eq('id', productId).maybeSingle()
    expect((prod as { unit: string }).unit).toBe('botte')
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })

  it('3-bis) réponse CONFUSION « مافهمتش » → ré-explication, reste en attente', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Djellaba', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'ar', 334001))
    // Confusion → extract renvoie rien d'exploitable (défaut mock), le bot ré-explique
    await handleTelegramUpdate(textUpdate(chatA, userA, 'مافهمتش', 'ar', 334002))
    expect(lastSent().text).toBe(msgReexplain('ar', { name: 'Djellaba' }))
    expect((await pendingFor(supplierA))?.awaiting).toBe('price') // toujours en attente du prix
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })

  it('4) ignoré → 1 relance unique (anti-spam)', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Lampe', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 444001))
    const pend = await pendingFor(supplierA)
    expect(pend?.awaiting).toBe('price')

    // Force la question dans le passé (> 1h)
    await admin.from('telegram_pending_products')
      .update({ asked_at: new Date(Date.now() - 2 * 3600_000).toISOString() })
      .eq('supplier_product_id', pend!.supplier_product_id)

    const r1 = await sendDueReminders(admin, Date.now())
    expect(r1.sent).toBeGreaterThanOrEqual(1)
    expect((await pendingFor(supplierA))?.reminded_at).not.toBeNull()

    const r2 = await sendDueReminders(admin, Date.now())
    expect(r2.sent).toBe(0) // one-shot
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })

  it('5) 2e photo au lieu de répondre → NOUVEAU produit ; réponse rattachée au plus récent', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Produit 1', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 555001))
    const p1 = (await pendingFor(supplierA))!.supplier_product_id

    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Produit 2', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 555002))
    const p2 = (await pendingFor(supplierA))!.supplier_product_id
    expect(p2).not.toBe(p1) // 2 produits distincts

    const { count } = await admin.from('supplier_products').select('id', { count: 'exact', head: true }).eq('supplier_id', supplierA)
    expect(count).toBe(2)

    // La réponse se rattache au PLUS RÉCENT (p2)
    mocked(extractProductReply).mockResolvedValueOnce({ price_source: 99, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, '99 dh', 'fr', 555003))
    expect((await productPrice(p2))?.price_source).toBe(99)
    expect((await productPrice(p1))?.price_source).toBeNull() // p1 intact
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })

  it('6) réponse bidon → redemande UNE fois → 2e bidon → abandon', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Vase', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 666001))

    mocked(extractProductReply).mockResolvedValueOnce({ price_source: null, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, 'euh je sais pas', 'fr', 666002))
    expect((await pendingFor(supplierA))?.reask_count).toBe(1)
    expect(lastSent().text).toBe(msgReaskPrice('fr'))

    mocked(extractProductReply).mockResolvedValueOnce({ price_source: null, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, 'toujours pas', 'fr', 666003))
    expect(await pendingFor(supplierA)).toBeNull() // abandon
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })

  it('7) SÉCURITÉ — pas de complétion croisée (B ne complète pas le produit de A)', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Produit A', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 777001))
    const pA = (await pendingFor(supplierA))!.supplier_product_id

    // B (lié, aucune attente) envoie « 250 dh » → NE complète PAS le produit de A
    mocked(extractProductReply).mockResolvedValue({ price_source: 250, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatB, userB, '250 dh', 'fr', 777002))
    expect((await productPrice(pA))?.price_source).toBeNull() // A intact
    expect(await pendingFor(supplierB)).toBeNull() // B n'a rien créé
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })

  it('8) 4 langues — le message explicatif complet est rendu dans la langue du fournisseur', async () => {
    for (const [lang, mid] of [['en', 888001], ['ar', 888002], ['ar-MA', 888003]] as const) {
      mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'X', price_source: null }))
      await handleTelegramUpdate(photoUpdate(chatA, userA, lang, mid))
      expect(lastSent().text).toBe(msgAskPriceAndTiers(lang, { name: 'X' }))
      await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
    }
  })

  it('9) réponse SANS prix (« je sais pas ») → redemande juste le prix (pas de ré-explication)', async () => {
    mocked(extractProductFromTelegram).mockResolvedValueOnce(fakeClean({ product_name: 'Vase', price_source: null }))
    await handleTelegramUpdate(photoUpdate(chatA, userA, 'fr', 993001))
    mocked(extractProductReply).mockResolvedValueOnce({ price_source: null, moq_tiers: [] })
    await handleTelegramUpdate(textUpdate(chatA, userA, 'je sais pas', 'fr', 993002))
    expect(lastSent().text).toBe(msgReaskPrice('fr'))
    expect((await pendingFor(supplierA))?.awaiting).toBe('price')
    await admin.from('supplier_products').delete().eq('supplier_id', supplierA)
  })
})
