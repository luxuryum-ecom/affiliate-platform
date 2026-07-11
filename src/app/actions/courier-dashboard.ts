'use server'

// ─── Dashboard livreur (module Livreurs, Lot C) ──────────────────────────────
//
// Portail livreur CLOISONNÉ : même auth que /courier/scan (access_code hashé,
// mig 127) via resolveCourierSession. Le livreur voit UNIQUEMENT SON périmètre :
//   • ses colis du jour / en cours (avec contact client de SES livraisons) ;
//   • son total encaissé à déposer ;
//   • son solde EXACT (cash dû + créance produit) — lu DIRECTEMENT du grand livre
//     (`v_courier_balances`, mig 126) : aucun calcul parallèle (@finance) ;
//   • ses retours à rendre.
//
// CLOISONNEMENT ABSOLU (@security) : zéro marge, zéro prix d'achat, zéro autre
// livreur, zéro total plateforme, zéro donnée client hors de SES livraisons.
// Toutes les lectures sont scopées `courier_id = session.courierId`, via
// service_role APRÈS résolution du code (les données ne transitent jamais par un
// client non authentifié). Réutilise l'existant — aucune nouvelle table/vue.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCourierSession } from './courier-scan'

// Statuts "à livrer" (en cours). Après livraison le colis sort de cette liste.
const IN_PROGRESS_STATUSES = ['confirmed', 'shipped', 'in_transit'] as const

export interface CourierDelivery {
  orderId: string
  reference: string
  /** Contact client — UNIQUEMENT pour les livraisons de CE livreur (nécessaire à la livraison). */
  customerName: string | null
  customerPhone: string | null
  customerAddress: string | null
  customerCity: string | null
  /** Montant COD à encaisser (numeric, jamais recalculé). */
  amountMad: number
  status: string
}

export interface CourierReturn {
  orderId: string
  reference: string
  customerCity: string | null
}

/** Confirmation au livreur : état de SES retours déclarés (chaîne de garde). */
export interface CourierReturnStatus {
  orderId: string
  reference: string
  /** declared = en attente de confirmation dépôt ; confirmed_* = validé ; lost = perte. */
  state: string
}

/** Confirmation au livreur : ses versements enregistrés. */
export interface CourierRemittanceInfo {
  id: string
  receivedAmountMad: number
  reconciledAt: string | null
}

export interface CourierDashboard {
  courierName: string
  /** Solde EXACT du grand livre (v_courier_balances) — aucun calcul parallèle. */
  cashOwedMad: number
  productDebtMad: number
  totalBalanceMad: number
  /** Cash encaissé à déposer = cash détenu non encore réconcilié (= cashOwedMad). */
  toDepositMad: number
  deliveries: CourierDelivery[]
  returns: CourierReturn[]
  /** Confirmations : états de SES retours déclarés + SES versements. */
  returnDeclarations: CourierReturnStatus[]
  recentRemittances: CourierRemittanceInfo[]
}

export interface GetCourierDashboardResult {
  error: string | null
  dashboard: CourierDashboard | null
}

const shortRef = (id: string) => id.slice(0, 8).toUpperCase()

/**
 * Tableau de bord d'un livreur, résolu par son access_code. Toutes les données
 * sont strictement scopées à ce livreur. Les soldes proviennent tels quels du
 * grand livre (v_courier_balances) — le livreur voit EXACTEMENT ce que voit la
 * trésorerie admin pour lui, sans divergence.
 */
