import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/app/actions/logistics', () => ({ getLogisticsSettings: vi.fn() }))
vi.mock('@/app/actions/cities', () => ({ resolveDeliveryFeeByCity: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLogisticsSettings } from '@/app/actions/logistics'
import { resolveDeliveryFeeByCity } from '@/app/actions/cities'
import { createAffiliateOrder, placeOrder } from '@/app/actions/orders'
import { makeClient } from './_supabase-mock'

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

function fd(obj: Record<string, string>) {
  const f = new FormData()
  for (const k in obj) f.set(k, obj[k])
  return f
}

const emptyOrderState = { error: null, success: false, orderId: null }

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1', sell_price: 100, stock_count: 10, active: true,
    approval_status: 'approved', affiliate_enabled: true, availability_type: 'local_stock',
    name: 'Produit Test', confirmation_fee_mad: 10, packaging_fee_mad: 10, delivery_fee_mad: 0,
    factory_cost_mad: 100, purchase_price_mad: 100,
    platform_margin_type: 'percentage', platform_margin_value: 0,
    ...overrides,
  }
}

const customer = {
  customer_name: 'Client', customer_phone: '0600000000',
  customer_city: 'Rabat', customer_address: 'Adresse 1',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked(resolveDeliveryFeeByCity).mockResolvedValue(35)
  mocked(getLogisticsSettings).mockResolvedValue({ return_fee_mad: 10, default_delivery_fee_mad: 40 })
})

// ───────────────────────── createAffiliateOrder (D4 : blocage) ─────────────────────────

describe('createAffiliateOrder — D4 blocage commission négative', () => {
  it('commission négative → commande BLOQUÉE, aucun insert', async () => {
    const inserted: string[] = []
    mocked(createClient).mockResolvedValue(
      makeClient({
        getUser: () => ({ data: { user: { id: 'aff1' } } }),
        onInsert: (table) => inserted.push(table),
        resolve: (table) => {
          if (table === 'profiles') return { data: { role: 'affiliate', status: 'approved' }, error: null }
          if (table === 'orders') return { data: { id: 'o1' }, error: null }
          return { data: null, error: null }
        },
      }),
    )
    // dette 073 — le coût/marge est lu via service_role (createAdminClient)
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        resolve: (table) =>
          table === 'products'
            ? { data: product({ sell_price: 100, factory_cost_mad: 100 }), error: null }
            : { data: null, error: null },
      }),
    )
    // commission = 100 - 100 - 0 - 35 - 10 - 10 = -55
    const res = await createAffiliateOrder(emptyOrderState, fd({ product_id: 'p1', quantity: '1', sell_price: '100', order_source: 'manual', ...customer }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/négative/i)
    expect(res.orderId).toBeNull()
    expect(inserted).not.toContain('orders')
  })

  it('commission positive → commande créée', async () => {
    mocked(createClient).mockResolvedValue(
      makeClient({
        getUser: () => ({ data: { user: { id: 'aff1' } } }),
        resolve: (table) => {
          if (table === 'profiles') return { data: { role: 'affiliate', status: 'approved' }, error: null }
          if (table === 'orders') return { data: { id: 'o1' }, error: null }
          return { data: null, error: null }
        },
      }),
    )
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        resolve: (table) =>
          table === 'products'
            ? { data: product({ sell_price: 100, factory_cost_mad: 30 }), error: null }
            : { data: null, error: null },
      }),
    )
    // commission = 100 - 30 - 0 - 35 - 10 - 10 = 15 > 0
    const res = await createAffiliateOrder(emptyOrderState, fd({ product_id: 'p1', quantity: '1', sell_price: '100', order_source: 'manual', ...customer }))
    expect(res.success).toBe(true)
    expect(res.orderId).toBe('o1')
    expect(res.error).toBeNull()
  })
})

// ─────────────────── createAffiliateOrder — garde coût usine null ──────────────────────

describe('createAffiliateOrder — garde factory_cost_mad null (fail closed)', () => {
  it('factory_cost_mad null → commande REFUSÉE (produit incomplet)', async () => {
    const inserted: string[] = []
    mocked(createClient).mockResolvedValue(
      makeClient({
        getUser: () => ({ data: { user: { id: 'aff1' } } }),
        onInsert: (table) => inserted.push(table),
        resolve: (table) => {
          if (table === 'profiles') return { data: { role: 'affiliate', status: 'approved' }, error: null }
          if (table === 'orders') return { data: { id: 'o1' }, error: null }
          return { data: null, error: null }
        },
      }),
    )
    // factory_cost_mad absent → null, lu via service_role
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        resolve: (table) =>
          table === 'products'
            ? { data: product({ sell_price: 200, factory_cost_mad: null }), error: null }
            : { data: null, error: null },
      }),
    )
    const res = await createAffiliateOrder(emptyOrderState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', ...customer }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/coût usine/i)
    expect(res.orderId).toBeNull()
    expect(inserted).not.toContain('orders')
  })
})

