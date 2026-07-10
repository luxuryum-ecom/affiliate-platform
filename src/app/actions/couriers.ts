'use server'

// ─── Registre livreurs (module Livreurs, Lot A) — couche données ────────────
//
// Consomme l'EXISTANT (mig 121-125, cf. CLAUDE.md) SANS y toucher : le solde
// livreur est une VUE CALCULÉE (`v_courier_balances`, mig 126) qui lit
// `orders`, `courier_remittance_orders` et `courier_product_debts` — aucun
// trigger/RPC du grand livre n'est modifié. Réservé admin (allowAgent: false)
// — le registre livreur touche l'argent (encours/plafond, créances produit) →
// circuit @finance + @security-reviewer + validation Abdou (CLAUDE.md règle 5).
//
// Écriture (`couriers`, `courier_product_debts`) : aucune policy INSERT/UPDATE/
// DELETE côté RLS (deny par défaut, mig 126) → passe exclusivement par le
// client service_role, TOUJOURS APRÈS la garde `requireAdmin`, jamais exposé
// au client (cf. telegram-link.ts::generateLinkCodeForSupplier pour le même
// patron : garde d'abord, service_role ensuite, borné à cette action).

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from './_guards'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/supabase-generated'

type CourierRow = Database['public']['Tables']['couriers']['Row']
type CourierBalanceRow = Database['public']['Views']['v_courier_balances']['Row']
type CourierProductDebtRow = Database['public']['Tables']['courier_product_debts']['Row']
type CourierRemittanceRow = Database['public']['Tables']['courier_remittances']['Row']
type OrderRow = Database['public']['Tables']['orders']['Row']

// ─── Génération access_code (lien /courier cloisonné, Lot B) ────────────────
// Calque exact du patron telegram-link.ts::generateCode() : base32 sans
// caractères ambigus (0/1/O/I), ~40 bits d'entropie (8 caractères × 5 bits).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateAccessCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

// ─── Types de sortie ──────────────────────────────────────────────────────────

export interface CourierWithBalance {
  id: string
  name: string
  courierType: string
  companyName: string | null
  status: string
  balanceCapMad: number
  cashOwedMad: number
  productDebtMad: number
  totalBalanceMad: number
  overCap: boolean
}

function mapBalanceRow(r: CourierBalanceRow): CourierWithBalance {
  return {
    id: r.id ?? '',
    name: r.name ?? '',
    courierType: r.courier_type ?? '',
    companyName: r.company_name,
    status: r.status ?? '',
    balanceCapMad: Number(r.balance_cap_mad ?? 0),
    cashOwedMad: Number(r.cash_owed_mad ?? 0),
    productDebtMad: Number(r.product_debt_mad ?? 0),
    totalBalanceMad: Number(r.total_balance_mad ?? 0),
    overCap: Boolean(r.over_cap),
  }
}

// ─── listCouriers ─────────────────────────────────────────────────────────────

export interface ListCouriersResult {
  error: string | null
  couriers: CourierWithBalance[]
}

/** Livreurs + soldes calculés (v_courier_balances), triés par encours décroissant. */
export async function listCouriers(): Promise<ListCouriersResult> {
  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', couriers: [] }

  const { data, error: viewErr } = await supabase
    .from('v_courier_balances')
    .select(
      'id, name, courier_type, company_name, status, balance_cap_mad, cash_owed_mad, product_debt_mad, total_balance_mad, over_cap',
    )
    .order('total_balance_mad', { ascending: false })

  if (viewErr) return { error: viewErr.message, couriers: [] }

  return { error: null, couriers: (data ?? []).map((r) => mapBalanceRow(r as CourierBalanceRow)) }
}

// ─── getCourierDetail ─────────────────────────────────────────────────────────

export interface CourierRemittanceHistoryEntry {
  id: string
  expectedAmountMad: number
  receivedAmountMad: number
  status: string
  reference: string | null
  reconciledAt: string | null
  createdAt: string
}

export interface CourierAssignedOrder {
  orderId: string
  reference: string
  totalAmount: number
  status: string
  deliveredAt: string | null
  customerCity: string | null
}

