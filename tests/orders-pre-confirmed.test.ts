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
import { createAffiliateOrder, placeOrder } from '@/app/actions/orders'
import { makeClient } from './_supabase-mock'

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

function fd(obj: Record<string, string>) {
  const f = new FormData()
  for (const k in obj) f.set(k, obj[k])
  return f
}

const emptyState = { error: null, success: false, orderId: null }

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1', sell_price: 200, stock_count: 10, active: true,
    approval_status: 'approved', affiliate_enabled: true, availability_type: 'local_stock',
    name: 'Test', confirmation_fee_mad: 10, packaging_fee_mad: 10, delivery_fee_mad: 0,
    factory_cost_mad: 30, purchase_price_mad: 30,
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
  mocked(getLogisticsSettings).mockResolvedValue({ return_fee_mad: 10, default_delivery_fee_mad: 40 })
})

// ── placeOrder : is_pre_confirmed forcé à false ───────────────────────────────

describe('placeOrder — is_pre_confirmed forcé false (Option A, flux public)', () => {
  it('force false même si formData contient is_pre_confirmed=true', async () => {
    let ordersPayload: Record<string, unknown> | undefined
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        onInsert: (table, payload) => {
          if (table === 'orders') ordersPayload = payload as Record<string, unknown>
        },
        resolve: (table, state) => {
          if (table === 'products') return { data: product({ sell_price: 200, factory_cost_mad: 30 }), error: null }
          if (table === 'orders') {
            if (state.op === 'select' && state.head) return { count: 0, data: null, error: null }
            return { data: { id: 'o1' }, error: null }
          }
          if (table === 'order_signals') return { data: null, error: null }
          return { data: null, error: null }
        },
      }),
    )
    // formData contient is_pre_confirmed=true — doit être ignoré
    const res = await placeOrder(emptyState, fd({ productId: 'p1', quantity: '1', is_pre_confirmed: 'true', ...customer }))
    expect(res.success).toBe(true)
    expect(ordersPayload?.is_pre_confirmed).toBe(false)
  })

  it('force false quand is_pre_confirmed absent du formData', async () => {
    let ordersPayload: Record<string, unknown> | undefined
    mocked(createAdminClient).mockReturnValue(
      makeClient({
        onInsert: (table, payload) => {
          if (table === 'orders') ordersPayload = payload as Record<string, unknown>
        },
        resolve: (table, state) => {
          if (table === 'products') return { data: product({ sell_price: 200, factory_cost_mad: 30 }), error: null }
          if (table === 'orders') {
            if (state.op === 'select' && state.head) return { count: 0, data: null, error: null }
            return { data: { id: 'o1' }, error: null }
          }
          if (table === 'order_signals') return { data: null, error: null }
          return { data: null, error: null }
        },
      }),
    )
    const res = await placeOrder(emptyState, fd({ productId: 'p1', quantity: '1', ...customer }))
    expect(res.success).toBe(true)
    expect(ordersPayload?.is_pre_confirmed).toBe(false)
  })
})

// ── createAffiliateOrder : anti-coercion is_pre_confirmed ─────────────────────

