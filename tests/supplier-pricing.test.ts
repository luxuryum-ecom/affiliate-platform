import { describe, it, expect } from 'vitest'
import { convertToMad, composePricing, buildSupplierPricing, isAwaitingFxRate, applyPlatformMargin, buildMirrorTiers } from '@/lib/supplier-pricing'

// Faux client Supabase minimal pour tester l'orchestration sans DB réelle.
// Chaîne .from(table).select().eq().maybeSingle() + .rpc('fx_rate_to_mad').
function fakeDb({ countryCode, operationalCurrency, rate }: {
  countryCode: string | null
  operationalCurrency?: string
  rate?: number | null
}) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => ({
        data: table === 'profiles'
          ? { country_code: countryCode }
          : { operational_currency: operationalCurrency },
        error: null,
      })
      return chain
    },
    rpc: async (_fn: string, _args: unknown) => ({ data: rate ?? null, error: null }),
  } as unknown as Parameters<typeof buildSupplierPricing>[0]
}

// @finance — conversion devise → MAD : numeric, arrondi centiers, jamais fabriqué.
describe('convertToMad', () => {
  it('convertit prix source × taux', () => {
    expect(convertToMad(100, 2.72)).toBe(272)
    expect(convertToMad(50, 10)).toBe(500)
  })

  it('MAD-identité : taux 1 → pivot = source', () => {
    expect(convertToMad(250, 1)).toBe(250)
    expect(convertToMad(99.99, 1)).toBe(99.99)
  })

  it('arrondit à 2 décimales via centiers (pas de float)', () => {
    expect(convertToMad(100, 2.725)).toBe(272.5)
    expect(convertToMad(33.333, 3)).toBe(100) // 33.333×3 = 99.999 → arrondi 100.00
  })

  it('entrée nulle / non finie → null (jamais fabriqué)', () => {
    expect(convertToMad(null, 2.72)).toBeNull()
    expect(convertToMad(100, null)).toBeNull()
    expect(convertToMad(NaN, 2.72)).toBeNull()
    expect(convertToMad(100, Infinity)).toBeNull()
  })

  it('prix ou taux ≤ 0 → null', () => {
    expect(convertToMad(-100, 2.72)).toBeNull()
    expect(convertToMad(0, 2.72)).toBeNull()
    expect(convertToMad(100, 0)).toBeNull()
    expect(convertToMad(100, -1)).toBeNull()
  })

  it('débordement / absurde (> plafond) → null, jamais tronqué', () => {
    expect(convertToMad(999_999, 2)).toBeNull() // ~2M > 1M
    expect(convertToMad(1_000_000, 5)).toBeNull()
  })

  it('frontière du plafond : exactement 1M passe, au-dessus → null', () => {
    expect(convertToMad(1_000_000, 1)).toBe(1_000_000)
    expect(convertToMad(1_000_000.01, 1)).toBeNull()
    expect(convertToMad(500_000, 2)).toBe(1_000_000)
  })

  it('biais demi-centime figé (Math.round, incohérent) — acceptable hors ledger', () => {
    // Le sens de l'arrondi dépend de la représentation float : ici l'un descend,
    // l'autre monte. Comportement figé pour détecter toute régression silencieuse.
    expect(convertToMad(1.005, 1)).toBe(1) // 1.005×100 = 100.4999… → 1.00 (descend)
    expect(convertToMad(2.675, 1)).toBe(2.68) // 2.675×100 = 267.5 → 2.68 (monte)
  })

  it('produit fini débordant → Infinity attrapé → null', () => {
    expect(convertToMad(1e308, 1e308)).toBeNull()
  })
})

describe('buildSupplierPricing (orchestration, DB mockée)', () => {
  it('pays absent → bloqué, AUCUN fallback MAD', async () => {
    const p = await buildSupplierPricing(fakeDb({ countryCode: null }), 'sup-1', 100)
    expect(p.canSubmit).toBe(false)
    expect(p.reason).toBe('no_country')
    expect(p.source_currency).toBeNull()
    expect(p.suggested_wholesale_price_mad).toBeNull()
  })

  it('fournisseur Maroc → MAD, taux 1, identité', async () => {
    const p = await buildSupplierPricing(
      fakeDb({ countryCode: 'MA', operationalCurrency: 'MAD' }), 'sup-1', 250,
    )
    expect(p.source_currency).toBe('MAD')
    expect(p.fx_rate_source_to_mad).toBe(1)
    expect(p.suggested_wholesale_price_mad).toBe(250)
  })

  it('fournisseur Dubai (AED) → conversion via taux admin', async () => {
    const p = await buildSupplierPricing(
      fakeDb({ countryCode: 'AE', operationalCurrency: 'AED', rate: 2.72 }), 'sup-1', 100,
    )
    expect(p.source_currency).toBe('AED')
    expect(p.fx_rate_source_to_mad).toBe(2.72)
    expect(p.suggested_wholesale_price_mad).toBe(272)
  })

  it('devise sans taux admin → mad NULL + flag (jamais 1, jamais deviné)', async () => {
    const p = await buildSupplierPricing(
      fakeDb({ countryCode: 'XX', operationalCurrency: 'AED', rate: null }), 'sup-1', 100,
    )
    expect(p.reason).toBe('no_rate')
    expect(p.fx_rate_source_to_mad).toBeNull()
    expect(p.suggested_wholesale_price_mad).toBeNull()
    expect(p.canSubmit).toBe(true)
  })
})