export interface CourierProductDebtEntry {
  id: string
  orderId: string | null
  variantId: string | null
  quantity: number
  amountMad: number
  reason: string | null
  createdAt: string
}

export interface CourierDetail {
  courier: {
    id: string
    name: string
    courierType: string
    companyName: string | null
    phone: string | null
    notes: string | null
    status: string
    balanceCapMad: number
    accessCode: string | null
    createdAt: string
  }
  balance: CourierWithBalance | null
  remittances: CourierRemittanceHistoryEntry[]
  orders: CourierAssignedOrder[]
  productDebts: CourierProductDebtEntry[]
}

export interface GetCourierDetailResult {
  error: string | null
  detail: CourierDetail | null
}

/**
 * Fiche livreur complète : identité + solde calculé + historique (bordereaux,
 * commandes livrées assignées, créances produit). Colonnes commande NON
 * sensibles uniquement (id, total_amount, status, delivered_at, customer_city)
 * — JAMAIS coût/marge (cf. CLAUDE.md, fuite marge déjà corrigée mig 116).
 */
export async function getCourierDetail(courierId: string): Promise<GetCourierDetailResult> {
  // @security P2-4 : valider l'uuid tôt (message propre + refus défensif).
  const parsed = z.string().uuid().safeParse(courierId?.trim())
  if (!parsed.success) return { error: 'Livreur non spécifié.', detail: null }
  const id = parsed.data

  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', detail: null }

  const { data: courierRow, error: courierErr } = await supabase
    .from('couriers')
    .select('id, name, courier_type, company_name, phone, notes, status, balance_cap_mad, access_code, created_at')
    .eq('id', id)
    .maybeSingle()
  if (courierErr) return { error: courierErr.message, detail: null }
  if (!courierRow) return { error: 'Livreur introuvable.', detail: null }
  const courier = courierRow as CourierRow

  const { data: balanceRow, error: balanceErr } = await supabase
    .from('v_courier_balances')
    .select(
      'id, name, courier_type, company_name, status, balance_cap_mad, cash_owed_mad, product_debt_mad, total_balance_mad, over_cap',
    )
    .eq('id', id)
    .maybeSingle()
  if (balanceErr) return { error: balanceErr.message, detail: null }

  const { data: remittanceRows, error: remitErr } = await supabase
    .from('courier_remittances')
    .select('id, expected_amount_mad, received_amount_mad, status, reference, reconciled_at, created_at')
    .eq('courier_id', id)
    .order('created_at', { ascending: false })
  if (remitErr) return { error: remitErr.message, detail: null }

  const { data: orderRows, error: ordersErr } = await supabase
    .from('orders')
    .select('id, total_amount, status, delivered_at, customer_city')
    .eq('courier_id', id)
    .order('delivered_at', { ascending: false })
  if (ordersErr) return { error: ordersErr.message, detail: null }

  const { data: debtRows, error: debtErr } = await supabase
    .from('courier_product_debts')
    .select('id, order_id, variant_id, quantity, amount_mad, reason, created_at')
    .eq('courier_id', id)
    .order('created_at', { ascending: false })
  if (debtErr) return { error: debtErr.message, detail: null }

  const detail: CourierDetail = {
    courier: {
      id: courier.id,
      name: courier.name,
      courierType: courier.courier_type,
      companyName: courier.company_name,
      phone: courier.phone,
      notes: courier.notes,
      status: courier.status,
      balanceCapMad: Number(courier.balance_cap_mad ?? 0),
      accessCode: courier.access_code,
      createdAt: courier.created_at,
    },
    balance: balanceRow ? mapBalanceRow(balanceRow as CourierBalanceRow) : null,
    remittances: ((remittanceRows ?? []) as CourierRemittanceRow[]).map((r) => ({
      id: r.id,
      expectedAmountMad: Number(r.expected_amount_mad ?? 0),
      receivedAmountMad: Number(r.received_amount_mad ?? 0),
      status: r.status,
      reference: r.reference,
      reconciledAt: r.reconciled_at,
      createdAt: r.created_at,
    })),
    orders: ((orderRows ?? []) as Pick<OrderRow, 'id' | 'total_amount' | 'status' | 'delivered_at' | 'customer_city'>[]).map(
      (o) => ({
        orderId: o.id,
        reference: o.id,
        totalAmount: Number(o.total_amount ?? 0),
        status: o.status,
        deliveredAt: o.delivered_at,
        customerCity: o.customer_city,
      }),
    ),
    productDebts: ((debtRows ?? []) as CourierProductDebtRow[]).map((d) => ({
      id: d.id,
      orderId: d.order_id,
      variantId: d.variant_id,
      quantity: d.quantity,
      amountMad: Number(d.amount_mad ?? 0),
      reason: d.reason,
      createdAt: d.created_at,
    })),
  }

  return { error: null, detail }
}

