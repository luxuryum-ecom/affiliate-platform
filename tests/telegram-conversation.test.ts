// ─── BRIQUE 3 — Machine à états conversationnelle (module PUR) ────────────────
// decideAwaiting / isNegativeReply / interpretPriceReply / interpretTiersReply /
// shouldReask / isReminderDue. Aucune DB, aucun réseau.

import { describe, it, expect } from 'vitest'
import {
  decideAwaiting,
  isNegativeReply,
  interpretPriceReply,
  interpretTiersReply,
  shouldReask,
  isReminderDue,
  REMINDER_AFTER_MS,
  MAX_REASK,
} from '@/lib/telegram/conversation'

describe('decideAwaiting — ce qui manque à demander', () => {
  it('prix absent → demander le prix', () => {
    expect(decideAwaiting({ price_source: null, moq_tiers: [] })).toBe('price')
    expect(decideAwaiting({ price_source: null, moq_tiers: [{ min_quantity: 50, unit_price: 18 }] })).toBe('price')
  })
  it('prix présent sans palier → demander les paliers', () => {
    expect(decideAwaiting({ price_source: 250, moq_tiers: [] })).toBe('tiers')
  })
  it('prix + paliers → complet (null)', () => {
    expect(decideAwaiting({ price_source: 250, moq_tiers: [{ min_quantity: 50, unit_price: 220 }] })).toBeNull()
  })
})

describe('isNegativeReply — « non » dans 4 langues', () => {
  it('positifs (négations)', () => {
    for (const s of ['non', 'Non merci', 'no', 'nope', 'nothing', 'لا', 'لا شكرا', 'والو', 'ماكاين', 'makayn', 'la choukran', 'aucun']) {
      expect(isNegativeReply(s), s).toBe(true)
    }
  })
  it('négatifs (ce ne sont PAS des refus)', () => {
    for (const s of ['250 dh', '50 = 220', 'oui', 'ceinture', 'نعم', '', null, undefined]) {
      expect(isNegativeReply(s), String(s)).toBe(false)
    }
  })
})

describe('interpretPriceReply', () => {
  it('prix seul', () => {
    expect(interpretPriceReply({ price_source: 250, moq_tiers: [] })).toEqual({ kind: 'got_price', price: 250, tiers: [] })
  })
  it('prix + paliers', () => {
    const tiers = [{ min_quantity: 50, unit_price: 220 }]
    expect(interpretPriceReply({ price_source: 250, moq_tiers: tiers })).toEqual({ kind: 'got_price', price: 250, tiers })
  })
  it('pas de prix mais 1er palier porte le prix → got_price', () => {
    const tiers = [{ min_quantity: 50, unit_price: 220 }]
    expect(interpretPriceReply({ price_source: null, moq_tiers: tiers })).toEqual({ kind: 'got_price', price: 220, tiers })
  })
  it('rien d\'exploitable → unusable', () => {
    expect(interpretPriceReply({ price_source: null, moq_tiers: [] })).toEqual({ kind: 'unusable' })
  })
})

describe('interpretTiersReply', () => {
  it('« non » → declined', () => {
    expect(interpretTiersReply('non', { moq_tiers: [] })).toEqual({ kind: 'declined' })
  })
  it('paliers fournis → got_tiers', () => {
    const tiers = [{ min_quantity: 50, unit_price: 220 }]
    expect(interpretTiersReply('50=220', { moq_tiers: tiers })).toEqual({ kind: 'got_tiers', tiers })
  })
  it('réponse floue sans « non » ni paliers → unusable', () => {
    expect(interpretTiersReply('euh je sais pas', { moq_tiers: [] })).toEqual({ kind: 'unusable' })
  })
})

describe('shouldReask — 1 seule redemande', () => {
  it('reask 0 → true, reask >= MAX → false', () => {
    expect(shouldReask(0)).toBe(true)
    expect(shouldReask(MAX_REASK)).toBe(false)
    expect(shouldReask(MAX_REASK + 1)).toBe(false)
  })
})

describe('isReminderDue — relance one-shot après ~1h', () => {
  const base = 1_000_000_000_000 // ms fixe (pas de Date.now dans le test)
  it('question > 1h et jamais relancée → due', () => {
    const asked = new Date(base - REMINDER_AFTER_MS - 1000).toISOString()
    expect(isReminderDue({ asked_at: asked, reminded_at: null }, base)).toBe(true)
  })
  it('question récente (< 1h) → pas due', () => {
    const asked = new Date(base - 1000).toISOString()
    expect(isReminderDue({ asked_at: asked, reminded_at: null }, base)).toBe(false)
  })
  it('déjà relancée → jamais due (anti-spam)', () => {
    const asked = new Date(base - REMINDER_AFTER_MS - 1000).toISOString()
    expect(isReminderDue({ asked_at: asked, reminded_at: new Date(base).toISOString() }, base)).toBe(false)
  })
})
