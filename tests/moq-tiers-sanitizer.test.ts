import { describe, it, expect } from 'vitest'
import { sanitizeMoqTiers, type SanitizedMoqTier } from '@/lib/telegram/schema'

// @finance — un palier extrait ne doit JAMAIS devenir un prix public sans
// modération. RÈGLE MÉTIER (Abdou) : 1er palier = minimum de commande, prix
// STRICTEMENT décroissant quand la quantité monte. Toute incohérence de l'échelle
// → SET ENTIER rejeté ([]). On n'invente ni ne devine jamais.

const LADDER = [
  { min_quantity: 10, unit_price: 20 },
  { min_quantity: 50, unit_price: 18 },
  { min_quantity: 100, unit_price: 16 },
  { min_quantity: 500, unit_price: 14 },
]

describe('sanitizeMoqTiers — cas nominal', () => {
  it('accepte une échelle dégressive valide et la renvoie triée', () => {
    expect(sanitizeMoqTiers(LADDER)).toEqual(LADDER)
  })

  it('trie une entrée non ordonnée par min_quantity croissant', () => {
    const shuffled = [LADDER[2], LADDER[0], LADDER[3], LADDER[1]]
    expect(sanitizeMoqTiers(shuffled)).toEqual(LADDER)
  })

  it('accepte un palier unique (minimum seul, sans marche dégressive)', () => {
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: 20 }])).toEqual([
      { min_quantity: 10, unit_price: 20 },
    ])
  })

  it('le 1er palier trié porte le minimum de commande (plus petite quantité)', () => {
    const out = sanitizeMoqTiers(LADDER)
    expect(out[0].min_quantity).toBe(10)
  })
})

describe('sanitizeMoqTiers — décroissance stricte (règle Abdou)', () => {
  it('rejette le SET si le prix CROÎT quand la quantité monte', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 50, unit_price: 22 },
      ]),
    ).toEqual([])
  })

  it('rejette le SET si deux prix sont ÉGAUX (non strictement décroissant)', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 50, unit_price: 20 },
      ]),
    ).toEqual([])
  })

  it('rejette même une croissance sur une seule marche au milieu de l’échelle', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 50, unit_price: 18 },
        { min_quantity: 100, unit_price: 19 }, // remonte → invalide
        { min_quantity: 500, unit_price: 14 },
      ]),
    ).toEqual([])
  })

  it('détecte la croissance APRÈS tri (entrée non triée)', () => {
    // Trié : 10→20, 50→22 ⇒ croissant ⇒ rejet.
    expect(
      sanitizeMoqTiers([
        { min_quantity: 50, unit_price: 22 },
        { min_quantity: 10, unit_price: 20 },
      ]),
    ).toEqual([])
  })
})

describe('sanitizeMoqTiers — doublon de quantité', () => {
  it('rejette le SET si deux paliers ont la même min_quantity', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 10, unit_price: 18 },
      ]),
    ).toEqual([])
  })

  it('rejette le doublon même présenté non trié', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 50, unit_price: 18 },
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 50, unit_price: 16 },
      ]),
    ).toEqual([])
  })
})

describe('sanitizeMoqTiers — palier individuel ÉCARTÉ (pas le set)', () => {
  it('écarte un palier au prix null, garde les valides', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 50, unit_price: null },
      ]),
    ).toEqual([{ min_quantity: 10, unit_price: 20 }])
  })

  it('écarte un palier à la quantité null, garde les valides', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: null, unit_price: 20 },
        { min_quantity: 50, unit_price: 18 },
      ]),
    ).toEqual([{ min_quantity: 50, unit_price: 18 }])
  })

  it('écarte un palier à quantité 0 (min_quantity doit être > 0)', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 0, unit_price: 20 },
        { min_quantity: 50, unit_price: 18 },
      ]),
    ).toEqual([{ min_quantity: 50, unit_price: 18 }])
  })

  it('écarte une quantité négative ou décimale', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: -5, unit_price: 20 },
        { min_quantity: 10.5, unit_price: 19 },
        { min_quantity: 100, unit_price: 16 },
      ]),
    ).toEqual([{ min_quantity: 100, unit_price: 16 }])
  })

  it('écarter un palier ne doit PAS casser la décroissance des restants', () => {
    // Le palier du milieu (prix null) est retiré → 20 > 16 reste décroissant.
    expect(
      sanitizeMoqTiers([
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 50, unit_price: null },
        { min_quantity: 100, unit_price: 16 },
      ]),
    ).toEqual([
      { min_quantity: 10, unit_price: 20 },
      { min_quantity: 100, unit_price: 16 },
    ])
  })
})

describe('sanitizeMoqTiers — valeurs aberrantes (bornes sanitizeExtractedPrice)', () => {
  it('écarte un prix ≤ 0 (plancher 1)', () => {
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: 0 }])).toEqual([])
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: -3 }])).toEqual([])
  })

  it('écarte un prix au-dessus du plafond (1 000 000)', () => {
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: 2_000_000 }])).toEqual([])
  })

  it('écarte un min_quantity au-dessus du plafond de plausibilité', () => {
    expect(sanitizeMoqTiers([{ min_quantity: 5_000_000, unit_price: 20 }])).toEqual([])
  })

  it('écarte un prix non numérique / NaN', () => {
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: 'abc' }])).toEqual([])
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: NaN }])).toEqual([])
  })
})

