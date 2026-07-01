'use server'

// ─── Liaison compte fournisseur ⇆ Telegram (côté web) ────────────────────────
// Le fournisseur génère un code à usage unique, puis l'envoie au bot via
// « /link <code> ». La confirmation (écriture de telegram_user_id) est faite par
// le worker bot en service_role — ici on ne fait que créer/voir le code.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'node:crypto'
import { LINK_CODE_TTL_MINUTES, ADMIN_LINK_CODE_TTL_MINUTES } from '@/lib/telegram/schema'
import { requireAdmin } from './_guards'

// Base32 sans caractères ambigus (0/1/O/I) — cohérent avec LINK_CODE_REGEX.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export type TelegramLinkState = {
  error: string | null
  linked?: boolean
  code?: string
  expiresInMinutes?: number
  botUsername?: string | null
  telegramUsername?: string | null
}

type LinkRow = {
  id: string
  telegram_user_id: number | null
  telegram_username: string | null
  link_code: string | null
  link_code_expires_at: string | null
}

export async function getTelegramLinkStatus(): Promise<TelegramLinkState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data } = await supabase
    .from('telegram_supplier_links')
    .select('id, telegram_user_id, telegram_username, link_code, link_code_expires_at')
    .eq('supplier_id', user.id)
    .maybeSingle()

  const row = data as LinkRow | null
  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? null

  if (row?.telegram_user_id) {
    return { error: null, linked: true, telegramUsername: row.telegram_username, botUsername }
  }

  const validCode =
    row?.link_code &&
    row.link_code_expires_at &&
    new Date(row.link_code_expires_at).getTime() > Date.now()
      ? row.link_code
      : undefined

  return { error: null, linked: false, code: validCode, botUsername }
}

