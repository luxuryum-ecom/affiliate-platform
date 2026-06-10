/**
 * Automated E2E verification for supplier product moderation (no browser).
 * Run: npx --yes tsx scripts/e2e-supplier-moderation.ts
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import {
  SUPPLIER_PRODUCT_SELECT,
  assertSupplierSelectSafe,
  moderateSupplierProduct,
  validateSupplierProductReadyForApproval,
} from '../src/lib/supplier-product-moderation'

const FORBIDDEN_SUPPLIER_KEYS = [
  'ai_risk_score',
  'moderation_reason',
  'moderation_signals',
  'moderation_flag',
  'admin_notes',
  'supplier_private_notes',
  'platform_margin_type',
  'platform_margin_value',
  'approved_by',
] as const

const MARKETPLACE_SELECT =
  'id, product_name, approval_status, public_name, archived_at'

function loadEnvLocal(): void {
  const raw = readFileSync('.env.local', 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

function pass(msg: string): void {
  console.log(`OK: ${msg}`)
}

async function main(): Promise<void> {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) fail('.env.local missing Supabase URL or service role key')

  assertSupplierSelectSafe(SUPPLIER_PRODUCT_SELECT)

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const tag = `e2e-moderation-${Date.now()}`

  // ── 1. Migration 044 schema ───────────────────────────────────────────────
  const { error: schemaProbeErr } = await admin
    .from('supplier_products')
    .select(
      'approval_status, moderation_flag, ai_risk_score, moderation_reason, moderation_signals',
    )
    .limit(1)
  if (schemaProbeErr) fail(`Migration 044 columns missing: ${schemaProbeErr.message}`)
  pass('Migration 044 columns queryable on remote')

  // ── 2. Supplier fixture ─────────────────────────────────────────────────────
  const { data: supplierProfile, error: supplierErr } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'supplier')
    .limit(1)
    .maybeSingle()
  if (supplierErr || !supplierProfile) {
    fail(
      'No supplier profile in remote DB — cannot run submit→approve flow (seed a supplier account first)',
    )
  }
  const supplierId = supplierProfile.id as string
  pass(`Using supplier profile ${supplierId}`)

  // ── 3. Supplier submit (pending_review + moderation metadata) ─────────────
  const mod = moderateSupplierProduct({
    product_name: tag,
    description: 'E2E automated moderation verification product.',
    photos: ['https://example.com/e2e.jpg'],
    category: 'Textile',
    min_quantity: 10,
    stock_quantity: 100,
    lead_time_days: 7,
    suggested_wholesale_price_mad: 120,
    supplier_unit_price_usd: null,
    moq_tier_count: 0,
  })

  const { data: inserted, error: insertErr } = await admin
    .from('supplier_products')
    .insert({
      supplier_id: supplierId,
      supplier_type: 'morocco',
      product_name: tag,
      category: 'Textile',
      niche: '',
      description: 'E2E automated moderation verification product.',
      photos: ['https://example.com/e2e.jpg'],
      min_quantity: 10,
      origin_country: 'Maroc',
      availability_type: 'local_stock',
      target_buyer_type: 'wholesaler',
      suggested_wholesale_price_mad: 120,
      approval_status: 'pending_review',
      stock_quantity: 100,
      lead_time_days: 7,
      moderation_flag: mod.moderation_flag,
      ai_risk_score: mod.ai_risk_score,
      moderation_reason: mod.moderation_reason,
      moderation_signals: mod.moderation_signals,
      admin_notes: 'INTERNAL_E2E_ADMIN_NOTE',
      supplier_private_notes: 'INTERNAL_E2E_SUPPLIER_NOTE',
    })
    .select('id, approval_status')
    .single()

  if (insertErr || !inserted) fail(`Insert test product: ${insertErr?.message ?? 'no row'}`)
  const productId = inserted.id as string
  if (inserted.approval_status !== 'pending_review') {
    fail(`Expected pending_review, got ${inserted.approval_status}`)
  }
  pass('Supplier submit → pending_review')

  // ── 4. Supplier-safe select (no moderation / internal fields) ─────────────
  const { data: supplierView, error: supplierViewErr } = await admin
    .from('supplier_products')
    .select(SUPPLIER_PRODUCT_SELECT)
    .eq('id', productId)
    .single()
  if (supplierViewErr || !supplierView) fail(`Supplier safe select: ${supplierViewErr?.message}`)
  for (const key of FORBIDDEN_SUPPLIER_KEYS) {
    if (key in (supplierView as Record<string, unknown>)) {
      fail(`Supplier select leaked field: ${key}`)
    }
  }
  pass('Supplier-facing select excludes moderation and internal fields')

  // ── 5. Marketplace hidden while pending ───────────────────────────────────
  const { data: pendingMarket } = await admin
    .from('supplier_products')
    .select(MARKETPLACE_SELECT)
    .eq('id', productId)
    .eq('approval_status', 'approved')
    .is('archived_at', null)
    .maybeSingle()
  if (pendingMarket) fail('Marketplace query returned pending product before approval')
  pass('Marketplace query excludes pending_review product')

  // ── 6. Bulk approve validation (incomplete → review_required) ─────────────
  const incompleteCheck = validateSupplierProductReadyForApproval({
    public_name: null,
    min_quantity: 10,
    suggested_wholesale_price_mad: 120,
    supplier_unit_price_usd: null,
    stock_quantity: 100,
    lead_time_days: 7,
    platform_margin_type: null,
    platform_margin_value: null,
    moq_tier_count: 0,
  })
  if (incompleteCheck.ok) fail('Bulk validation should reject incomplete product')
  await admin
    .from('supplier_products')
    .update({
      moderation_flag: 'review_required',
      moderation_reason: incompleteCheck.reason,
    })
    .eq('id', productId)
  const { data: afterSkip } = await admin
    .from('supplier_products')
    .select('approval_status, moderation_flag, moderation_reason')
    .eq('id', productId)
    .single()
  if (afterSkip?.approval_status !== 'pending_review') {
    fail('Incomplete bulk approve must not set approved')
  }
  if (afterSkip?.moderation_flag !== 'review_required') {
    fail('Incomplete bulk approve must set review_required')
  }
  pass('Bulk approve validation blocks incomplete catalog')

  // ── 7. Admin approve (complete) → marketplace visible ─────────────────────
  const completeCheck = validateSupplierProductReadyForApproval({
    public_name: `${tag} Public`,
    min_quantity: 10,
    suggested_wholesale_price_mad: 120,
    supplier_unit_price_usd: null,
    stock_quantity: 100,
    lead_time_days: 7,
    platform_margin_type: 'percentage',
    platform_margin_value: 20,
    moq_tier_count: 0,
  })
  if (!completeCheck.ok) fail(`Complete product failed validation: ${completeCheck.reason}`)

  const { error: approveErr } = await admin
    .from('supplier_products')
    .update({
      public_name: `${tag} Public`,
      platform_margin_type: 'percentage',
      platform_margin_value: 20,
      approval_status: 'approved',
      moderation_flag: 'approved',
      approved_at: new Date().toISOString(),
      rejected_at: null,
    })
    .eq('id', productId)
  if (approveErr) fail(`Admin approve update: ${approveErr.message}`)
  pass('Admin approve → approved')

  const { data: approvedMarket, error: approvedMarketErr } = await admin
    .from('supplier_products')
    .select(MARKETPLACE_SELECT)
    .eq('id', productId)
    .eq('approval_status', 'approved')
    .is('archived_at', null)
    .single()
  if (approvedMarketErr || !approvedMarket) {
    fail('Marketplace query did not return product after approval')
  }
  pass('Marketplace query includes product after approval')

  // ── 8. Cleanup ────────────────────────────────────────────────────────────
  await admin.from('supplier_products').delete().eq('id', productId)
  pass('E2E test product deleted')

  console.log('\nE2E RESULT: PASS')
}

main().catch((e: unknown) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
