// ─── LOT 5 — Routage accueil Telegram (handleTelegramUpdate) ────────────────
// Isole le ROUTAGE de src/lib/telegram/ingest.ts::handleTelegramUpdate via mocks
// de './client' (telegramSendMessage capturé, AUCUN appel réseau réel) et de
// '@/lib/supabase/admin' (createAdminClient → stub en mémoire, AUCUNE DB réelle).
// welcome.ts N'EST PAS mocké : on compare le texte envoyé au texte réel produit
// par buildSupplierWelcome, pour prouver que le handler appelle bien la bonne
// fonction avec les bons paramètres — pas juste qu'un texte quelconque part.
//
// Prouve :
//  - /start (language_code=ar-MA) → accueil darija envoyé
//  - /start (language_code=ar-AE) → accueil MSA envoyé (≠ darija)
//  - /start (language_code=fr)    → accueil FR envoyé (1 seul message)
//  - /start (language_code=en/tr) → accueil EN envoyé (fallback)
//  - /start <CODE>                → PAS l'accueil (route vers linking)
//  - /link <CODE>                 → PAS l'accueil (route vers linking)
//  - photo                        → PAS l'accueil (route vers ingestion)
//
// RÈGLES D'OR : aucun secret en dur (NEXT_PUBLIC_WHATSAPP_PHONE est une config
// PUBLIQUE, pas un secret — même valeur par défaut que le code applicatif).
// Aucune écriture réelle : le stub admin ne touche jamais 127.0.0.1 ni la prod.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/telegram/client', () => ({
  telegramSendMessage: vi.fn(async () => {}),
  telegramDownloadPhoto: vi.fn(async () => {
    throw new Error('telegramDownloadPhoto ne doit PAS être appelé dans ces scénarios de routage')
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { telegramSendMessage } from '@/lib/telegram/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleTelegramUpdate } from '@/lib/telegram/ingest'
import { buildSupplierWelcome } from '@/lib/telegram/welcome'
import type { TelegramMessage, TelegramUpdate } from '@/lib/telegram/schema'

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

// ── Stub admin Supabase générique (AUCUNE DB réelle) ─────────────────────────
// Chaque .from(table)... résout en { data: null, error: null } quel que soit le
// chaînage. Suffisant pour isoler le ROUTAGE : les branches atteintes avec un
// admin "vide" sont toujours celles où supplierId/link est introuvable → guidage
// (pas l'accueil), ce qui est justement ce qu'on veut prouver ne PAS être l'accueil.
// La logique métier interne de handleLinkCommand / ingestProductMessage est déjà
// couverte par tests/lot3-telegram-moq-pipeline.integration.test.ts (LOCAL réel).
function makeAdminStub() {
  const terminal = () => Promise.resolve({ data: null, error: null, count: 0 })
  function chain(): Record<string, unknown> {
    const qb: Record<string, unknown> = {}
    const passthrough = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'is', 'ilike', 'like', 'gte', 'lte', 'gt', 'lt', 'in', 'order', 'limit', 'range',
    ]
    for (const m of passthrough) qb[m] = () => qb
    qb.single = terminal
    qb.maybeSingle = terminal
    qb.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => terminal().then(onF, onR)
    return qb
  }
  return {
    from: () => chain(),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/x' } }),
      }),
    },
  }
}

function baseMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 1,
    chat: { id: 999 },
    from: { id: 42, is_bot: false, language_code: 'fr' },
    ...overrides,
  } as TelegramMessage
}

function makeUpdate(message: TelegramMessage): TelegramUpdate {
  return { update_id: 1, message } as TelegramUpdate
}

// Config PUBLIQUE (NEXT_PUBLIC_*) — pas un secret. Même valeur par défaut que
// le code applicatif (src/lib/telegram/ingest.ts) si la variable est absente.
const WHATSAPP_PHONE = '212600000000'

beforeEach(() => {
  vi.clearAllMocks()
  mocked(createAdminClient).mockReturnValue(makeAdminStub())
  process.env.NEXT_PUBLIC_WHATSAPP_PHONE = WHATSAPP_PHONE
})

