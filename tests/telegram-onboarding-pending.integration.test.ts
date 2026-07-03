/**
 * LOT « Activer sur Telegram » (/pending) — Preuves RUNTIME onboarding fournisseur 1-clic
 *
 * Couvre :
 *  1. Fournisseur NON lié → ensureSupplierTelegramCode() renvoie linked falsy + code
 *     valide (format 8 car. [A-HJ-NP-Z2-9]) + botUsername ; le deep-link t.me/<bot>?start=<code>
 *     contient bien ce code.
 *  2. Anti-churn : 2e appel rapproché → réutilise le MÊME code (pas de régénération).
 *  3. Liaison via le handler bot RÉEL (handleTelegramUpdate, /start <code>) → la ligne
 *     telegram_supplier_links passe telegram_user_id renseigné, link_code remis à NULL.
 *  4. Fournisseur déjà lié → ensureSupplierTelegramCode() renvoie linked:true, pas de
 *     nouveau code (le deep-link ne doit pas s'afficher côté page).
 *  5. Gate rôle : un profil role='wholesaler' → erreur "Réservé aux comptes fournisseur."
 *  6. i18n : les 4 clés auth.pending.telegram* existent et sont non vides en fr/en/ar.
 *
 * APPROCHE PRAGMATIQUE (auth.getUser()) :
 * `ensureSupplierTelegramCode` (src/app/actions/telegram-link.ts) lit l'utilisateur via
 * `@/lib/supabase/server`'s createClient(), qui dépend de next/headers cookies() — non
 * disponible hors requête HTTP réelle. On mocke UNIQUEMENT ce module pour lui substituer
 * un vrai client Supabase authentifié par mot de passe (signInWithPassword, anon key) :
 * auth.getUser() renvoie alors le VRAI utilisateur, et les requêtes .from(...) passent par
 * la VRAIE RLS locale (policies "tsl: supplier own/insert own/update unlinked"). C'est donc
 * un test d'intégration bout en bout de la fonction réelle (garde de rôle + anti-churn +
 * écriture), PAS un test de la seule logique DB. Le handler /start (ingest.ts) n'est lui
 * pas mocké : appelé tel quel, avec createAdminClient() pointé sur le Supabase LOCAL via
 * les env vars injectées en beforeAll (même pattern que lot3/lot4). TELEGRAM_BOT_TOKEN est
 * volontairement laissé UNDÉFINI : telegramSendMessage() avale l'erreur (best-effort), donc
 * zéro appel réseau sortant pendant le test (déterminisme + pas de dépendance réseau).
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier (mot de passe de test = valeur arbitraire,
 *    TELEGRAM_BOT_USERNAME = valeur de test non sensible, pas un token/clé)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { isValidLinkCodeFormat, LINK_CODE_REGEX, type TelegramUpdate } from '@/lib/telegram/schema'
import frMessages from '../messages/fr.json'
import enMessages from '../messages/en.json'
import arMessages from '../messages/ar.json'

// ── Constantes ────────────────────────────────────────────────────────────────
const TEST_PASSWORD = 'TestTelegramOnboard2026!X'
const TEST_BOT_USERNAME = 'test_onboarding_bot' // valeur de test, pas un secret
const testTag = `tg-onboard-${Date.now()}`

// ── État partagé (peuplé en beforeAll) ───────────────────────────────────────
let LOCAL_URL: string
let LOCAL_ANON_KEY: string
let sb: SupabaseClient // service_role — seed + assertions

let supplierId: string
let supplierEmail: string
let wholesalerId: string
let wholesalerEmail: string

// ── Mock ciblé : substitue le createClient() cookies-based par un vrai client
// authentifié (anon key + mot de passe). Voir note en tête de fichier.
let activeClient: SupabaseClient | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    if (!activeClient) throw new Error('[mock createClient] activeClient non défini pour ce test')
    return activeClient
  },
}))

// Import APRÈS le vi.mock (vitest hoiste vi.mock avant les imports, donc l'ordre
// syntaxique ci-dessous est sans risque : le mock est déjà enregistré).
import { ensureSupplierTelegramCode } from '@/app/actions/telegram-link'
import { handleTelegramUpdate } from '@/lib/telegram/ingest'

// ── Helpers ───────────────────────────────────────────────────────────────────
async function mkUser(suffix: string, role: 'supplier' | 'wholesaler', name: string): Promise<{ id: string; email: string }> {
  const email = `${suffix}-${testTag}@test.local`
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: name },
  })
  if (error || !data.user) throw new Error(`mkUser(${suffix}): ${error?.message ?? 'user null'}`)
  // Forcer role + status (le trigger crée le profil mais peut le laisser 'pending').
  await sb.from('profiles').update({ role, status: 'approved', full_name: name }).eq('id', data.user.id)
  return { id: data.user.id, email }
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`signInWithPassword(${email}): ${error.message}`)
  return client
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Onboarding fournisseur 1-clic — bouton "Activer sur Telegram" (/pending)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'telegram-onboarding-pending-setup')
    console.log(`[guard] URL locale confirmée : ${env.url}`)

    LOCAL_URL = env.url
    LOCAL_ANON_KEY = env.anonKey
    // Injecté pour createAdminClient() (lu à l'appel, dans ingest.ts / telegram-link.ts).
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey
    process.env.TELEGRAM_BOT_USERNAME = TEST_BOT_USERNAME
    // Volontairement PAS de TELEGRAM_BOT_TOKEN : telegramSendMessage() avale
    // l'échec (best-effort) → zéro appel réseau sortant pendant ce test.
    delete process.env.TELEGRAM_BOT_TOKEN

    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const supplier = await mkUser('supplier', 'supplier', `Supplier ${testTag}`)
    supplierId = supplier.id
    supplierEmail = supplier.email

    const wholesaler = await mkUser('wholesaler', 'wholesaler', `Wholesaler ${testTag}`)
    wholesalerId = wholesaler.id
    wholesalerEmail = wholesaler.email

    console.log(`[setup] supplier=${supplierId} wholesaler=${wholesalerId}`)
  }, 60_000)

  afterAll(async () => {
    if (!sb) return
    await sb.from('telegram_supplier_links').delete().eq('supplier_id', supplierId)
    if (supplierId) await sb.auth.admin.deleteUser(supplierId)
    if (wholesalerId) await sb.auth.admin.deleteUser(wholesalerId)
    console.log('[cleanup] users + liaison telegram supprimés')
  }, 30_000)

  // ───────────────────────────────────────────────────────────────────────────
  let firstCode: string

  it('(1) fournisseur NON lié → code valide + botUsername ; le deep-link contient ce code', async () => {
    activeClient = await signedInClient(supplierEmail)

    const state = await ensureSupplierTelegramCode()
    expect(state.error, `pas d'erreur attendue: ${state.error}`).toBeNull()
    expect(state.linked, 'pas encore lié').toBeFalsy()
    expect(state.code, 'un code doit être émis').toBeTruthy()
    expect(LINK_CODE_REGEX.test(state.code!)).toBe(true)
    expect(isValidLinkCodeFormat(state.code!)).toBe(true)
    expect(state.botUsername).toBe(TEST_BOT_USERNAME)
    expect(state.expiresInMinutes).toBeGreaterThan(0)

    const deepLink = `https://t.me/${state.botUsername}?start=${state.code}`
    expect(deepLink).toContain(`start=${state.code}`)
    expect(deepLink.startsWith(`https://t.me/${TEST_BOT_USERNAME}?start=`)).toBe(true)

    firstCode = state.code!
    console.log(`[1] ✓ code émis: ${firstCode} — deep-link: ${deepLink}`)
  })

  it('(2) anti-churn : 2e appel rapproché → réutilise le MÊME code', async () => {
    activeClient = await signedInClient(supplierEmail)

    const state2 = await ensureSupplierTelegramCode()
    expect(state2.error).toBeNull()
    expect(state2.linked).toBeFalsy()
    expect(state2.code, 'même code réutilisé, pas de régénération').toBe(firstCode)
    console.log(`[2] ✓ anti-churn confirmé: ${state2.code} === ${firstCode}`)
  })

  it('(3) liaison via le handler bot RÉEL : /start <code> → telegram_user_id renseigné, link_code=NULL', async () => {
    const telegramUserId = 900_000_000 + (Date.now() % 90_000_000)

    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: telegramUserId, is_bot: false, username: 'testsupplier' },
        chat: { id: telegramUserId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: `/start ${firstCode}`,
      },
    }

    await handleTelegramUpdate(update)

    const { data, error } = await sb
      .from('telegram_supplier_links')
      .select('telegram_user_id, telegram_username, link_code, link_code_expires_at, linked_at')
      .eq('supplier_id', supplierId)
      .maybeSingle()
    if (error) throw new Error(`lecture telegram_supplier_links: ${error.message}`)
    const row = data as {
      telegram_user_id: number | null
      telegram_username: string | null
      link_code: string | null
      link_code_expires_at: string | null
      linked_at: string | null
    } | null

    expect(row, 'ligne de liaison doit exister').not.toBeNull()
    expect(row!.telegram_user_id, 'telegram_user_id renseigné après /start').toBe(telegramUserId)
    expect(row!.telegram_username).toBe('testsupplier')
    expect(row!.link_code, 'code consommé (usage unique) → NULL').toBeNull()
    expect(row!.link_code_expires_at).toBeNull()
    expect(row!.linked_at).not.toBeNull()
    console.log(`[3] ✓ liaison confirmée via handleTelegramUpdate (/start ${firstCode}) → telegram_user_id=${telegramUserId}`)
  })

  it('(4) fournisseur DÉJÀ lié → linked:true, aucun nouveau code (le bouton ne doit pas s\'afficher côté page)', async () => {
    activeClient = await signedInClient(supplierEmail)

    const state = await ensureSupplierTelegramCode()
    expect(state.error).toBeNull()
    expect(state.linked).toBe(true)
    expect(state.code, 'aucun code émis une fois lié').toBeUndefined()
    console.log('[4] ✓ déjà lié: linked=true, pas de code')
  })

  it('(5) gate rôle : role=wholesaler → erreur "Réservé aux comptes fournisseur."', async () => {
    activeClient = await signedInClient(wholesalerEmail)

    const state = await ensureSupplierTelegramCode()
    expect(state.error).toBe('Réservé aux comptes fournisseur.')
    expect(state.linked).toBeUndefined()
    expect(state.code).toBeUndefined()

    // Confirme qu'aucune ligne de liaison n'a été créée pour ce compte (garde
    // appliquée AVANT toute écriture).
    const { data } = await sb
      .from('telegram_supplier_links')
      .select('id')
      .eq('supplier_id', wholesalerId)
      .maybeSingle()
    expect(data, 'aucune ligne telegram_supplier_links pour un non-fournisseur').toBeNull()
    console.log('[5] ✓ gate rôle respectée, aucune écriture')
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(6) i18n : les 4 clés auth.pending.telegram* existent et sont non vides en fr/en/ar', () => {
    const KEYS = ['telegramTitle', 'telegramHelp', 'telegramActivate', 'telegramConnected'] as const
    const locales: Record<string, unknown> = { fr: frMessages, en: enMessages, ar: arMessages }

    for (const [locale, messages] of Object.entries(locales)) {
      const pending = (messages as { auth?: { pending?: Record<string, unknown> } }).auth?.pending
      expect(pending, `${locale}: auth.pending doit exister`).toBeDefined()
      for (const key of KEYS) {
        const value = pending?.[key]
        expect(typeof value, `${locale}.auth.pending.${key} doit être une string`).toBe('string')
        expect((value as string).trim().length, `${locale}.auth.pending.${key} ne doit pas être vide`).toBeGreaterThan(0)
      }
    }
    console.log('[6] ✓ clés i18n présentes et non vides en fr/en/ar')
  })
})