describe('createAffiliateOrder — anti-coercion is_pre_confirmed', () => {
  function makeAffClient(capturePayload: (p: Record<string, unknown>) => void) {
    return makeClient({
      getUser: () => ({ data: { user: { id: 'aff1' } } }),
      onInsert: (table, payload) => {
        if (table === 'orders') capturePayload(payload as Record<string, unknown>)
      },
      resolve: (table) => {
        if (table === 'profiles') return { data: { role: 'affiliate', status: 'approved' }, error: null }
        if (table === 'products') return { data: product(), error: null }
        if (table === 'orders') return { data: { id: 'o1' }, error: null }
        return { data: null, error: null }
      },
    })
  }

  it('"true" → is_pre_confirmed = true', async () => {
    let p: Record<string, unknown> = {}
    mocked(createClient).mockResolvedValue(makeAffClient((pl) => { p = pl }))
    const res = await createAffiliateOrder(emptyState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', is_pre_confirmed: 'true', ...customer }))
    expect(res.success).toBe(true)
    expect(p.is_pre_confirmed).toBe(true)
  })

  it('"false" → is_pre_confirmed = false', async () => {
    let p: Record<string, unknown> = {}
    mocked(createClient).mockResolvedValue(makeAffClient((pl) => { p = pl }))
    const res = await createAffiliateOrder(emptyState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', is_pre_confirmed: 'false', ...customer }))
    expect(res.success).toBe(true)
    expect(p.is_pre_confirmed).toBe(false)
  })

  it('absent → is_pre_confirmed = false', async () => {
    let p: Record<string, unknown> = {}
    mocked(createClient).mockResolvedValue(makeAffClient((pl) => { p = pl }))
    const res = await createAffiliateOrder(emptyState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', ...customer }))
    expect(res.success).toBe(true)
    expect(p.is_pre_confirmed).toBe(false)
  })

  it('"yes" → is_pre_confirmed = false (anti-coercion string truthy)', async () => {
    let p: Record<string, unknown> = {}
    mocked(createClient).mockResolvedValue(makeAffClient((pl) => { p = pl }))
    const res = await createAffiliateOrder(emptyState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', is_pre_confirmed: 'yes', ...customer }))
    expect(res.success).toBe(true)
    expect(p.is_pre_confirmed).toBe(false)
  })

  it('"1" → is_pre_confirmed = false (anti-coercion string numérique)', async () => {
    let p: Record<string, unknown> = {}
    mocked(createClient).mockResolvedValue(makeAffClient((pl) => { p = pl }))
    const res = await createAffiliateOrder(emptyState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', is_pre_confirmed: '1', ...customer }))
    expect(res.success).toBe(true)
    expect(p.is_pre_confirmed).toBe(false)
  })
})

// ── Option A : commission et confirmation_fee_snapshot INCHANGÉS (is_pre_confirmed n'affecte aucun montant) ─

describe('Option A — commission inchangée quelle que soit is_pre_confirmed', () => {
  function makeAffClientCapture(capturePayload: (p: Record<string, unknown>) => void) {
    return makeClient({
      getUser: () => ({ data: { user: { id: 'aff1' } } }),
      onInsert: (table, payload) => {
        if (table === 'orders') capturePayload(payload as Record<string, unknown>)
      },
      resolve: (table) => {
        if (table === 'profiles') return { data: { role: 'affiliate', status: 'approved' }, error: null }
        // factory_cost_mad=30, sell=200 → commission = 200-30-0-35-10-10 = 115
        if (table === 'products') return { data: product({ factory_cost_mad: 30, confirmation_fee_mad: 10 }), error: null }
        if (table === 'orders') return { data: { id: 'o1' }, error: null }
        return { data: null, error: null }
      },
    })
  }

  it('is_pre_confirmed=false → commission et confirmation_fee_snapshot attendus', async () => {
    let p: Record<string, unknown> = {}
    mocked(createClient).mockResolvedValue(makeAffClientCapture((pl) => { p = pl }))
    await createAffiliateOrder(emptyState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', is_pre_confirmed: 'false', ...customer }))
    expect(p.confirmation_fee_snapshot).toBe(10)
    expect(p.affiliate_commission_mad_snapshot).toBe(115)
  })

  it('is_pre_confirmed=true → commission et confirmation_fee_snapshot IDENTIQUES (Option A : flag sans effet sur montants)', async () => {
    let p: Record<string, unknown> = {}
    mocked(createClient).mockResolvedValue(makeAffClientCapture((pl) => { p = pl }))
    await createAffiliateOrder(emptyState, fd({ product_id: 'p1', quantity: '1', sell_price: '200', order_source: 'manual', is_pre_confirmed: 'true', ...customer }))
    expect(p.confirmation_fee_snapshot).toBe(10)
    expect(p.affiliate_commission_mad_snapshot).toBe(115)
  })
})