describe('sanitizeMoqTiers — cap nombre de paliers (max 20)', () => {
  it('accepte exactement 20 paliers dégressifs', () => {
    const twenty: SanitizedMoqTier[] = Array.from({ length: 20 }, (_, i) => ({
      min_quantity: (i + 1) * 10,
      unit_price: 100 - i, // 100, 99, … strictement décroissant
    }))
    expect(sanitizeMoqTiers(twenty)).toHaveLength(20)
  })

  it('rejette le SET au-delà de 20 paliers', () => {
    const twentyOne = Array.from({ length: 21 }, (_, i) => ({
      min_quantity: (i + 1) * 10,
      unit_price: 100 - i,
    }))
    expect(sanitizeMoqTiers(twentyOne)).toEqual([])
  })

  // F1 (@finance) : le cap porte sur la longueur BRUTE (fail-safe / anti-DoS
  // assumé), même si des entrées sont du bruit qui ramènerait les valides ≤ 20.
  it('rejette le SET si le tableau BRUT dépasse 20, même avec du bruit invalide', () => {
    const noisy = [
      ...Array.from({ length: 20 }, (_, i) => ({
        min_quantity: (i + 1) * 10,
        unit_price: 100 - i,
      })),
      null,
      { min_quantity: 0, unit_price: 0 }, // 22 entrées brutes → rejet
    ]
    expect(sanitizeMoqTiers(noisy)).toEqual([])
  })

  it('traite normalement un tableau ≤ 20 contenant du bruit écarté', () => {
    // 20 entrées brutes dont 2 invalides → 18 valides dégressives → acceptées.
    const withNoise = [
      { min_quantity: null, unit_price: 20 }, // écarté
      { min_quantity: 5, unit_price: 'x' }, // écarté
      ...Array.from({ length: 18 }, (_, i) => ({
        min_quantity: (i + 1) * 10,
        unit_price: 100 - i,
      })),
    ]
    expect(sanitizeMoqTiers(withNoise)).toHaveLength(18)
  })
})

describe('sanitizeMoqTiers — cross-check prix de base', () => {
  it('accepte si tiers[0].unit_price === basePrice', () => {
    expect(sanitizeMoqTiers(LADDER, 20)).toEqual(LADDER)
  })

  it('rejette le SET si tiers[0].unit_price !== basePrice', () => {
    expect(sanitizeMoqTiers(LADDER, 19)).toEqual([])
  })

  it('ignore le cross-check si basePrice est null (défaut)', () => {
    expect(sanitizeMoqTiers(LADDER)).toEqual(LADDER)
    expect(sanitizeMoqTiers(LADDER, null)).toEqual(LADDER)
  })
})

describe('sanitizeMoqTiers — entrée tolérante (strings / décimales)', () => {
  it('accepte des quantités et prix en chaîne', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: '10', unit_price: '20' },
        { min_quantity: '50', unit_price: '18' },
      ]),
    ).toEqual([
      { min_quantity: 10, unit_price: 20 },
      { min_quantity: 50, unit_price: 18 },
    ])
  })

  it('désambiguïse un prix décimal en chaîne (« 18,50 »)', () => {
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: '18,50' }])).toEqual([
      { min_quantity: 10, unit_price: 18.5 },
    ])
  })

  it('arrondit à 2 décimales (via sanitizeExtractedPrice, sans parseFloat ajouté)', () => {
    expect(sanitizeMoqTiers([{ min_quantity: 10, unit_price: 20.005 }])).toEqual([
      { min_quantity: 10, unit_price: 20.01 },
    ])
  })
})

describe('sanitizeMoqTiers — entrées vides / non-tableau', () => {
  it('renvoie [] pour un tableau vide', () => {
    expect(sanitizeMoqTiers([])).toEqual([])
  })

  it('renvoie [] si TOUS les paliers sont invalides', () => {
    expect(
      sanitizeMoqTiers([
        { min_quantity: 0, unit_price: 0 },
        { min_quantity: -1, unit_price: 'x' },
      ]),
    ).toEqual([])
  })

  it('renvoie [] pour une valeur non-tableau (null, objet, string, number)', () => {
    expect(sanitizeMoqTiers(null)).toEqual([])
    expect(sanitizeMoqTiers(undefined)).toEqual([])
    expect(sanitizeMoqTiers({ min_quantity: 10, unit_price: 20 })).toEqual([])
    expect(sanitizeMoqTiers('10:20')).toEqual([])
    expect(sanitizeMoqTiers(42)).toEqual([])
  })

  it('ignore les éléments non-objets dans le tableau', () => {
    expect(
      sanitizeMoqTiers([null, 'x', 42, { min_quantity: 10, unit_price: 20 }]),
    ).toEqual([{ min_quantity: 10, unit_price: 20 }])
  })
})
