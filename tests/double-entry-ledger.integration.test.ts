/**
 * Migration 121 — GRAND LIVRE DOUBLE-ENTRÉE (B2).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Aucun secret en dur — clés lues via `supabase status`.
 *
 * Prouve les INVARIANTS COMPTABLES :
 *  - toute transaction est ÉQUILIBRÉE (somme des postings = 0), refus sinon ;
 *  - solde d'un compte = SUM(amount signé) ;
 *  - un cycle COD complet (collecte → remise → payout affilié → paiement fournisseur)
 *    boucle à 0 : cash_in_transit_courier revient à 0, platform_cash = marge + frais retenus ;
 *  - une remise PARTIELLE laisse le manque tracé sur cash_in_transit_courier (la « fuite ») ;
 *  - idempotence (rejeu même clé → 0 nouveau posting) ;
 *  - immuabilité (UPDATE/DELETE refusés) ;
 *  - montant nul et compte inconnu refusés ;
 *  - numeric (pas de float) : 250.55 round-trip exact.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const tag = `led121-${Date.now()}`
let sb: SupabaseClient // service_role → auth.role() = 'service_role' (garde RPC OK)

// Identités de party isolées par run (les soldes se lisent par party_id).
const courierId = randomUUID()
const affiliateId = randomUUID()
const supplierId = randomUUID()
const platformId = randomUUID()

type Posting = {
  account_code: string
  amount: number
  party_type?: string
  party_id?: string
  currency?: string
}

async function record(kind: string, key: string, postings: Posting[]) {
  return sb.rpc('record_ledger_transaction', {
    p_kind: kind,
    p_idempotency_key: key,
    p_postings: postings,
    p_order_id: null,
    p_currency: 'MAD',
    p_metadata: { tag },
  })
}

async function balance(accountCode: string, partyId: string): Promise<number> {
  const { data, error } = await sb
    .from('v_ledger_balances')
    .select('balance_mad')
    .eq('account_code', accountCode)
    .eq('party_id', partyId)
    .maybeSingle()
  if (error) throw new Error(`balance(${accountCode}): ${error.message}`)
  return data ? Number(data.balance_mad) : 0
}

describe('Migration 121 — grand livre double-entrée (équilibre comptable)', () => {
  beforeAll(() => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'double-entry-ledger-121')
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  it('refuse une transaction déséquilibrée (somme ≠ 0)', async () => {
    const { error } = await record('manual_adjust', `${tag}-unbal`, [
      { account_code: 'platform_cash', amount: 100, party_type: 'platform', party_id: platformId },
      { account_code: 'platform_margin_income', amount: -90, party_type: 'platform', party_id: platformId },
    ])
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/déséquilibrée|somme/i)
  })

  it('refuse un posting de montant nul', async () => {
    const { error } = await record('manual_adjust', `${tag}-zero`, [
      { account_code: 'platform_cash', amount: 0, party_type: 'platform', party_id: platformId },
      { account_code: 'platform_margin_income', amount: 0, party_type: 'platform', party_id: platformId },
    ])
    expect(error).not.toBeNull()
  })

  it('refuse un compte inconnu', async () => {
    const { error } = await record('manual_adjust', `${tag}-badacct`, [
      { account_code: 'compte_bidon', amount: 10, party_type: 'platform', party_id: platformId },
      { account_code: 'platform_cash', amount: -10, party_type: 'platform', party_id: platformId },
    ])
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/inconnu/i)
  })

  it('refuse une devise mixte (P2-1 : MVP mono-devise)', async () => {
    const { error } = await record('manual_adjust', `${tag}-mixccy`, [
      { account_code: 'platform_cash', amount: 100, party_type: 'platform', party_id: platformId },
      // devise USD sur un posting alors que la txn est en MAD → refus
      { account_code: 'platform_margin_income', amount: -100, party_type: 'platform', party_id: platformId, currency: 'USD' },
    ])
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/devise mixte|mono-devise/i)
  })

  it('enregistre un cycle COD complet qui boucle à 0 (vente 250 : usine 120, marge 30, livr 35, conf 10, emb 10, commission 45)', async () => {
    // A — cod_collected : le livreur détient 250, réparti en dûs/produits.
    const a = await record('cod_collected', `${tag}-A`, [
      { account_code: 'cash_in_transit_courier', amount: 250, party_type: 'courier', party_id: courierId },
      { account_code: 'supplier_payable', amount: -120, party_type: 'supplier', party_id: supplierId },
      { account_code: 'platform_margin_income', amount: -30, party_type: 'platform', party_id: platformId },
      { account_code: 'delivery_income', amount: -35, party_type: 'platform', party_id: platformId },
      { account_code: 'confirmation_income', amount: -10, party_type: 'platform', party_id: platformId },
      { account_code: 'packaging_income', amount: -10, party_type: 'platform', party_id: platformId },
      { account_code: 'affiliate_commission_payable', amount: -45, party_type: 'affiliate', party_id: affiliateId },
    ])
    expect(a.error).toBeNull()
    expect(a.data).toBeTruthy()

    // B — courier_remittance : le livreur remet tout → cash_in_transit revient à 0.
    const b = await record('courier_remittance', `${tag}-B`, [
      { account_code: 'platform_cash', amount: 250, party_type: 'platform', party_id: platformId },
      { account_code: 'cash_in_transit_courier', amount: -250, party_type: 'courier', party_id: courierId },
    ])
    expect(b.error).toBeNull()

    // C — affiliate_payout : la plateforme paie la commission.
    const c = await record('affiliate_payout', `${tag}-C`, [
      { account_code: 'affiliate_commission_payable', amount: 45, party_type: 'affiliate', party_id: affiliateId },
      { account_code: 'platform_cash', amount: -45, party_type: 'platform', party_id: platformId },
    ])
    expect(c.error).toBeNull()

    // D — supplier_payment : la plateforme paie le fournisseur.
    const d = await record('supplier_payment', `${tag}-D`, [
      { account_code: 'supplier_payable', amount: 120, party_type: 'supplier', party_id: supplierId },
      { account_code: 'platform_cash', amount: -120, party_type: 'platform', party_id: platformId },
    ])
    expect(d.error).toBeNull()

    // Soldes finaux : cash livreur = 0, dûs soldés = 0, platform_cash = 30+35+10+10 = 85.
    expect(await balance('cash_in_transit_courier', courierId)).toBe(0)
    expect(await balance('affiliate_commission_payable', affiliateId)).toBe(0)
    expect(await balance('supplier_payable', supplierId)).toBe(0)
    expect(await balance('platform_cash', platformId)).toBe(85)
  })

  it('trace la FUITE : une remise partielle (220 sur 250) laisse +30 sur cash_in_transit_courier', async () => {
    const leakCourier = randomUUID()
    const leakPlatform = randomUUID()
    // Collecte 250 (minimal équilibré : cash + un passif).
    await record('cod_collected', `${tag}-leak-A`, [
      { account_code: 'cash_in_transit_courier', amount: 250, party_type: 'courier', party_id: leakCourier },
      { account_code: 'supplier_payable', amount: -250, party_type: 'supplier', party_id: supplierId },
    ])
    // Remise PARTIELLE : 220 remis, 30 restent chez le livreur.
    await record('courier_remittance', `${tag}-leak-B`, [
      { account_code: 'platform_cash', amount: 220, party_type: 'platform', party_id: leakPlatform },
      { account_code: 'cash_in_transit_courier', amount: -220, party_type: 'courier', party_id: leakCourier },
    ])
    // Le manque est chiffré et tracé.
    expect(await balance('cash_in_transit_courier', leakCourier)).toBe(30)
  })

  it('est idempotent : rejeu même clé → même transaction, 0 posting en double', async () => {
    const key = `${tag}-idem`
    const p: Posting[] = [
      { account_code: 'platform_cash', amount: 50, party_type: 'platform', party_id: platformId },
      { account_code: 'platform_margin_income', amount: -50, party_type: 'platform', party_id: platformId },
    ]
    const r1 = await record('manual_adjust', key, p)
    const r2 = await record('manual_adjust', key, p)
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect(r2.data).toBe(r1.data) // même id de transaction
    const { count } = await sb
      .from('ledger_postings')
      .select('id', { count: 'exact', head: true })
      .eq('transaction_id', r1.data as string)
    expect(count).toBe(2) // pas 4
  })

  it('est immuable : UPDATE et DELETE sur postings/transactions refusés', async () => {
    const key = `${tag}-immut`
    const r = await record('manual_adjust', key, [
      { account_code: 'platform_cash', amount: 12, party_type: 'platform', party_id: platformId },
      { account_code: 'platform_margin_income', amount: -12, party_type: 'platform', party_id: platformId },
    ])
    const txnId = r.data as string
    const up = await sb.from('ledger_transactions').update({ kind: 'manual_adjust' }).eq('id', txnId)
    expect(up.error).not.toBeNull()
    const del = await sb.from('ledger_postings').delete().eq('transaction_id', txnId)
    expect(del.error).not.toBeNull()
    const delTxn = await sb.from('ledger_transactions').delete().eq('id', txnId)
    expect(delTxn.error).not.toBeNull()
  })

  it('préserve la précision numeric (250.55, pas de float)', async () => {
    const party = randomUUID()
    const r = await record('manual_adjust', `${tag}-num`, [
      { account_code: 'platform_cash', amount: 250.55, party_type: 'platform', party_id: party },
      { account_code: 'platform_margin_income', amount: -250.55, party_type: 'platform', party_id: party },
    ])
    expect(r.error).toBeNull()
    expect(await balance('platform_cash', party)).toBe(250.55)
  })
})
