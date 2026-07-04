// ─── LOT C1a — Unité de vente LIBRE + confirmation conversationnelle ─────────
// Tests PURS (aucune I/O, aucune DB). Couvrent :
//  - units.ts : matchKnownSaleUnit / sanitizeSaleUnitFreeText / resolveUnitLabel (free text)
//  - conversation.ts : isAffirmativeReply / interpretUnitReply
//  - messages.ts : msgConfirmUnit (4 langues, connu traduit / libre verbatim, isolation RTL)
// Principe métier : l'unité est de l'AFFICHAGE PUR ; « botte » n'est JAMAIS écrasé
// vers « pièce » (texte libre de bout en bout).

import { describe, it, expect } from 'vitest'
import { matchKnownSaleUnit, sanitizeSaleUnitFreeText, resolveUnitLabel, type SaleUnit } from '@/lib/units'
import { isAffirmativeReply, interpretUnitReply } from '@/lib/telegram/conversation'
import { msgConfirmUnit } from '@/lib/telegram/messages'

// Traducteur factice du namespace 'units' (renvoie la clé → assertions lisibles).
const tUnits = (k: SaleUnit) => `LABEL_${k}`

describe('C1a — matchKnownSaleUnit (connu → canonique, libre → null)', () => {
  it('unités connues (FR/AR/darija/EN) → enum canonique', () => {
    expect(matchKnownSaleUnit('gramme')).toBe('gramme')
    expect(matchKnownSaleUnit('kg')).toBe('kg')
    expect(matchKnownSaleUnit('le kilo')).toBe('kg') // article + alias
    expect(matchKnownSaleUnit('mètre')).toBe('metre')
    expect(matchKnownSaleUnit('غرام')).toBe('gramme')
    expect(matchKnownSaleUnit('قطعة')).toBe('piece')
    expect(matchKnownSaleUnit('gram')).toBe('gramme')
  })
  it('unité LIBRE inconnue → null (jamais écrasée vers piece)', () => {
    expect(matchKnownSaleUnit('botte')).toBeNull()
    expect(matchKnownSaleUnit('bouquet')).toBeNull()
    expect(matchKnownSaleUnit('rouleau')).toBeNull()
  })
  it('vide / null → null', () => {
    expect(matchKnownSaleUnit('')).toBeNull()
    expect(matchKnownSaleUnit(null)).toBeNull()
    expect(matchKnownSaleUnit(undefined)).toBeNull()
  })
})

describe('C1a — sanitizeSaleUnitFreeText (verbatim, défaut piece, borné)', () => {
  it('garde le texte brut verbatim (botte NON écrasé)', () => {
    expect(sanitizeSaleUnitFreeText('botte')).toBe('botte')
    expect(sanitizeSaleUnitFreeText('  Sachet  ')).toBe('Sachet') // trim, casse gardée
  })
  it('vide / null → piece (défaut)', () => {
    expect(sanitizeSaleUnitFreeText('')).toBe('piece')
    expect(sanitizeSaleUnitFreeText(null)).toBe('piece')
    expect(sanitizeSaleUnitFreeText(undefined)).toBe('piece')
  })
  it('borné à 40 caractères', () => {
    expect(sanitizeSaleUnitFreeText('x'.repeat(100)).length).toBe(40)
  })
})

describe('C1a — resolveUnitLabel (connu → i18n, libre → verbatim)', () => {
  it('unité connue → label traduit', () => {
    expect(resolveUnitLabel('gramme', tUnits)).toBe('LABEL_gramme')
    expect(resolveUnitLabel('le kilo', tUnits)).toBe('LABEL_kg')
    expect(resolveUnitLabel('غرام', tUnits)).toBe('LABEL_gramme')
  })
  it('unité LIBRE inconnue → texte brut verbatim (non traduit)', () => {
    expect(resolveUnitLabel('botte', tUnits)).toBe('botte')
    expect(resolveUnitLabel('bouquet', tUnits)).toBe('bouquet')
  })
  it('vide/null → label pièce (défaut, inchangé)', () => {
    expect(resolveUnitLabel('', tUnits)).toBe('LABEL_piece')
    expect(resolveUnitLabel(null, tUnits)).toBe('LABEL_piece')
  })
})

