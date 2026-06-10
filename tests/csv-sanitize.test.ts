import { describe, it, expect } from 'vitest'
import { sanitizeCsvCell, looksLikeBinary, hasForbiddenHeader } from '@/lib/csv-sanitize'

describe('sanitizeCsvCell (anti CSV-injection)', () => {
  it('neutralise les cellules de formule en tête', () => {
    expect(sanitizeCsvCell('=cmd|calc')).toBe("'=cmd|calc")
    expect(sanitizeCsvCell('+1+1')).toBe("'+1+1")
    expect(sanitizeCsvCell('-2+3')).toBe("'-2+3")
    expect(sanitizeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(sanitizeCsvCell('\t=1')).toBe("'\t=1")
    expect(sanitizeCsvCell('\r=1')).toBe("'\r=1")
    expect(sanitizeCsvCell('  =1')).toBe("'  =1") // espaces puis formule
  })

  it('laisse intactes les valeurs normales', () => {
    expect(sanitizeCsvCell('Produit normal')).toBe('Produit normal')
    expect(sanitizeCsvCell('Sac -50% promo')).toBe('Sac -50% promo') // tiret au milieu
    expect(sanitizeCsvCell('a=b')).toBe('a=b') // = pas en tête
    expect(sanitizeCsvCell('')).toBe('')
    expect(sanitizeCsvCell('123')).toBe('123')
  })
})

describe('looksLikeBinary', () => {
  it('accepte du CSV texte', () => {
    expect(looksLikeBinary('a,b,c\n1,2,3\n')).toBe(false)
    expect(looksLikeBinary('produit,prix\nT-shirt,25')).toBe(false)
  })
  it('rejette du binaire (NUL / octets de contrôle)', () => {
    expect(looksLikeBinary('PK\x03\x04binaire')).toBe(true) // ZIP (\x03)
    expect(looksLikeBinary('abc\x00def')).toBe(true) // NUL
    expect(looksLikeBinary('\x89PNG\r\n\x1a\n')).toBe(true) // PNG (\x1a)
  })

  it('accepte du texte avec accents (UTF-8, pas binaire)', () => {
    expect(looksLikeBinary('Café,Épices,Égypte\nThé,Açaï,Maroc')).toBe(false)
  })
})

describe('hasForbiddenHeader (pollution prototype)', () => {
  it('détecte les en-têtes dangereux', () => {
    expect(hasForbiddenHeader(['product_name', '__proto__'])).toBe(true)
    expect(hasForbiddenHeader(['constructor'])).toBe(true)
    expect(hasForbiddenHeader(['PROTOTYPE'])).toBe(true)
  })
  it('accepte les en-têtes normaux', () => {
    expect(hasForbiddenHeader(['product_name', 'price', 'category'])).toBe(false)
  })
})