// ─── createCourier ────────────────────────────────────────────────────────────

const CreateCourierSchema = z.object({
  name: z.string().trim().min(1, { message: 'Nom du livreur requis.' }),
  courierType: z.enum(['company', 'personal'], { message: 'Type de livreur invalide.' }),
  companyName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
  balanceCapMad: z.number().min(0, { message: 'Plafond invalide.' }).default(0),
})

export type CreateCourierInput = z.infer<typeof CreateCourierSchema>

export interface CreateCourierResult {
  error: string | null
  courierId: string | null
}

/**
 * Crée une fiche livreur (société ou personnel) + son access_code (lien
 * /courier cloisonné, Lot B). Écriture via service_role — `couriers` n'a
 * aucune policy INSERT (deny par défaut, mig 126) — APRÈS la garde admin.
 */
export async function createCourier(input: CreateCourierInput): Promise<CreateCourierResult> {
  const parsed = CreateCourierSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.', courierId: null }
  }
  const { name, courierType, companyName, phone, notes, balanceCapMad } = parsed.data

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', courierId: null }

  const admin = createAdminClient()

  // Génération de l'access_code avec retry borné en cas de collision (UNIQUE) —
  // probabilité négligeable (~40 bits), filet de sécurité uniquement.
  let lastInsertErr: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const accessCode = generateAccessCode()
    const { data, error: insertErr } = await admin
      .from('couriers')
      .insert({
        name,
        courier_type: courierType,
        company_name: companyName || null,
        phone: phone || null,
        notes: notes || null,
        balance_cap_mad: balanceCapMad,
        access_code: accessCode,
        created_by: userId,
      })
      .select('id')
      .single()

    if (!insertErr && data) {
      revalidatePath('/admin/couriers')
      return { error: null, courierId: (data as { id: string }).id }
    }

    lastInsertErr = insertErr?.message ?? 'Erreur inconnue.'
    // Collision UNIQUE(access_code) → retente avec un nouveau code ; toute
    // autre erreur (contrainte métier, etc.) est immédiatement remontée.
    if (!lastInsertErr.toLowerCase().includes('access_code')) break
  }

  return { error: lastInsertErr ?? 'Erreur lors de la création du livreur.', courierId: null }
}

// ─── setCourierStatus ─────────────────────────────────────────────────────────

const SetCourierStatusSchema = z.object({
  courierId: z.string().uuid({ message: 'Livreur invalide.' }),
  status: z.enum(['active', 'blocked'], { message: 'Statut invalide.' }),
})

export type SetCourierStatusInput = z.infer<typeof SetCourierStatusSchema>

export interface SetCourierStatusResult {
  error: string | null
  success: boolean
}

/** Active/bloque un livreur. Écriture via service_role, APRÈS la garde admin. */
export async function setCourierStatus(input: SetCourierStatusInput): Promise<SetCourierStatusResult> {
  const parsed = SetCourierStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.', success: false }
  }
  const { courierId, status } = parsed.data

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', success: false }

  const admin = createAdminClient()
  const { error: updateErr } = await admin.from('couriers').update({ status }).eq('id', courierId)
  if (updateErr) return { error: updateErr.message, success: false }

  revalidatePath('/admin/couriers')
  return { error: null, success: true }
}