describe('C1a — isAffirmativeReply (oui/yes/نعم/واه)', () => {
  it('affirmations 4 langues → true', () => {
    for (const s of ['oui', 'Oui !', 'ok', "c'est ça", 'yes', 'correct', 'نعم', 'واه', 'صحيح', 'هاكا', 'مزيان']) {
      expect(isAffirmativeReply(s)).toBe(true)
    }
  })
  it('non-affirmations → false', () => {
    for (const s of ['non', 'botte', 'gramme', '', null, 'je comprends pas']) {
      expect(isAffirmativeReply(s)).toBe(false)
    }
  })
})

describe('C1a — interpretUnitReply (confirmer / corriger / confus / inexploitable)', () => {
  it('« oui » → confirmed', () => {
    expect(interpretUnitReply('oui')).toEqual({ kind: 'confirmed' })
    expect(interpretUnitReply('نعم')).toEqual({ kind: 'confirmed' })
  })
  it('unité CONNUE écrite → corrected (forme canonique)', () => {
    expect(interpretUnitReply('litre')).toEqual({ kind: 'corrected', unit: 'litre' })
    expect(interpretUnitReply('au kilo')).toEqual({ kind: 'corrected', unit: 'kg' })
    expect(interpretUnitReply("non c'est le litre")).toEqual({ kind: 'corrected', unit: 'litre' })
  })
  it('unité LIBRE inconnue courte → corrected (verbatim, non écrasée)', () => {
    expect(interpretUnitReply('botte')).toEqual({ kind: 'corrected', unit: 'botte' })
    expect(interpretUnitReply('bouquet')).toEqual({ kind: 'corrected', unit: 'bouquet' })
  })
  it('confusion → confused', () => {
    expect(interpretUnitReply('je comprends pas')).toEqual({ kind: 'confused' })
    expect(interpretUnitReply('?')).toEqual({ kind: 'confused' })
  })
  it('« non » seul (sans unité) → unusable', () => {
    expect(interpretUnitReply('non')).toEqual({ kind: 'unusable' })
    expect(interpretUnitReply('لا')).toEqual({ kind: 'unusable' })
  })
  it('phrase verbeuse sans unité connue → unusable (pas de bruit stocké)', () => {
    expect(interpretUnitReply('je sais pas trop honnêtement voilà')).toEqual({ kind: 'unusable' })
  })
  it('vide → unusable', () => {
    expect(interpretUnitReply('')).toEqual({ kind: 'unusable' })
  })
})

describe('C1a — msgConfirmUnit (4 langues, connu traduit / libre verbatim, RTL isolé)', () => {
  const FSI = '⁨'
  const PDI = '⁩'

  it('FR : unité connue traduite + « par [unité] »', () => {
    const m = msgConfirmUnit('fr', { unit: 'gramme' })
    expect(m).toContain('unité de vente est : gramme')
    expect(m).toContain('par gramme')
    expect(m).toContain('oui')
  })
  it('EN : unité connue traduite (gram)', () => {
    const m = msgConfirmUnit('en', { unit: 'gramme' })
    expect(m).toContain('sale unit is: gram')
    expect(m).toContain('per gram')
  })
  it('AR-fusha : unité connue (غرام) ISOLÉE FSI/PDI', () => {
    const m = msgConfirmUnit('ar', { unit: 'gramme' })
    expect(m).toContain('وحدة البيع')
    expect(m).toContain(`${FSI}غرام${PDI}`)
  })
  it('AR-darija : darija naturelle + unité isolée', () => {
    const m = msgConfirmUnit('ar-MA', { unit: 'litre' })
    expect(m).toContain('واش هاكا')
    expect(m).toContain(`${FSI}لتر${PDI}`)
  })
  it('unité LIBRE « botte » → verbatim identique dans les 4 langues', () => {
    expect(msgConfirmUnit('fr', { unit: 'botte' })).toContain('est : botte')
    expect(msgConfirmUnit('en', { unit: 'botte' })).toContain('is: botte')
    // Arabe : « botte » (latin) verbatim ET isolé pour l'ordre RTL.
    expect(msgConfirmUnit('ar', { unit: 'botte' })).toContain(`${FSI}botte${PDI}`)
    expect(msgConfirmUnit('ar-MA', { unit: 'botte' })).toContain(`${FSI}botte${PDI}`)
  })
  it('chiffres jamais concernés — aucune régression sur les autres messages', () => {
    // msgConfirmUnit ne contient pas de chiffre arabe-indic (règle numéraux latins).
    expect(msgConfirmUnit('ar', { unit: 'kg' })).not.toMatch(/[٠-٩]/)
  })
})