export async function getCourierDashboard(code: string): Promise<GetCourierDashboardResult> {
  const { error, session } = await resolveCourierSession(code)
  if (error || !session) return { error: error ?? 'Lien invalide.', dashboard: null }

  const admin = createAdminClient()

  // 1. Solde EXACT depuis le grand livre (rempart staff → lecture service_role).
  const { data: bal, error: balErr } = await admin
    .from('v_courier_balances')
    .select('cash_owed_mad, product_debt_mad, total_balance_mad')
    .eq('id', session.courierId)
    .maybeSingle()
  // @security P2-1 : erreur GÉNÉRIQUE (ne pas remonter le message Postgres brut), le
  // détail est logué côté serveur — même posture que resolveCourierSession (Lot B).
  if (balErr) {
    console.error('[courier-dashboard] balance error:', balErr.message)
    return { error: 'Erreur de chargement.', dashboard: null }
  }

  const cashOwedMad = Number(bal?.cash_owed_mad ?? 0)
  const productDebtMad = Number(bal?.product_debt_mad ?? 0)
  const totalBalanceMad = Number(bal?.total_balance_mad ?? 0)

  // 2. Colis en cours (à livrer) de CE livreur — avec contact client (SES livraisons).
  const { data: delivRows, error: delivErr } = await admin
    .from('orders')
    .select('id, customer_name, customer_phone, customer_address, customer_city, total_amount, status')
    .eq('courier_id', session.courierId)
    .in('status', IN_PROGRESS_STATUSES as unknown as string[])
    .order('customer_city', { ascending: true })
  if (delivErr) { console.error('[courier-dashboard] deliveries error:', delivErr.message); return { error: 'Erreur de chargement.', dashboard: null } }

  const deliveries: CourierDelivery[] = (delivRows ?? []).map((o) => ({
    orderId: o.id as string,
    reference: shortRef(o.id as string),
    customerName: o.customer_name as string | null,
    customerPhone: o.customer_phone as string | null,
    customerAddress: o.customer_address as string | null,
    customerCity: o.customer_city as string | null,
    amountMad: Number(o.total_amount ?? 0),
    status: o.status as string,
  }))

  // 3. Retours à rendre : commandes de CE livreur passées en 'returned'.
  const { data: retRows, error: retErr } = await admin
    .from('orders')
    .select('id, customer_city')
    .eq('courier_id', session.courierId)
    .eq('status', 'returned')
    .order('customer_city', { ascending: true })
  if (retErr) { console.error('[courier-dashboard] returns error:', retErr.message); return { error: 'Erreur de chargement.', dashboard: null } }

  const returns: CourierReturn[] = (retRows ?? []).map((o) => ({
    orderId: o.id as string,
    reference: shortRef(o.id as string),
    customerCity: o.customer_city as string | null,
  }))

  // 4. Confirmations : états de SES retours déclarés (chaîne de garde, mig 128).
  const { data: declRows, error: declErr } = await admin
    .from('courier_returns')
    .select('order_id, state, declared_at')
    .eq('courier_id', session.courierId)
    .order('declared_at', { ascending: false })
    .limit(20)
  if (declErr) { console.error('[courier-dashboard] returns state error:', declErr.message); return { error: 'Erreur de chargement.', dashboard: null } }

  const returnDeclarations: CourierReturnStatus[] = (declRows ?? []).map((r) => ({
    orderId: r.order_id as string,
    reference: shortRef(r.order_id as string),
    state: r.state as string,
  }))

  // 5. Confirmations : SES versements enregistrés (scopés au livreur).
  const { data: remitRows, error: remitErr } = await admin
    .from('courier_remittances')
    .select('id, received_amount_mad, reconciled_at, created_at')
    .eq('courier_id', session.courierId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (remitErr) { console.error('[courier-dashboard] remittances error:', remitErr.message); return { error: 'Erreur de chargement.', dashboard: null } }

  const recentRemittances: CourierRemittanceInfo[] = (remitRows ?? []).map((r) => ({
    id: r.id as string,
    receivedAmountMad: Number(r.received_amount_mad ?? 0),
    reconciledAt: (r.reconciled_at ?? r.created_at) as string | null,
  }))

  return {
    error: null,
    dashboard: {
      courierName: session.name,
      cashOwedMad,
      productDebtMad,
      totalBalanceMad,
      toDepositMad: cashOwedMad,
      deliveries,
      returns,
      returnDeclarations,
      recentRemittances,
    },
  }
}
