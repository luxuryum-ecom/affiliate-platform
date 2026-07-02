/**
 * LOT 4 — Éditeur MOQ + paliers dégressifs en modération admin
 *
 * Tests PURS (sans DB, sans 'use server') du module `src/lib/supplier/moq-editor.ts` :
 *  - parseMoqEditorForm : lecture du FormData de modération (drapeau caché, paliers
 *    dynamiques N, MOQ édité).
 *  - judgeEditedTiers : composition autour du seul juge d'échelle (`sanitizeMoqTiers`,
 *    déjà couvert par 33 tests dans moq-tiers-sanitizer.test.ts — on NE le re-teste
 *    PAS ici, on teste la COMPOSITION : effectiveMoq, tiersToInsert verbatim,
 *    1er palier == MOQ, flag @finance informatif, garde-fou perte silencieuse).
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) : aucun secret, aucune écriture DB (module pur).
 */

import { describe, it, expect } from 'vitest'
import { parseMoqEditorForm, judgeEditedTiers, MAX_MOQ_TIERS_FORM } from '@/lib/supplier/moq-editor'

// ── Fabrique un FormData de modération à partir d'un objet plat ──────────────
function buildForm(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('LOT 4 — parseMoqEditorForm', () => {
  it('éditeur absent (pas de moq_editor_present) → no-op : editorPresent=false, editedTiers=[], editedMoq=null', () => {
    // Un poster sans champ drapeau (autre appelant, test) ne doit JAMAIS déclencher
    // d'édition — c'est le garde-fou anti-wipe.
    const fd = buildForm({ min_quantity: '50', moq_tier_count: '2', tier_0_qty: '50', tier_0_price: '18.00' })
    const r = parseMoqEditorForm(fd)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.editorPresent).toBe(false)
    expect(r.value.editedTiers).toEqual([])
    expect(r.value.editedMoq).toBeNull()
  })

  it('N=6 paliers DYNAMIQUES > 4 → 6 paliers parsés SANS troncature (garde-fou anti ancienne boucle 1..4)', () => {
    const fields: Record<string, string> = {
      moq_editor_present: '1',
      min_quantity: '10',
      moq_tier_count: '6',
    }
    const expected: { min_quantity: number; unit_price_usd: string }[] = []
    for (let i = 0; i < 6; i++) {
      const qty = 10 * (i + 1)
      const price = (20 - i).toFixed(2)
      fields[`tier_${i}_qty`] = String(qty)
      fields[`tier_${i}_price`] = price
      expected.push({ min_quantity: qty, unit_price_usd: price })
    }
    const fd = buildForm(fields)
    const r = parseMoqEditorForm(fd)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.editorPresent).toBe(true)
    expect(r.value.editedTiers).toHaveLength(6)
    expect(r.value.editedTiers).toEqual(expected)
  })

  it('slot entièrement vide (qty ET prix vides) → ignoré, pas d\'erreur', () => {
    const fd = buildForm({
      moq_editor_present: '1',
      min_quantity: '10',
      moq_tier_count: '3',
      tier_0_qty: '10',
      tier_0_price: '20.00',
      tier_1_qty: '', // slot 1 entièrement vide
      tier_1_price: '',
      tier_2_qty: '50',
      tier_2_price: '15.00',
    })
    const r = parseMoqEditorForm(fd)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.editedTiers).toEqual([
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 50, unit_price_usd: '15.00' },
    ])
  })

  it('ligne partielle : qty sans prix → { ok:false, error: moqRowInvalid }', () => {
    const fd = buildForm({
      moq_editor_present: '1',
      min_quantity: '10',
      moq_tier_count: '1',
      tier_0_qty: '10',
      tier_0_price: '', // prix manquant, qty présent → saisie délibérée incomplète
    })
    const r = parseMoqEditorForm(fd)
    expect(r).toEqual({ ok: false, error: 'moqRowInvalid' })
  })

  it('ligne partielle : prix invalide (non décimal) → { ok:false, error: moqRowInvalid }', () => {
    const fd = buildForm({
      moq_editor_present: '1',
      min_quantity: '10',
      moq_tier_count: '1',
      tier_0_qty: '10',
      tier_0_price: 'abc',
    })
    const r = parseMoqEditorForm(fd)
    expect(r).toEqual({ ok: false, error: 'moqRowInvalid' })
  })

  it('ligne partielle : prix = 0 → { ok:false, error: moqRowInvalid }', () => {
    const fd = buildForm({
      moq_editor_present: '1',
      min_quantity: '10',
      moq_tier_count: '1',
      tier_0_qty: '10',
      tier_0_price: '0.00',
    })
    const r = parseMoqEditorForm(fd)
    expect(r).toEqual({ ok: false, error: 'moqRowInvalid' })
  })

  it('MOQ vide → editedMoq=null (inchangé)', () => {
    const fd = buildForm({
      moq_editor_present: '1',
      min_quantity: '',
      moq_tier_count: '0',
    })
    const r = parseMoqEditorForm(fd)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.editedMoq).toBeNull()
  })

  it('MOQ="0" → { ok:false, error: moqInvalid }', () => {
    const fd = buildForm({ moq_editor_present: '1', min_quantity: '0', moq_tier_count: '0' })
    const r = parseMoqEditorForm(fd)
    expect(r).toEqual({ ok: false, error: 'moqInvalid' })
  })

  it('MOQ non entier ("5.5") → { ok:false, error: moqInvalid }', () => {
    const fd = buildForm({ moq_editor_present: '1', min_quantity: '5.5', moq_tier_count: '0' })
    const r = parseMoqEditorForm(fd)
    expect(r).toEqual({ ok: false, error: 'moqInvalid' })
  })

  it('prix VERBATIM préservé : "18.50" reste "18.50" (zéro parseFloat/arrondi)', () => {
    const fd = buildForm({
      moq_editor_present: '1',
      min_quantity: '10',
      moq_tier_count: '1',
      tier_0_qty: '10',
      tier_0_price: '18.50',
    })
    const r = parseMoqEditorForm(fd)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.editedTiers[0].unit_price_usd).toBe('18.50')
    // Preuve explicite : PAS '18.5' (ce que produirait un parseFloat + toString)
    expect(r.value.editedTiers[0].unit_price_usd).not.toBe('18.5')
  })

  it('MAX_MOQ_TIERS_FORM vaut 20 (parité avec le sanitizer schema.ts)', () => {
    expect(MAX_MOQ_TIERS_FORM).toBe(20)
  })
})