describe('composePricing', () => {
  it('pas de pays/devise → no_country + canSubmit=false + tout financier null', () => {
    const p = composePricing(null, null, 100)
    expect(p.reason).toBe('no_country')
    expect(p.canSubmit).toBe(false)
    expect(p.source_currency).toBeNull()
    expect(p.fx_rate_source_to_mad).toBeNull()
    expect(p.suggested_wholesale_price_mad).toBeNull()
  })

  it('devise connue sans taux → no_rate, créable mais mad NULL (jamais deviné)', () => {
    const p = composePricing('AED', null, 100)
    expect(p.reason).toBe('no_rate')
    expect(p.canSubmit).toBe(true)
    expect(p.source_currency).toBe('AED')
    expect(p.fx_rate_source_to_mad).toBeNull()
    expect(p.suggested_wholesale_price_mad).toBeNull()
  })

  it('conversion normale devise étrangère', () => {
    const p = composePricing('AED', 2.72, 100)
    expect(p.reason).toBe('ok')
    expect(p.source_currency).toBe('AED')
    expect(p.fx_rate_source_to_mad).toBe(2.72)
    expect(p.suggested_wholesale_price_mad).toBe(272)
  })

  it('MAD-identité', () => {
    const p = composePricing('MAD', 1, 250)
    expect(p.reason).toBe('ok')
    expect(p.suggested_wholesale_price_mad).toBe(250)
    expect(p.price_source).toBe(250)
  })

  it('prix absent → no_price, mad NULL, canSubmit=true', () => {
    const p = composePricing('AED', 2.72, null)
    expect(p.reason).toBe('no_price')
    expect(p.suggested_wholesale_price_mad).toBeNull()
    expect(p.canSubmit).toBe(true)
  })

  it('débordement → mad NULL (jamais un nombre faux)', () => {
    const p = composePricing('AED', 2.72, 999_999)
    expect(p.suggested_wholesale_price_mad).toBeNull()
    expect(p.reason).toBe('no_price')
  })
})

// ─── isAwaitingFxRate — détection « no_rate » dérivée (surfaçage, validé @finance) ──
// Condition canonique : devise étrangère (≠ MAD) SANS taux figé → prix MAD non
// calculé, affiché « Sur devis ». Aucun calcul ; ce test verrouille la condition.
describe('isAwaitingFxRate', () => {
  it('true : devise étrangère sans taux (le cas no_rate)', () => {
    expect(isAwaitingFxRate({ source_currency: 'AED', fx_rate_source_to_mad: null })).toBe(true)
    expect(isAwaitingFxRate({ source_currency: 'USD', fx_rate_source_to_mad: null })).toBe(true)
  })

  it('false : MAD sans taux est EXCLU (invariant sp_mad_identity ⇒ taux 1)', () => {
    expect(isAwaitingFxRate({ source_currency: 'MAD', fx_rate_source_to_mad: null })).toBe(false)
  })

  it('false : devise étrangère AVEC taux (no_price ou ok — pas no_rate)', () => {
    expect(isAwaitingFxRate({ source_currency: 'AED', fx_rate_source_to_mad: 2.72 })).toBe(false)
    expect(isAwaitingFxRate({ source_currency: 'MAD', fx_rate_source_to_mad: 1 })).toBe(false)
  })

  it('false : pas de devise (no_country — déjà bloqué en amont)', () => {
    expect(isAwaitingFxRate({ source_currency: null, fx_rate_source_to_mad: null })).toBe(false)
  })

  it('cohérent avec composePricing : reason no_rate ⇒ isAwaitingFxRate true', () => {
    const p = composePricing('AED', null, 100)
    expect(p.reason).toBe('no_rate')
    expect(isAwaitingFxRate({
      source_currency: p.source_currency,
      fx_rate_source_to_mad: p.fx_rate_source_to_mad,
    })).toBe(true)
  })

  it('cohérent avec composePricing : reason no_price ⇒ isAwaitingFxRate false', () => {
    const p = composePricing('AED', 2.72, null)
    expect(p.reason).toBe('no_price')
    expect(isAwaitingFxRate({
      source_currency: p.source_currency,
      fx_rate_source_to_mad: p.fx_rate_source_to_mad,
    })).toBe(false)
  })
})

