import { describe, it, expect } from 'vitest'
import { parseCsvText } from '@/lib/bulk-import'

const HEADER = 'product_name,category,description,moq,unit,price,stock_quantity,export_country,lead_time,images_urls'
const validRow = 'Widget,Textile,Un widget,100,pcs,25,50,Maroc,10,'

describe('parseCsvText — validation', () => {
  it('parse une ligne valide (prix = montant source)', () => {
    const r = parseCsvText(`${HEADER}\n${validRow}`)
    expect(r.fatalError).toBeUndefined()
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].price_source).toBe(25)
    expect(r.rows[0].product_name).toBe('Widget')
    expect(r.rows[0].category).toBe('Textile')
  })

  it('arrondit price_source à 2 décimales (invariant sp_mad_identity)', () => {
    const r = parseCsvText(`${HEADER}\nWidget,Textile,d,100,pcs,25.999,50,Maroc,10,`)
    expect(r.rows[0].price_source).toBe(26)
    const r2 = parseCsvText(`${HEADER}\nWidget,Textile,d,100,pcs,12.345,50,Maroc,10,`)
    expect(r2.rows[0].price_source).toBe(12.35)
  })

  it('rejette une catégorie hors taxonomie', () => {
    const r = parseCsvText(`${HEADER}\nWidget,CatégorieBidon,d,100,pcs,25,50,Maroc,10,`)
    expect(r.rows).toHaveLength(0)
    expect(r.rowsInvalid).toBe(1)
  })

  it('rejette prix négatif / zéro / non numérique', () => {
    expect(parseCsvText(`${HEADER}\nW,Textile,d,100,pcs,-5,50,Maroc,10,`).rows).toHaveLength(0)
    expect(parseCsvText(`${HEADER}\nW,Textile,d,100,pcs,0,50,Maroc,10,`).rows).toHaveLength(0)
    expect(parseCsvText(`${HEADER}\nW,Textile,d,100,pcs,abc,50,Maroc,10,`).rows).toHaveLength(0)
  })

  it('rejette moq ≤ 0 et export_country manquant', () => {
    expect(parseCsvText(`${HEADER}\nW,Textile,d,0,pcs,25,50,Maroc,10,`).rows).toHaveLength(0)
    expect(parseCsvText(`${HEADER}\nW,Textile,d,100,pcs,25,50,,10,`).rows).toHaveLength(0)
  })

  it('neutralise une injection CSV dans un champ libre', () => {
    const r = parseCsvText(`${HEADER}\n=cmd|calc,Textile,d,100,pcs,25,50,Maroc,10,`)
    // La cellule de formule est assainie ; le nom reste non vide donc la ligne passe.
    expect(r.rows[0].product_name).toBe("'=cmd|calc")
  })

  it('rejette un en-tête de pollution de prototype', () => {
    const r = parseCsvText(`product_name,__proto__\nW,x`)
    expect(r.fatalError).toBeDefined()
    expect(r.rows).toHaveLength(0)
  })

  it('rejette un fichier au-delà de la limite de lignes', () => {
    const big = [HEADER, ...Array(5001).fill(validRow)].join('\n')
    const r = parseCsvText(big)
    expect(r.fatalError).toBeDefined()
    expect(r.rows).toHaveLength(0)
  })
})
