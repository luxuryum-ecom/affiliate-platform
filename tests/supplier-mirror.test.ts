import { describe, it, expect } from 'vitest'
import {
  buildSupplierMirror,
  computeSupplierCostMad,
  type SupplierMirrorInput,
} from '../src/lib/supplier-mirror'

const base: SupplierMirrorInput = {
  id: 'sp-1',
  product_name: 'Huile Argan 1L',
  public_name: null,
  availability_type: 'local_stock',
  suggested_wholesale_price_mad: 100,
  final_wholesale_price_mad: 120,
  stock_quantity: 120,
  min_quantity: 10,
  unit: null,
  pack_size: null,
  pack_unit: null,
  photos: null,
}

describe('buildSupplierMirror', () => {
  it('crée un miroir : sell=final (vitrine), factory=suggested (coût), marge captée une fois', () => {
    const d = buildSupplierMirror(base)
    expect(d.create).toBe(true)
    if (!d.create) return
    expect(d.row.sell_price).toBe(120) // prix facturé = vitrine
    expect(d.row.factory_cost_mad).toBe(100) // coût fournisseur avant marge
    expect(d.row.sell_price - d.row.factory_cost_mad).toBe(20) // marge plateforme = 20, une fois
    expect(d.row.source_supplier_product_id).toBe('sp-1')
    expect(d.row.availability_type).toBe('local_stock')
    expect(d.row.approval_status).toBe('approved')
    expect(d.row.active).toBe(true)
    expect(d.row.wholesale_min_qty).toBe(10)
    expect(d.row.stock_count).toBe(120)
    expect(d.row.name).toBe('Huile Argan 1L')
  })

  it('utilise public_name (trim) si présent', () => {
    const d = buildSupplierMirror({ ...base, public_name: '  Argan Premium  ' })
    expect(d.create && d.row.name).toBe('Argan Premium')
  })

  it('C-B5 — import_on_demand → pas de miroir (reste devis)', () => {
    const d = buildSupplierMirror({ ...base, availability_type: 'import_on_demand' })
    expect(d).toEqual({ create: false, reason: 'not_local_stock' })
  })

  it('C-B3 — suggested NULL (devise sans taux FX) → pas de miroir', () => {
    const d = buildSupplierMirror({ ...base, suggested_wholesale_price_mad: null })
    expect(d).toEqual({ create: false, reason: 'no_fx_rate' })
  })

  it('marge OFF (final == suggested) → miroir avec marge 0, sell=factory', () => {
    const d = buildSupplierMirror({ ...base, final_wholesale_price_mad: 100 })
    expect(d.create).toBe(true)
    if (!d.create) return
    expect(d.row.sell_price).toBe(100)
    expect(d.row.factory_cost_mad).toBe(100)
    expect(d.row.sell_price - d.row.factory_cost_mad).toBe(0)
  })

  it('final NULL → sell retombe sur suggested (jamais NULL en base)', () => {
    const d = buildSupplierMirror({ ...base, final_wholesale_price_mad: null })
    expect(d.create && d.row.sell_price).toBe(100)
  })

  it('C-B2 — sell < factory (marge négative anormale) → refus', () => {
    const d = buildSupplierMirror({ ...base, final_wholesale_price_mad: 90 })
    expect(d).toEqual({ create: false, reason: 'negative_margin' })
  })

  it('prix non positif → refus (CHECK sell_price > 0)', () => {
    const d = buildSupplierMirror({ ...base, suggested_wholesale_price_mad: 0, final_wholesale_price_mad: 0 })
    expect(d).toEqual({ create: false, reason: 'non_positive_price' })
  })

  it('stock fournisseur NULL → stock_count 0 (pas de survente, repli sur-commande/devis)', () => {
    const d = buildSupplierMirror({ ...base, stock_quantity: null })
    expect(d.create && d.row.stock_count).toBe(0)
  })

  it('IDEMPOTENCE — même entrée → même ligne (UPSERT onConflict stable)', () => {
    const a = buildSupplierMirror(base)
    const b = buildSupplierMirror({ ...base })
    expect(a).toEqual(b)
  })

  it('UNITÉ/CONDITIONNEMENT reportés au miroir (paquet + pack 10 kg) — AFFICHAGE PUR', () => {
    const d = buildSupplierMirror({ ...base, unit: 'paquet', pack_size: 10, pack_unit: 'kg' })
    expect(d.create).toBe(true)
    if (!d.create) return
    expect(d.row.sale_unit).toBe('paquet')
    expect(d.row.pack_size).toBe(10)
    expect(d.row.pack_unit).toBe('kg')
    // l'argent reste INTACT (hors périmètre)
    expect(d.row.sell_price).toBe(120)
    expect(d.row.factory_cost_mad).toBe(100)
  })

  it('unité brute normalisée (« le mètre » → metre)', () => {
    const d = buildSupplierMirror({ ...base, unit: 'le mètre' })
    expect(d.create && d.row.sale_unit).toBe('metre')
  })

  it('PHOTOS reportées au miroir : media (jsonb [{url,type:image}]) + images (legacy) — AFFICHAGE PUR', () => {
    const photos = ['https://cdn.x/a.jpg', 'https://cdn.x/b.png']
    const d = buildSupplierMirror({ ...base, photos })
    expect(d.create).toBe(true)
    if (!d.create) return
    expect(d.row.media).toEqual([
      { url: 'https://cdn.x/a.jpg', type: 'image' },
      { url: 'https://cdn.x/b.png', type: 'image' },
    ])
    expect(d.row.images).toEqual(photos) // legacy dérivé identique
    // l'argent reste INTACT (hors périmètre)
    expect(d.row.sell_price).toBe(120)
    expect(d.row.factory_cost_mad).toBe(100)
  })

  it('PHOTOS : URLs invalides/vides filtrées (même filtre que le form admin)', () => {
    const d = buildSupplierMirror({
      ...base,
      photos: ['  https://cdn.x/ok.jpg  ', '', 'pas-une-url', 'ftp://x/y.jpg'],
    })
    expect(d.create).toBe(true)
    if (!d.create) return
    expect(d.row.images).toEqual(['https://cdn.x/ok.jpg']) // trim + seules http(s)
    expect(d.row.media).toEqual([{ url: 'https://cdn.x/ok.jpg', type: 'image' }])
  })

  it('PHOTOS absentes (null/[]/que des invalides) → media/images OMIS (jamais écrasés à la ré-approbation)', () => {
    const dNull = buildSupplierMirror(base)
    expect(dNull.create && 'media' in dNull.row).toBe(false)
    expect(dNull.create && 'images' in dNull.row).toBe(false)
    const dEmpty = buildSupplierMirror({ ...base, photos: [] })
    expect(dEmpty.create && 'media' in dEmpty.row).toBe(false)
    const dInvalid = buildSupplierMirror({ ...base, photos: ['', 'nope'] })
    expect(dInvalid.create && 'media' in dInvalid.row).toBe(false)
  })

  it('NON-RÉGRESSION : sans unité (null/pcs) → sale_unit null, pack null/null = inchangé', () => {
    const dNull = buildSupplierMirror(base)
    expect(dNull.create && dNull.row.sale_unit).toBeNull()
    expect(dNull.create && dNull.row.pack_size).toBeNull()
    expect(dNull.create && dNull.row.pack_unit).toBeNull()
    const dPcs = buildSupplierMirror({ ...base, unit: 'pcs' })
    expect(dPcs.create && dPcs.row.sale_unit).toBeNull() // 'pcs' → piece → null (pas de suffixe)
  })
})

describe('computeSupplierCostMad (C-B1)', () => {
  it('Σ(factory_cost × qty) en centimes entiers', () => {
    expect(
      computeSupplierCostMad([
        { factory_cost_mad: 100, quantity: 2 },
        { factory_cost_mad: 50, quantity: 3 },
      ]),
    ).toBe('350.00') // 200 + 150
  })

  it('factory_cost NULL (legacy) → 0 pour cette ligne', () => {
    expect(
      computeSupplierCostMad([
        { factory_cost_mad: null, quantity: 5 },
        { factory_cost_mad: 30, quantity: 2 },
      ]),
    ).toBe('60.00')
  })

  it('pas de dérive flottante (centimes entiers)', () => {
    expect(computeSupplierCostMad([{ factory_cost_mad: 19.99, quantity: 3 }])).toBe('59.97')
  })

  it('panier vide → 0.00', () => {
    expect(computeSupplierCostMad([])).toBe('0.00')
  })
})
