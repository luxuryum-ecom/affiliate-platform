// ─── BRIQUE 3 — Accès DB à l'état conversationnel (telegram_pending_products) ──
// CRUD typé, service_role uniquement (worker bot). Scopé par supplier_id (jamais
// de complétion croisée). Ne contient AUCUNE règle métier — la décision est dans
// conversation.ts, l'orchestration dans ingest.ts.

import type { createAdminClient } from '@/lib/supabase/admin'
import type { Awaiting } from './conversation'

type Admin = ReturnType<typeof createAdminClient>

export type PendingRow = {
  supplier_product_id: string
  supplier_id: string
  telegram_chat_id: number
  telegram_lang: string | null
  awaiting: Awaiting
  asked_at: string
  reminded_at: string | null
  reask_count: number
}

const nowIso = () => new Date().toISOString()

/** Crée/écrase la ligne d'attente d'un produit (question posée maintenant). */
export async function upsertPending(
  admin: Admin,
  row: {
    supplier_product_id: string
    supplier_id: string
    telegram_chat_id: number
    telegram_lang: string | null
    awaiting: Awaiting
  },
): Promise<{ error: string | null }> {
  const { error } = await admin.from('telegram_pending_products').upsert(
    {
      ...row,
      asked_at: nowIso(),
      reminded_at: null,
      reask_count: 0,
    },
    { onConflict: 'supplier_product_id' },
  )
  return { error: error ? error.message : null }
}

/** Produit en attente LE PLUS RÉCENT pour ce fournisseur (rattachement réponse). */
export async function getMostRecentPending(
  admin: Admin,
  supplierId: string,
): Promise<PendingRow | null> {
  const { data } = await admin
    .from('telegram_pending_products')
    .select('supplier_product_id, supplier_id, telegram_chat_id, telegram_lang, awaiting, asked_at, reminded_at, reask_count')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PendingRow | null) ?? null
}

/** Supprime la ligne d'attente (produit finalisé / abandon). */
export async function deletePending(admin: Admin, supplierProductId: string): Promise<void> {
  await admin.from('telegram_pending_products').delete().eq('supplier_product_id', supplierProductId)
}

/** Passe l'attente à un AUTRE champ (ex. prix obtenu → on attend les paliers). */
export async function switchPendingTo(
  admin: Admin,
  supplierProductId: string,
  awaiting: Awaiting,
): Promise<void> {
  await admin
    .from('telegram_pending_products')
    .update({ awaiting, asked_at: nowIso(), reminded_at: null, reask_count: 0 })
    .eq('supplier_product_id', supplierProductId)
}

/** Incrémente le compteur de redemande + réarme le timer (réponse inexploitable). */
export async function bumpReask(admin: Admin, row: PendingRow): Promise<void> {
  await admin
    .from('telegram_pending_products')
    .update({ reask_count: row.reask_count + 1, asked_at: nowIso(), reminded_at: null })
    .eq('supplier_product_id', row.supplier_product_id)
}

/** Attentes DUES pour la relance unique (jamais relancées, question ancienne). */
export async function getDueReminders(
  admin: Admin,
  beforeIso: string,
): Promise<PendingRow[]> {
  const { data } = await admin
    .from('telegram_pending_products')
    .select('supplier_product_id, supplier_id, telegram_chat_id, telegram_lang, awaiting, asked_at, reminded_at, reask_count')
    .is('reminded_at', null)
    .lt('asked_at', beforeIso)
  return (data as PendingRow[] | null) ?? []
}

/** Horodate la relance UNIQUE (anti-spam : ne se déclenchera plus). */
export async function markReminded(admin: Admin, supplierProductId: string): Promise<void> {
  await admin
    .from('telegram_pending_products')
    .update({ reminded_at: nowIso() })
    .eq('supplier_product_id', supplierProductId)
}