export async function generateTelegramLinkCode(
  _prevState: TelegramLinkState,
  _formData: FormData,
): Promise<TelegramLinkState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile as { role: string } | null)?.role !== 'supplier') {
    return { error: 'Réservé aux comptes fournisseur.' }
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? null

  const { data: existing } = await supabase
    .from('telegram_supplier_links')
    .select('id, telegram_user_id, link_code, link_code_expires_at')
    .eq('supplier_id', user.id)
    .maybeSingle()
  const row = existing as {
    id: string
    telegram_user_id: number | null
    link_code: string | null
    link_code_expires_at: string | null
  } | null

  if (row?.telegram_user_id) {
    return { error: null, linked: true, botUsername }
  }

  // Anti-churn : si un code valide existe déjà, le réutiliser au lieu d'en créer un.
  if (row?.link_code && row.link_code_expires_at) {
    const remainingMs = new Date(row.link_code_expires_at).getTime() - Date.now()
    if (remainingMs > 0) {
      return {
        error: null,
        linked: false,
        code: row.link_code,
        expiresInMinutes: Math.ceil(remainingMs / 60000),
        botUsername,
      }
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000).toISOString()

  if (row) {
    const { error } = await supabase
      .from('telegram_supplier_links')
      .update({ link_code: code, link_code_expires_at: expiresAt })
      .eq('id', row.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('telegram_supplier_links')
      .insert({ supplier_id: user.id, link_code: code, link_code_expires_at: expiresAt })
    if (error) return { error: error.message }
  }

  return {
    error: null,
    linked: false,
    code,
    expiresInMinutes: LINK_CODE_TTL_MINUTES,
    botUsername,
  }
}

/**
 * LOT magic-link — l'ADMIN génère un code de liaison POUR un fournisseur, pour le
 * lui transmettre par lien cliquable / QR / WhatsApp (onboarding non-technique).
 *
 * SÉCURITÉ (audité @security) :
 *  - Garde `requireAdmin()` en amont : un non-admin est rejeté AVANT tout accès au
 *    client service_role (même patron que promoteToAgent). Le service_role ne sert
 *    qu'à écrire la ligne d'UN AUTRE fournisseur (la RLS scope l'écriture au propre
 *    compte, donc l'admin passe par service_role, mais uniquement APRÈS la garde).
 *  - Cible strictement contrôlée : refuse si le compte n'est pas `role='supplier'`.
 *  - TTL raccourci (ADMIN_LINK_CODE_TTL_MINUTES = 15) : le code est un bearer token
 *    transmis hors-app → fenêtre d'interception courte. Usage unique conservé (le
 *    bot efface le code à la liaison). Anti-churn : réutilise un code encore valide.
 *  - Réversibilité : aucune liaison ici (on ne fait qu'émettre un code) ; la liaison
 *    reste faite côté bot par le fournisseur et se délie via un simple NULL.
 *  - Traçabilité : log_admin_action best-effort (acteur = admin authentifié).
 *
 * Ne renvoie JAMAIS le telegram_user_id d'autrui, ni aucune PII : uniquement le code
 * + le username du bot + la durée de validité.
 */
export async function generateLinkCodeForSupplier(supplierId: string): Promise<TelegramLinkState> {
  const targetId = supplierId?.trim()
  if (!targetId) return { error: 'Fournisseur non spécifié.' }

  // GARDE admin-only — rejet AVANT tout usage du client service_role.
  const { supabase, error: guardErr } = await requireAdmin()
  if (guardErr) return { error: guardErr }

  const admin = createAdminClient()

  // La cible DOIT être un fournisseur (pas d'émission de code pour un autre rôle).
  const { data: target } = (await admin
    .from('profiles')
    .select('role')
    .eq('id', targetId)
    .maybeSingle()) as { data: { role: string } | null }
  if (target?.role !== 'supplier') return { error: 'Compte cible introuvable ou non fournisseur.' }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? null

  const { data: existing } = (await admin
    .from('telegram_supplier_links')
    .select('id, telegram_user_id, link_code, link_code_expires_at')
    .eq('supplier_id', targetId)
    .maybeSingle()) as { data: Omit<LinkRow, 'telegram_username'> | null }
  const row = existing

  // Déjà lié → rien à générer (on ne divulgue pas l'id Telegram lié).
  if (row?.telegram_user_id) return { error: null, linked: true, botUsername }

  // Anti-churn : réutiliser un code encore valide — MAIS seulement si sa durée
  // restante ne DÉPASSE PAS le TTL admin court (15 min). Sinon (ex. code self-serve
  // à 30 min encore valide) on régénère un code à fenêtre courte, pour que la
  // garantie « lien admin = 15 min » reste vraie (finding @security).
  if (row?.link_code && row.link_code_expires_at) {
    const remainingMs = new Date(row.link_code_expires_at).getTime() - Date.now()
    if (remainingMs > 0 && remainingMs <= ADMIN_LINK_CODE_TTL_MINUTES * 60 * 1000) {
      return {
        error: null,
        linked: false,
        code: row.link_code,
        expiresInMinutes: Math.ceil(remainingMs / 60000),
        botUsername,
      }
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + ADMIN_LINK_CODE_TTL_MINUTES * 60 * 1000).toISOString()

  if (row) {
    const { error } = await admin
      .from('telegram_supplier_links')
      .update({ link_code: code, link_code_expires_at: expiresAt })
      .eq('id', row.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('telegram_supplier_links')
      .insert({ supplier_id: targetId, link_code: code, link_code_expires_at: expiresAt })
    if (error) return { error: error.message }
  }

  // Traçabilité (best-effort) — capture l'admin auteur via le client RLS (auth.uid()).
  try {
    await supabase.rpc('log_admin_action', {
      p_action: 'generate_supplier_telegram_link',
      p_target_table: 'telegram_supplier_links',
      p_target_id: targetId,
      p_old: {},
      p_new: { ttl_minutes: ADMIN_LINK_CODE_TTL_MINUTES },
    })
  } catch {
    // un échec de log ne doit pas casser la génération
  }

  return {
    error: null,
    linked: false,
    code,
    expiresInMinutes: ADMIN_LINK_CODE_TTL_MINUTES,
    botUsername,
  }
}
