/**
 * Phase 1 read-boundary verification (no browser).
 * Run: npx --yes tsx scripts/verify-intermediary-read-boundary.ts
 */
import { readFileSync } from 'fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPPLIER_FORBIDDEN_QUOTE_COLUMNS = [
  'buyer_id',
  'whatsapp_number',
  'buyer_notes',
  'buyer_purchase_profile',
  'buyer_volume_tier',
] as const

const WHOLESALER_FORBIDDEN_PRODUCT_COLUMNS = [
  'supplier_id',
  'supplier_private_notes',
  'admin_notes',
  'platform_margin_type',
  'platform_margin_value',
  'moderation_flag',
  'ai_risk_score',
  'moderation_reason',
  'moderation_signals',
  'approved_by',
] as const

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

async function assertEmptySelect(
  client: SupabaseClient,
  table: string,
  columns: string,
  label: string,
): Promise<void> {
  const { data, error } = await client.from(table).select(columns).limit(5)
  if (error) {
    pass(`${label}: base table blocked (${error.message})`)
    return
  }
  if (data && data.length > 0) {
    fail(`${label}: base table returned ${data.length} row(s) — RLS leak`)
  }
  pass(`${label}: base table returns no rows`)
}

async function assertViewColumnsAbsent(
  client: SupabaseClient,
  view: string,
  forbidden: readonly string[],
  label: string,
): Promise<void> {
  const { error } = await client.from(view).select(forbidden.join(',')).limit(1)
  if (!error) {
    fail(`${label}: forbidden columns selectable on ${view}`)
  }
  pass(`${label}: forbidden columns not exposed on ${view}`)
}

async function assertViewReadable(client: SupabaseClient, view: string, label: string): Promise<void> {
  const { error } = await client.from(view).select('*').limit(1)
  if (error) fail(`${label}: cannot read ${view} — ${error.message}`)
  pass(`${label}: ${view} readable`)
}

async function main(): Promise<void> {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supplierEmail = process.env.E2E_SUPPLIER_EMAIL
  const supplierPassword = process.env.E2E_SUPPLIER_PASSWORD
  const wholesalerEmail = process.env.E2E_WHOLESALER_EMAIL
  const wholesalerPassword = process.env.E2E_WHOLESALER_PASSWORD

  if (!url || !serviceKey || !anonKey) {
    fail('.env.local missing Supabase URL, anon key, or service role key')
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: supplierViewErr } = await admin
    .from('supplier_quote_requests_supplier_read')
    .select('id')
    .limit(1)
  if (supplierViewErr) fail(`View missing: supplier_quote_requests_supplier_read — ${supplierViewErr.message}`)
  pass('View supplier_quote_requests_supplier_read exists')

  const { error: wholesalerViewErr } = await admin
    .from('supplier_products_wholesaler_read')
    .select('id, is_featured, is_verified')
    .limit(1)
  if (wholesalerViewErr) fail(`View missing: supplier_products_wholesaler_read — ${wholesalerViewErr.message}`)
  pass('View supplier_products_wholesaler_read exists')

  if (!supplierEmail || !supplierPassword) {
    pass('SKIP supplier JWT checks (set E2E_SUPPLIER_EMAIL/PASSWORD in .env.local)')
  } else {
    const supplierClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: signInErr } = await supplierClient.auth.signInWithPassword({
      email: supplierEmail,
      password: supplierPassword,
    })
    if (signInErr) fail(`Supplier sign-in failed: ${signInErr.message}`)

    await assertEmptySelect(
      supplierClient,
      'supplier_quote_requests',
      'buyer_id, whatsapp_number',
      'Supplier JWT',
    )
    await assertViewReadable(
      supplierClient,
      'supplier_quote_requests_supplier_read',
      'Supplier JWT',
    )
    await assertViewColumnsAbsent(
      supplierClient,
      'supplier_quote_requests_supplier_read',
      SUPPLIER_FORBIDDEN_QUOTE_COLUMNS,
      'Supplier JWT',
    )
  }

  if (!wholesalerEmail || !wholesalerPassword) {
    pass('SKIP wholesaler JWT checks (set E2E_WHOLESALER_EMAIL/PASSWORD in .env.local)')
  } else {
    const wholesalerClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: signInErr } = await wholesalerClient.auth.signInWithPassword({
      email: wholesalerEmail,
      password: wholesalerPassword,
    })
    if (signInErr) fail(`Wholesaler sign-in failed: ${signInErr.message}`)

    await assertEmptySelect(
      wholesalerClient,
      'supplier_products',
      'supplier_private_notes, supplier_id',
      'Wholesaler JWT',
    )
    await assertViewReadable(
      wholesalerClient,
      'supplier_products_wholesaler_read',
      'Wholesaler JWT',
    )
    await assertViewColumnsAbsent(
      wholesalerClient,
      'supplier_products_wholesaler_read',
      WHOLESALER_FORBIDDEN_PRODUCT_COLUMNS,
      'Wholesaler JWT',
    )
  }

  console.log('\nPASS: Phase 1 read-boundary verification complete')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
