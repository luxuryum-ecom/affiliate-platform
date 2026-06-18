import { describe, it, expect } from 'vitest'
import {
  normalizeSaleUnit,
  resolveUnitLabel,
  priceWithUnit,
  type SaleUnit,
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
