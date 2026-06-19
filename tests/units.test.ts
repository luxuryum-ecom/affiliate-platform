import { describe, it, expect } from 'vitest'
import {
  normalizeSaleUnit,
  resolveUnitLabel,
  priceWithUnit,
  packPerUnitPrice,
  normalizePackUnit,
  resolvePackUnitLabel,
  type SaleUnit,
  type PackUnitKey,
} from '@/lib/units'

// traducteur factice : renvoie la clé en MAJUSCULE pour vérifier le mapping
const t = (k: SaleUnit) => k.toUpperCase()

describe('normalizeSaleUnit', () => {
  it('null / vide / inconnu → piece (jamais d’erreur)', () => {
    expect(normalizeSaleUnit(null)).toBe('piece')
    expect(normalizeSaleUnit(undefined)).toBe('piece')
    expect(normalizeSaleUnit('')).toBe('piece')
    expect(normalizeSaleUnit('zzz')).toBe('piece')
  })
  it('héritage « pcs » et variantes → piece', () => {
    expect(normalizeSaleUnit('pcs')).toBe('piece')
    expect(normalizeSaleUnit('Pièce')).toBe('piece')
    expect(normalizeSaleUnit('قطعة')).toBe('piece')
  })
  it('langage naturel FR/AR → enum', () => {
    expect(normalizeSaleUnit('kg')).toBe('kg')
    expect(normalizeSaleUnit('Kilo')).toBe('kg')
    expect(normalizeSaleUnit('كيلو')).toBe('kg')
    expect(normalizeSaleUnit('mètre')).toBe('metre')
    expect(normalizeSaleUnit(' m ')).toBe('metre')
    expect(normalizeSaleUnit('sac')).toBe('paquet')
    expect(normalizeSaleUnit('carton')).toBe('carton')
    expect(normalizeSaleUnit('caisse')).toBe('carton')
  })
})

describe('resolveUnitLabel', () => {
  it('mappe via le traducteur du namespace units', () => {
    expect(resolveUnitLabel('kg', t)).toBe('KG')
    expect(resolveUnitLabel('mètre', t)).toBe('METRE')
    expect(resolveUnitLabel(null, t)).toBe('PIECE')
    expect(resolveUnitLabel('pcs', t)).toBe('PIECE')
  })
})

describe('priceWithUnit — NON-RÉGRESSION', () => {
  it('unité posée → suffixe ajouté', () => {
    expect(priceWithUnit('40 MAD', 'kg')).toBe('40 MAD / kg')
    expect(priceWithUnit('40 MAD', 'm')).toBe('40 MAD / m')
  })
  it('unité absente (null/undefined/"") → AUCUN suffixe = identique à avant', () => {
    expect(priceWithUnit('40 MAD', null)).toBe('40 MAD')
    expect(priceWithUnit('40 MAD', undefined)).toBe('40 MAD')
    expect(priceWithUnit('40 MAD', '')).toBe('40 MAD')
  })
})

describe('packPerUnitPrice — conditionnement DÉRIVÉ (P3)', () => {
  it('prix ÷ pack_size, arrondi 2 déc.', () => {
    expect(packPerUnitPrice(200, 50)).toBe(4) // carton 200 / 50 boîtes
    expect(packPerUnitPrice(199, 50)).toBe(3.98)
  })
  it('null si pas de conditionnement exploitable → on n’affiche RIEN', () => {
    expect(packPerUnitPrice(200, null)).toBeNull()
    expect(packPerUnitPrice(200, undefined)).toBeNull()
    expect(packPerUnitPrice(200, 1)).toBeNull() // lot de 1 = inutile
    expect(packPerUnitPrice(200, 0)).toBeNull()
    expect(packPerUnitPrice(0, 50)).toBeNull()
    expect(packPerUnitPrice(null, 50)).toBeNull()
  })
})

describe('normalizePackUnit — unité de conditionnement (affichage pur)', () => {
  it('variantes FR/AR/darija/EN connues → clé canonique', () => {
    expect(normalizePackUnit('boîte')).toBe('boite')
    expect(normalizePackUnit('Boîtes')).toBe('boite')
    expect(normalizePackUnit('علبة')).toBe('boite')
    expect(normalizePackUnit('box')).toBe('boite')
    expect(normalizePackUnit('sac')).toBe('sac')
    expect(normalizePackUnit('كيس')).toBe('sac')
    expect(normalizePackUnit('caisse')).toBe('carton')
    expect(normalizePackUnit('كرطونة')).toBe('carton')
    expect(normalizePackUnit('pièce')).toBe('piece')
    expect(normalizePackUnit('  KG ')).toBe('kg')
  })
  it('terme libre inconnu / vide / null → null (fallback texte brut)', () => {
    expect(normalizePackUnit('bidon-bizarre')).toBeNull()
    expect(normalizePackUnit('')).toBeNull()
    expect(normalizePackUnit(null)).toBeNull()
    expect(normalizePackUnit(undefined)).toBeNull()
  })
})

describe('resolvePackUnitLabel — traduction + accord (pluriel)', () => {
  // traducteur factice : encode clé + count pour vérifier l'aiguillage (sans i18n réel)
  const tk = (key: PackUnitKey, values?: { count: number }) => `${key}#${values?.count}`
  it('unité connue → passe par la clé i18n avec le bon count', () => {
    expect(resolvePackUnitLabel('boîte', 50, tk)).toBe('pu_boite#50') // pluriel
    expect(resolvePackUnitLabel('boîte', 1, tk)).toBe('pu_boite#1') // singulier
    expect(resolvePackUnitLabel('كرطونة', 12, tk)).toBe('pu_carton#12')
  })
  it('terme libre inconnu → texte brut, JAMAIS traduit', () => {
    expect(resolvePackUnitLabel('bidon-bizarre', 50, tk)).toBe('bidon-bizarre')
    expect(resolvePackUnitLabel('  Truc  ', 3, tk)).toBe('Truc') // trim, brut conservé
  })
  it('null/vide → chaîne vide (rien d’affiché)', () => {
    expect(resolvePackUnitLabel(null, 5, tk)).toBe('')
    expect(resolvePackUnitLabel('', 5, tk)).toBe('')
  })
})