// ─── applyPlatformMargin — marge plateforme fournisseur (canal direct) ───────
// @finance : miroir de calculatePlatformPrice, arrondi MAD entier sur % ET fixe.
// Toggle OFF (défaut) = identité stricte avec la base. Jamais exposé au grossiste.
describe('applyPlatformMargin', () => {
  it('toggle OFF → prix INCHANGÉ (identité, même avec décimales)', () => {
    expect(applyPlatformMargin(200, false, 'percentage', 15)).toBe(200)
    expect(applyPlatformMargin(247.5, false, 'percentage', 15)).toBe(247.5)
    expect(applyPlatformMargin(1000, false, 'fixed', 50)).toBe(1000)
  })

  it('toggle ON % 15 → Math.round(base × 1.15), MAD entier', () => {
    expect(applyPlatformMargin(200, true, 'percentage', 15)).toBe(230)
    expect(applyPlatformMargin(247.5, true, 'percentage', 15)).toBe(285) // round(284.625)
    expect(applyPlatformMargin(1000, true, 'percentage', 15)).toBe(1150)
  })

  it('toggle ON fixe → Math.round(base + montant), entier sur les DEUX branches', () => {
    expect(applyPlatformMargin(200, true, 'fixed', 50)).toBe(250)
    expect(applyPlatformMargin(247.5, true, 'fixed', 50)).toBe(298) // round(297.5) half-up
    expect(applyPlatformMargin(1000, true, 'fixed', 50)).toBe(1050)
  })

  it('valeur null / ≤ 0 → pas de marge fabriquée (= base)', () => {
    expect(applyPlatformMargin(200, true, 'percentage', null)).toBe(200)
    expect(applyPlatformMargin(200, true, 'percentage', 0)).toBe(200)
    expect(applyPlatformMargin(200, true, 'fixed', -5)).toBe(200)
  })

  it('base null → null', () => {
    expect(applyPlatformMargin(null, true, 'percentage', 15)).toBeNull()
    expect(applyPlatformMargin(null, false, 'fixed', 50)).toBeNull()
  })
})

describe('buildMirrorTiers (report paliers fournisseur → grossiste MAD, D3)', () => {
  it('convertit FX + marge %, ENTIER MAD, trié + max_qty borné (getWholesaleTier correct)', () => {
    const r = buildMirrorTiers(
      [{ min_quantity: 1, unit_price_usd: 10 }, { min_quantity: 100, unit_price_usd: 8 }],
      10, true, 'percentage', 25,
    )
    expect(r).toEqual([
      { min_qty: 1, max_qty: 99, price_per_unit: 125 }, // 10×10=100 +25% = 125
      { min_qty: 100, price_per_unit: 100 },            // 8×10=80 +25% = 100, dernier ouvert
    ])
  })

  it('marge OFF → ENTIER MAD (Math.round), biais ½-centime de convertToMad écarté', () => {
    const r = buildMirrorTiers([{ min_quantity: 1, unit_price_usd: 10.4 }], 1, false, 'percentage', 0)
    expect(r).toEqual([{ min_qty: 1, price_per_unit: 10 }]) // 10,40 → 10 entier, jamais 10,40 facturé
    expect(Number.isInteger(r[0].price_per_unit)).toBe(true)
  })

  it('palier non convertible (taux null / prix ≤ 0) ÉCARTÉ — jamais de MAD fabriqué', () => {
    expect(buildMirrorTiers([{ min_quantity: 1, unit_price_usd: 5 }], null, true, 'percentage', 25)).toEqual([])
    expect(buildMirrorTiers([{ min_quantity: 1, unit_price_usd: 0 }], 10, true, 'percentage', 25)).toEqual([])
  })

  it('min_qty non entier / doublon ÉCARTÉS', () => {
    const r = buildMirrorTiers(
      [
        { min_quantity: 1.5, unit_price_usd: 9 },
        { min_quantity: 10, unit_price_usd: 8 },
        { min_quantity: 10, unit_price_usd: 7 },
      ],
      10, false, 'percentage', 0,
    )
    expect(r).toEqual([{ min_qty: 10, price_per_unit: 80 }]) // 1.5 écarté ; doublon 10 → 1er gardé
  })

  it('vide / null → []', () => {
    expect(buildMirrorTiers([], 10, true, 'percentage', 25)).toEqual([])
    expect(buildMirrorTiers(null, 10, true, 'percentage', 25)).toEqual([])
  })
})
