'use server'

// ─── Scan livraison livreur (module Livreurs, Lot B) ─────────────────────────
//
// Portail livreur CLOISONNÉ : le livreur s'authentifie par son `access_code`
// (mig 127, résolu par hash + TTL + rate-limit via `resolve_courier_by_access_code`).
// Il n'a JAMAIS de compte profiles ni de session Supabase — l'accès est borné au
// seul livreur du code, et ces actions ne renvoient QUE le strict nécessaire
// (zéro marge, zéro autre livreur, zéro PII client au-delà de la ville).
//
// Le scan NE DUPLIQUE PAS le grand livre : il change le statut de la commande
// (`delivered` / `returned`) via `record_delivery_scan` (mig 127), et les triggers
// EXISTANTS `handle_order_delivered` / `handle_order_status_reversal` (mig 122)
// postent le ledger + la commission. Écritures via service_role APRÈS résolution
// du livreur — les RPC sont REVOKE public/anon/authenticated (mig 127).

import { headers } from 'next/headers'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Résolution de session livreur (par access_code) ─────────────────────────

export interface CourierSession {
  courierId: string
  name: string
}

export interface ResolveCourierSessionResult {
  error: string | null
  session: CourierSession | null
}

/** IP de la requête (best-effort) pour le rate-limit de `resolve_courier_by_access_code`. */
async function requestIp(): Promise<string | null> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0]?.trim() ?? null
    return h.get('x-real-ip')
  } catch {
    return null
  }
}

/**
 * Résout le livreur à partir de son code d'accès (hash + TTL + rate-limit, mig 127).
 * Erreur GÉNÉRIQUE en cas d'échec (jamais d'info sur pourquoi : code faux / expiré /
 * bloqué / rate-limité) pour ne rien divulguer.
 */
export async function resolveCourierSession(code: string): Promise<ResolveCourierSessionResult> {
  const clean = (code ?? '').trim()
  if (clean.length < 8) return { error: 'Lien invalide.', session: null }

  const admin = createAdminClient()
  const ip = await requestIp()

  const { data: courierId, error: rpcErr } = await admin.rpc('resolve_courier_by_access_code', {
    p_code: clean,
    p_ip: ip,
  })
  if (rpcErr || !courierId) return { error: 'Lien invalide ou expiré.', session: null }

  const { data: courier, error: courierErr } = await admin
    .from('couriers')
    .select('id, name')
    .eq('id', courierId as string)
    .maybeSingle()
  if (courierErr || !courier) return { error: 'Lien invalide ou expiré.', session: null }

  return { error: null, session: { courierId: courier.id, name: courier.name } }
}

// ─── File de scan (commandes à livrer) ───────────────────────────────────────

export interface ScanQueueOrder {
  orderId: string
  reference: string
  customerCity: string | null
  totalAmount: number
  status: string
  assignedToMe: boolean
}

export interface GetCourierScanQueueResult {
  error: string | null
  courierName: string | null
  orders: ScanQueueOrder[]
}

/**
 * File des commandes que ce livreur peut scanner : celles qui lui sont assignées
 * OU non encore assignées (disponibles). Colonnes NON sensibles uniquement
 * (référence courte, ville, montant COD à encaisser) — jamais coût/marge, jamais
 * nom/téléphone/adresse client.
 */
export async function getCourierScanQueue(code: string): Promise<GetCourierScanQueueResult> {
  const { error, session } = await resolveCourierSession(code)
  if (error || !session) return { error: error ?? 'Lien invalide.', courierName: null, orders: [] }

  const admin = createAdminClient()
  const { data, error: queueErr } = await admin
    .from('v_courier_scan_queue')
    .select('order_id, reference, customer_city, total_amount, status, courier_id')
    .or(`courier_id.eq.${session.courierId},courier_id.is.null`)
    .order('status', { ascending: true })

  if (queueErr) return { error: queueErr.message, courierName: session.name, orders: [] }

  const orders: ScanQueueOrder[] = (data ?? []).map((o) => ({
    orderId: o.order_id as string,
    reference: (o.reference as string).slice(0, 8).toUpperCase(),
    customerCity: o.customer_city as string | null,
    totalAmount: Number(o.total_amount ?? 0),
    status: o.status as string,
    assignedToMe: o.courier_id === session.courierId,
  }))

  return { error: null, courierName: session.name, orders }
}

// ─── Scan d'un état de livraison ─────────────────────────────────────────────

const RecordScanSchema = z.object({
  code: z.string().trim().min(8, { message: 'Lien invalide.' }),
  orderId: z.string().uuid({ message: 'Commande invalide.' }),
  outcome: z.enum(['delivered_collected', 'delivery_refused']),
  trackingRef: z.string().trim().max(120).optional(),
})

export type RecordDeliveryScanInput = z.infer<typeof RecordScanSchema>

export interface RecordDeliveryScanResult {
  error: string | null
  orderId: string | null
  newStatus: string | null
  outcome: string | null
}

/**
 * Enregistre un scan de livraison : livré+encaissé (→ statut delivered, le trigger
 * 122 poste l'encaissement COD + commission) OU refusé-retour (→ statut returned,
 * contre-passation). Idempotent (mig 127 + triggers). Cloisonné : ne renvoie que
 * l'ordre + le nouveau statut, rien d'autre.
 */
export async function recordDeliveryScan(
  input: RecordDeliveryScanInput,
): Promise<RecordDeliveryScanResult> {
  const parsed = RecordScanSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Données invalides.',
      orderId: null,
      newStatus: null,
      outcome: null,
    }
  }
  const { code, orderId, outcome, trackingRef } = parsed.data

  // Authentifie le livreur par code (rate-limité) AVANT toute écriture.
  const { error: sessErr, session } = await resolveCourierSession(code)
  if (sessErr || !session) {
    return { error: sessErr ?? 'Lien invalide.', orderId: null, newStatus: null, outcome: null }
  }

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('record_delivery_scan', {
    p_order_id: orderId,
    p_courier_id: session.courierId,
    p_outcome: outcome,
    p_tracking_ref: trackingRef ?? null,
  })
  if (rpcErr) return { error: rpcErr.message, orderId: null, newStatus: null, outcome: null }

  const res = (data ?? {}) as { order_id?: string; new_status?: string; outcome?: string }
  return {
    error: null,
    orderId: res.order_id ?? orderId,
    newStatus: res.new_status ?? null,
    outcome: res.outcome ?? outcome,
  }
}