describe('LOT 5 — handleTelegramUpdate : routage accueil fournisseur (4 langues)', () => {
  it("/start (language_code='ar-MA') → envoie l'accueil darija", async () => {
    const msg = baseMessage({ text: '/start', from: { id: 41, is_bot: false, language_code: 'ar-MA' } })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [chatId, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(chatId).toBe(999)
    // Égalité stricte avec le texte réel produit par buildSupplierWelcome : prouve
    // que le handler appelle bien cette fonction avec (language_code, whatsappPhone).
    expect(text).toBe(buildSupplierWelcome('ar-MA', WHATSAPP_PHONE))
    expect(text).toMatch(/[؀-ۿ]/) // contient de l'arabe
    // Chiffres des paliers en latin (l'unité elle-même est traduite en arabe : "حبة").
    expect(text).toMatch(/50\s*\S*\s*=\s*18/)
    expect(text).toMatch(/200\s*\S*\s*=\s*16/)
    expect(text).toMatch(/500\s*\S*\s*=\s*14/)
    expect(text).toContain(`https://wa.me/${WHATSAPP_PHONE}`)
  })

  it("/start (language_code='ar-AE') → envoie l'accueil MSA (≠ darija)", async () => {
    const msg = baseMessage({ text: '/start', from: { id: 42, is_bot: false, language_code: 'ar-AE' } })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(text).toBe(buildSupplierWelcome('ar-AE', WHATSAPP_PHONE))
    expect(text).toMatch(/[؀-ۿ]/) // contient de l'arabe
    expect(text).not.toBe(buildSupplierWelcome('ar-MA', WHATSAPP_PHONE)) // ≠ darija
  })

  it("/start (language_code='fr') → envoie l'accueil FR (exemple de paliers + wa.me), rien d'autre", async () => {
    const msg = baseMessage({ text: '/start', from: { id: 43, is_bot: false, language_code: 'fr' } })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [chatId, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(chatId).toBe(999)
    expect(text).toBe(buildSupplierWelcome('fr', WHATSAPP_PHONE))
    expect(text).toContain('50 pcs = 18')
    expect(text).toContain('200 pcs = 16')
    expect(text).toContain('500 pcs = 14')
    expect(text).toContain(`https://wa.me/${WHATSAPP_PHONE}`)
  })

  it("/start (language_code='en') → envoie l'accueil EN", async () => {
    const msg = baseMessage({ text: '/start', from: { id: 44, is_bot: false, language_code: 'en' } })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(text).toBe(buildSupplierWelcome('en', WHATSAPP_PHONE))
    expect(text.toLowerCase()).toMatch(/currency/)
  })

  it("/start (language_code='tr', langue non gérée) → envoie l'accueil EN (fallback)", async () => {
    const msg = baseMessage({ text: '/start', from: { id: 45, is_bot: false, language_code: 'tr' } })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(text).toBe(buildSupplierWelcome('en', WHATSAPP_PHONE))
  })

  it('/start A7K2P9QX (avec code) → PAS l\'accueil (route vers linking)', async () => {
    const msg = baseMessage({ text: '/start A7K2P9QX' })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    // Le message envoyé par la branche linking ne doit JAMAIS être l'accueil.
    expect(text).not.toBe(buildSupplierWelcome('fr', WHATSAPP_PHONE))
    expect(text).not.toContain('50 pcs = 18')
    expect(text).not.toContain('wa.me')
  })

  it('/link A7K2P9QX (avec code) → PAS l\'accueil non plus (même routage que /start)', async () => {
    const msg = baseMessage({ text: '/link A7K2P9QX' })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(text).not.toBe(buildSupplierWelcome('fr', WHATSAPP_PHONE))
    expect(text).not.toContain('50 pcs = 18')
  })

  it('photo (sans commande) → route vers ingestion, PAS l\'accueil', async () => {
    const msg = baseMessage({
      photo: [{ file_id: 'f1', file_size: 100 }],
      caption: 'Test produit',
    })
    await handleTelegramUpdate(makeUpdate(msg))

    // Compte non lié dans le stub (aucune donnée) → message de guidage "ingestion",
    // PAS l'accueil. telegramDownloadPhoto (mock qui throw) n'est PAS appelé : si la
    // route avait continué jusqu'au téléchargement, ce test échouerait bruyamment.
    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(text).not.toBe(buildSupplierWelcome('fr', WHATSAPP_PHONE))
    expect(text).not.toContain('50 pcs = 18')
  })

  it('texte simple sans commande (pas /start, pas photo) → guidage générique, pas l\'accueil', async () => {
    const msg = baseMessage({ text: 'bonjour' })
    await handleTelegramUpdate(makeUpdate(msg))

    expect(telegramSendMessage).toHaveBeenCalledTimes(1)
    const [, text] = mocked(telegramSendMessage).mock.calls[0] as [number, string]
    expect(text).not.toBe(buildSupplierWelcome('fr', WHATSAPP_PHONE))
    expect(text).not.toContain('50 pcs = 18')
  })
})
