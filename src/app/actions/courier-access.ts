'use server'

// ─── Durcissement accès livreur (module Livreurs, Lot B) ─────────────────────
//
// @security P2-3 : `couriers.access_code` en clair ~40 bits sans TTL/rate-limit
// = insuffisant pour un portail public `/courier` (mig 126). Cette action
// régénère le code : le SECRET n'est JAMAIS écrit en clair en base (mig 127 —
// seul `access_code_hash` est stocké, `encode(digest(code,'sha256'),'hex')`),
// avec un TTL de 30 jours. Le code en clair n'est retourné QU'UNE SEULE FOIS
// (au moment de la génération) — à afficher/copier immédiatement côté admin.
//
// Écriture via service_role (couriers n'a aucune policy UPDATE — deny total,
// mig 126), TOUJOURS APRÈS la garde `requireAdmin` (même patron que couriers.ts
// / telegram-link.ts::generateLinkCodeForSupplier).

import { randomBytes, createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from './_guards'
import { createAdminClient } from '@/lib/supabase/admin'

const ACCESS_CODE_TTL_DAYS = 30

// Base32 sans caractères ambigus (0/1/O/I) — calque couriers.ts::generateAccessCode,
// mais 16 caractères base32 (@security P2-3) : ~80 bits d'entropie EFFECTIVE en
// sortie (16 × log2(32)), tirés d'une source de 128 bits. 80 bits = infaisable à
// bruteforcer (couplé au rate-limit sur échecs), 16× l'ancien code de 8 caractères.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateStrongAccessCode(): string {
  const bytes = randomBytes(16) // source d'entropie (128 bits) → 16 caractères (~80 bits en sortie)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

function sha256Hex(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

const RegenerateSchema = z.object({
  courierId: z.string().uuid({ message: 'Livreur invalide.' }),
})

export interface RegenerateCourierAccessCodeResult {
  error: string | null
  /** Code EN CLAIR — retourné une seule fois, à afficher/copier immédiatement. */
  code: string | null
  expiresAt: string | null
}

/**
 * Régénère le code d'accès portail livreur (mig 127). Stocke UNIQUEMENT le hash
 * SHA-256 + une expiration à 30 jours ; vide l'ancienne colonne `access_code` en
 * clair (rétrocompat mig 126, ne supprime PAS la colonne). Retourne le code en
 * clair une seule fois — le caller (UI admin) doit l'afficher/copier immédiatement,
 * il n'est plus jamais récupérable ensuite (seul le hash est en base).
 */
export async function regenerateCourierAccessCode(
  courierId: string,
): Promise<RegenerateCourierAccessCodeResult> {
  const parsed = RegenerateSchema.safeParse({ courierId })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.', code: null, expiresAt: null }
  }

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', code: null, expiresAt: null }

  const admin = createAdminClient()

  const { data: existing, error: existingErr } = await admin
    .from('couriers')
    .select('id')
    .eq('id', parsed.data.courierId)
    .maybeSingle()
  if (existingErr) return { error: existingErr.message, code: null, expiresAt: null }
  if (!existing) return { error: 'Livreur introuvable.', code: null, expiresAt: null }

  const expiresAt = new Date(Date.now() + ACCESS_CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Retry borné en cas de collision UNIQUE sur access_code_hash (probabilité
  // négligeable, ~128 bits — filet de sécurité uniquement, calque createCourier).
  let lastErr: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateStrongAccessCode()
    const hash = sha256Hex(code)

    const { error: updateErr } = await admin
      .from('couriers')
      .update({
        access_code_hash: hash,
        access_code_expires_at: expiresAt,
        access_code: null, // vide le clair (rétrocompat mig 126) — plus jamais stocké en clair
      })
      .eq('id', parsed.data.courierId)

    if (!updateErr) {
      revalidatePath('/admin/couriers')
      return { error: null, code, expiresAt }
    }
    lastErr = updateErr.message
  }

  return { error: lastErr ?? 'Erreur lors de la régénération du code.', code: null, expiresAt: null }
}
