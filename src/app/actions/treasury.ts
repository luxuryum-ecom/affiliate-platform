'use server'

import { requireAdmin } from './_guards'

/**
 * P0 cockpit trésorerie — couche données (lecture seule).
 *
 * Consomme l'EXISTANT (mig 121-125, cf. CLAUDE.md) : `v_treasury_overview` et
 * `v_courier_cash_in_transit` (grand livre double-entrée) + `commissions` +
 * `v_courier_remittance_pending` (réconciliation). Aucune écriture ici.
 *
 * Réservé admin (allowAgent: false) — vision trésorerie = donnée financière
 * sensible (CLAUDE.md règle 5).
 */

export interface TreasuryAccountBalance {
  accountCode: string
  type: string
  normalBalance: string
  balanceMad: number
  movements: number
}

export interface CommissionStatusTotal {
  status: 'pending' | 'approved' | 'paid'
  totalMad: number
  count: number
}

export interface TreasuryOverview {
  accounts: TreasuryAccountBalance[]
  /** Créance livreur globale : cash encaissé COD pas encore réconcilié (fuite chiffrée si > 0). */
  courierCashInTransitMad: number
  commissionsByStatus: CommissionStatusTotal[]
  /** Commandes livrées pas encore couvertes par un bordereau réconcilié. */
  pendingRemittance: {
    ordersCount: number
    totalExpectedMad: number
  }
}

export interface GetTreasuryOverviewResult {
  error: string | null
  data: TreasuryOverview | null
}

const COMMISSION_STATUSES: Array<'pending' | 'approved' | 'paid'> = ['pending', 'approved', 'paid']

export async function getTreasuryOverview(): Promise<GetTreasuryOverviewResult> {
  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', data: null }

  // 1. Soldes par compte du grand livre (mig 125).
  const { data: accountRows, error: accountsErr } = await supabase
    .from('v_treasury_overview')
    .select('account_code, type, normal_balance, balance_mad, movements')
    .order('account_code', { ascending: true })
  if (accountsErr) return { error: accountsErr.message, data: null }

  const accounts: TreasuryAccountBalance[] = (accountRows ?? []).map((r) => ({
    accountCode: r.account_code ?? '',
    type: r.type ?? '',
    normalBalance: r.normal_balance ?? '',
    balanceMad: Number(r.balance_mad ?? 0),
    movements: Number(r.movements ?? 0),
  }))

  // 2. Créance livreur globale (mig 122).
  const { data: transitRow, error: transitErr } = await supabase
    .from('v_courier_cash_in_transit')
    .select('balance_mad')
    .maybeSingle()
  if (transitErr) return { error: transitErr.message, data: null }
  const courierCashInTransitMad = Number(transitRow?.balance_mad ?? 0)

  // 3. Commissions par statut — montant + nb. Les commissions contre-passées
  //    (reversed=true) sont EXCLUES : elles ne sont plus payables (garde N1, mig 123)
  //    et fausseraient les totaux du cockpit. Décision prise seule (autonomie CLAUDE.md),
  //    cohérente avec create_payout / bulkApproveCommissions qui filtrent déjà reversed.
  const { data: commissionRows, error: commissionsErr } = await supabase
    .from('commissions')
    .select('status, amount')
    .eq('reversed', false)
  if (commissionsErr) return { error: commissionsErr.message, data: null }

  const totalsByStatus = new Map<string, { totalMad: number; count: number }>()
  for (const row of commissionRows ?? []) {
    const key = row.status as string
    const entry = totalsByStatus.get(key) ?? { totalMad: 0, count: 0 }
    entry.totalMad += Number(row.amount ?? 0)
    entry.count += 1
    totalsByStatus.set(key, entry)
  }
  const commissionsByStatus: CommissionStatusTotal[] = COMMISSION_STATUSES.map((status) => {
    const entry = totalsByStatus.get(status) ?? { totalMad: 0, count: 0 }
    return { status, totalMad: entry.totalMad, count: entry.count }
  })

  // 4. Commandes livrées en attente de réconciliation (mig 125).
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('v_courier_remittance_pending')
    .select('expected_amount_mad')
  if (pendingErr) return { error: pendingErr.message, data: null }

  const pendingRemittance = {
    ordersCount: pendingRows?.length ?? 0,
    totalExpectedMad: (pendingRows ?? []).reduce(
      (sum, r) => sum + Number(r.expected_amount_mad ?? 0),
      0,
    ),
  }

  return {
    error: null,
    data: { accounts, courierCashInTransitMad, commissionsByStatus, pendingRemittance },
  }
}