// ─────────────────── placeOrder — garde coût usine null ────────────────────────────────

describe('placeOrder — garde factory_cost_mad null avec affilié (fail closed)', () => {
  it('factory_cost_mad null + affilié validé → commande REFUSÉE', async () => {
    const inserted: string[] = []
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        onInsert: (table) => inserted.push(table),
        resolve: (table) => {
          if (table === 'products') return { data: product({ sell_price: 200, factory_cost_mad: null }), error: null }
          if (table === 'profiles') return { data: { id: 'aff1', role: 'affiliate', status: 'approved' }, error: null }
          if (table === 'affiliate_product_prices') return { data: null, error: null }
          if (table === 'orders') {
            return { data: { id: 'o1' }, error: null }
          }
          return { data: null, error: null }
        },
      }),
    )
    const res = await placeOrder(emptyOrderState, fd({ productId: 'p1', affiliateId: 'aff1', quantity: '1', ...customer }))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/coût usine/i)
    expect(res.orderId).toBeNull()
    expect(inserted).not.toContain('orders')
  })

  it("factory_cost_mad null SANS affilié → vente passante (la garde ne s'applique que si affilié)", async () => {
    let ordersPayload: Record<string, unknown> | undefined
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        onInsert: (table, payload) => { if (table === 'orders') ordersPayload = payload as Record<string, unknown> },
        resolve: (table, state) => {
          if (table === 'products') return { data: product({ sell_price: 200, factory_cost_mad: null }), error: null }
          if (table === 'orders') {
            if (state.op === 'select' && state.head) return { count: 0, data: null, error: null }
            return { data: { id: 'o1' }, error: null }
          }
          if (table === 'order_signals') return { data: null, error: null }
          return { data: null, error: null }
        },
      }),
    )
    // Pas d'affiliateId → validatedAffiliateId sera null → pas de commission → vente passe
    const res = await placeOrder(emptyOrderState, fd({ productId: 'p1', quantity: '1', ...customer }))
    expect(res.success).toBe(true)
    expect(ordersPayload?.commission_amount).toBe(0)
  })
})

// ───────────────────────── placeOrder (flux public : NON bloqué) ─────────────────────────

describe('placeOrder — flux public, commission négative NON bloquante', () => {
  it('commission négative → vente conservée, commission clampée à 0, aucun message d’erreur (zéro fuite)', async () => {
    let ordersPayload: Record<string, unknown> | undefined
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        onInsert: (table, payload) => { if (table === 'orders') ordersPayload = payload as Record<string, unknown> },
        resolve: (table, state) => {
          if (table === 'products') return { data: product({ sell_price: 100, factory_cost_mad: 100 }), error: null }
          if (table === 'profiles') return { data: { id: 'aff1', role: 'affiliate', status: 'approved' }, error: null }
          if (table === 'affiliate_product_prices') return { data: null, error: null }
          if (table === 'orders') {
            if (state.op === 'select' && state.head) return { count: 0, data: null, error: null }
            return { data: { id: 'o1' }, error: null }
          }
          if (table === 'order_signals') return { data: null, error: null }
          return { data: null, error: null }
        },
      }),
    )
    const res = await placeOrder(emptyOrderState, fd({ productId: 'p1', affiliateId: 'aff1', quantity: '1', ...customer }))

    // Vente conservée
    expect(res.success).toBe(true)
    expect(res.orderId).toBe('o1')
    // Aucun message d'erreur → aucune fuite de structure de coût
    expect(res.error).toBeNull()
    // Commission ramenée à 0 (jamais négative au stockage)
    expect(ordersPayload?.commission_amount).toBe(0)
    expect(ordersPayload?.affiliate_commission_mad_snapshot).toBe(0)
  })

  it('commission positive → enregistrée telle quelle', async () => {
    let ordersPayload: Record<string, unknown> | undefined
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        onInsert: (table, payload) => { if (table === 'orders') ordersPayload = payload as Record<string, unknown> },
        resolve: (table, state) => {
          if (table === 'products') return { data: product({ sell_price: 200, factory_cost_mad: 100 }), error: null }
          if (table === 'profiles') return { data: { id: 'aff1', role: 'affiliate', status: 'approved' }, error: null }
          if (table === 'affiliate_product_prices') return { data: null, error: null }
          if (table === 'orders') {
            if (state.op === 'select' && state.head) return { count: 0, data: null, error: null }
            return { data: { id: 'o2' }, error: null }
          }
          if (table === 'order_signals') return { data: null, error: null }
          return { data: null, error: null }
        },
      }),
    )
    // commission = 200 - 100 - 0 - 35 - 10 - 10 = 45
    const res = await placeOrder(emptyOrderState, fd({ productId: 'p1', affiliateId: 'aff1', quantity: '1', ...customer }))
    expect(res.success).toBe(true)
    expect(ordersPayload?.commission_amount).toBe(45)
  })
})
