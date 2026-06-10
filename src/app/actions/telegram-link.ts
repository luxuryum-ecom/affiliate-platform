'use server'

// ─── Liaison compte fournisseur ⇆ Telegram (côté web) ────────────────────────
// Le fournisseur génère un code à usage unique, puis l'envoie au bot via
// « /link <code> ». La confirmation (écriture de telegram_user_id) est faite par
// le worker bot en service_role — ici on ne fait que créer/voir le code.

import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'node:crypto'
import { LINK_CODE_TTL_MINUTES } from '@/lib/telegram/schema'

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