describe('LOT 4 — judgeEditedTiers', () => {
  it('set vide → ok, tiersToInsert=[], effectiveMoq=existingMoq (palier OPTIONNEL)', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 25,
      editedTiers: [],
      basePriceSource: null,
    })
    expect(r).toEqual({ ok: true, effectiveMoq: 25, tiersToInsert: [], priceBaseBelowFirstTier: false })
  })

  it('paliers décroissants valides, 1er palier == MOQ → ok ; prix VERBATIM préservés', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [
        { min_quantity: 10, unit_price_usd: '20.00' },
        { min_quantity: 50, unit_price_usd: '18.50' },
        { min_quantity: 100, unit_price_usd: '16.00' },
      ],
      basePriceSource: 20,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.effectiveMoq).toBe(10)
    expect(r.tiersToInsert).toEqual([
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 50, unit_price_usd: '18.50' },
      { min_quantity: 100, unit_price_usd: '16.00' },
    ])
    // Toutes les chaînes sont IDENTIQUES (===) aux entrées — zéro reconversion.
    for (const t of r.tiersToInsert) {
      expect(typeof t.unit_price_usd).toBe('string')
    }
  })

  it('échelle CROISSANTE → { ok:false, error: moqTiersRejected } (cas c, même rejet que Lot 3)', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [
        { min_quantity: 10, unit_price_usd: '20.00' },
        { min_quantity: 50, unit_price_usd: '22.00' }, // prix croissant
      ],
      basePriceSource: null,
    })
    expect(r).toEqual({ ok: false, error: 'moqTiersRejected' })
  })

  it('doublon de quantité → moqTiersRejected', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [
        { min_quantity: 10, unit_price_usd: '20.00' },
        { min_quantity: 10, unit_price_usd: '18.00' }, // même quantité
      ],
      basePriceSource: null,
    })
    expect(r).toEqual({ ok: false, error: 'moqTiersRejected' })
  })

  it('1er palier ≠ MOQ existant → { ok:false, error: moqFirstTierMismatch } (cas d)', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [
        { min_quantity: 20, unit_price_usd: '18.00' }, // MOQ=10 mais 1er palier=20
        { min_quantity: 50, unit_price_usd: '16.00' },
      ],
      basePriceSource: null,
    })
    expect(r).toEqual({ ok: false, error: 'moqFirstTierMismatch' })
  })

  it('MOQ édité 1→50, 1er palier=50 → ok, effectiveMoq=50', () => {
    const r = judgeEditedTiers({
      editedMoq: 50,
      existingMoq: 1,
      editedTiers: [
        { min_quantity: 50, unit_price_usd: '18.00' },
        { min_quantity: 100, unit_price_usd: '16.00' },
      ],
      basePriceSource: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.effectiveMoq).toBe(50)
  })

  it('MOQ édité=50 mais 1er palier=10 → moqFirstTierMismatch', () => {
    const r = judgeEditedTiers({
      editedMoq: 50,
      existingMoq: 1,
      editedTiers: [
        { min_quantity: 10, unit_price_usd: '18.00' },
        { min_quantity: 100, unit_price_usd: '16.00' },
      ],
      basePriceSource: null,
    })
    expect(r).toEqual({ ok: false, error: 'moqFirstTierMismatch' })
  })

  it('flag @finance : basePriceSource < prix du 1er palier → priceBaseBelowFirstTier=true, MAIS ok:true (non bloquant)', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [{ min_quantity: 10, unit_price_usd: '20.00' }],
      basePriceSource: 15, // 15 < 20 → base sous le 1er palier
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.priceBaseBelowFirstTier).toBe(true)
  })

  it('flag @finance : basePriceSource >= prix du 1er palier → priceBaseBelowFirstTier=false', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [{ min_quantity: 10, unit_price_usd: '20.00' }],
      basePriceSource: 25, // 25 >= 20
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.priceBaseBelowFirstTier).toBe(false)
  })

  it('flag @finance : basePriceSource === prix du 1er palier (égalité) → priceBaseBelowFirstTier=false (pas "en dessous")', () => {
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [{ min_quantity: 10, unit_price_usd: '20.00' }],
      basePriceSource: 20,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.priceBaseBelowFirstTier).toBe(false)
  })

  it('garde-fou perte silencieuse : une ligne sous la borne du juge (0.50 < plancher plausible=1) → REJET EN BLOC, jamais un set tronqué', () => {
    // sanitizeMoqTiers écarte le palier dont le prix est hors bornes plausibles
    // (MIN_REASONABLE_PRICE_SOURCE=1 dans schema.ts), MAIS judgeEditedTiers exige
    // sanitized.length === editedTiers.length : un palier silencieusement écarté
    // par le sanitizer doit donc faire échouer TOUT le set, pas juste disparaître.
    const r = judgeEditedTiers({
      editedMoq: null,
      existingMoq: 10,
      editedTiers: [
        { min_quantity: 10, unit_price_usd: '20.00' },
        { min_quantity: 50, unit_price_usd: '0.50' }, // sous le plancher plausible → écarté par le sanitizer
        { min_quantity: 100, unit_price_usd: '15.00' },
      ],
      basePriceSource: null,
    })
    expect(r).toEqual({ ok: false, error: 'moqTiersRejected' })
  })
})
