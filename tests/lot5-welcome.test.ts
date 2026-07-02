// ─── LOT 5 — Message d'accueil fournisseur (bot Telegram) — module PUR ──────
// Aucune I/O, aucune DB : teste uniquement src/lib/telegram/welcome.ts.
// pickWelcomeLang (routage darija/msa/fr/en) + buildSupplierWelcome (contenu du texte).
// LOT 5 étend le message d'accueil de 2 à 4 langues :
//   'ar-MA' → darija ; 'ar*' (autre) → msa ; 'fr*' → fr ; reste → en (fallback).
// ⚠️ Ordre de match critique : 'ar-MA' DOIT être testé avant le 'ar' générique,
// sinon la darija ne se déclenche jamais (couverte explicitement ci-dessous).

import { describe, it, expect } from 'vitest'
import { pickWelcomeLang, buildSupplierWelcome } from '@/lib/telegram/welcome'

describe('LOT 5 — pickWelcomeLang', () => {
  it("'ar-MA' → 'darija'", () => {
    expect(pickWelcomeLang('ar-MA')).toBe('darija')
  })

  it("'ar-ma' (casse basse) → 'darija'", () => {
    expect(pickWelcomeLang('ar-ma')).toBe('darija')
  })

  it("'ar-MA' NE tombe PAS dans 'msa' (ordre de match testé explicitement)", () => {
    expect(pickWelcomeLang('ar-MA')).not.toBe('msa')
  })

  it("'ar' (générique, sans région) → 'msa'", () => {
    expect(pickWelcomeLang('ar')).toBe('msa')
  })

  it("'ar-AE' → 'msa'", () => {
    expect(pickWelcomeLang('ar-AE')).toBe('msa')
  })

  it("'ar-EG' → 'msa'", () => {
    expect(pickWelcomeLang('ar-EG')).toBe('msa')
  })

  it("'AR' (casse haute, générique) → 'msa'", () => {
    expect(pickWelcomeLang('AR')).toBe('msa')
  })

  it("'fr' → 'fr'", () => {
    expect(pickWelcomeLang('fr')).toBe('fr')
  })

  it("'fr-FR' → 'fr'", () => {
    expect(pickWelcomeLang('fr-FR')).toBe('fr')
  })

  it("'en' → 'en'", () => {
    expect(pickWelcomeLang('en')).toBe('en')
  })

  it("'tr' → 'en' (fallback international)", () => {
    expect(pickWelcomeLang('tr')).toBe('en')
  })

  it("'zh' → 'en' (fallback international)", () => {
    expect(pickWelcomeLang('zh')).toBe('en')
  })

  it('undefined → en (fallback)', () => {
    expect(pickWelcomeLang(undefined)).toBe('en')
  })

  it('null → en (fallback)', () => {
    expect(pickWelcomeLang(null)).toBe('en')
  })

  it("'' (chaîne vide) → en (fallback)", () => {
    expect(pickWelcomeLang('')).toBe('en')
  })
})

const WHATSAPP_PHONE = '212600000000'

// Contenu commun aux 4 langues : les paliers 50/18, 200/16, 500/14 en chiffres LATINS
// dans cet ordre, plus le lien wa.me. NB : le mot-unité varie selon la langue
// (« pcs » en FR/EN, mais l'unité est traduite en arabe pour darija/MSA — « قطعة »/
// « حبة » — seuls les CHIFFRES restent latins, cf. règle i18n numéraux). On vérifie
// donc les nombres et leur ordre, pas la chaîne littérale "pcs" (spécifique fr/en).
function expectCommonContent(text: string) {
  const m50 = text.match(/50\s*\S*\s*=\s*18/)
  const m200 = text.match(/200\s*\S*\s*=\s*16/)
  const m500 = text.match(/500\s*\S*\s*=\s*14/)
  expect(m50).not.toBeNull()
  expect(m200).not.toBeNull()
  expect(m500).not.toBeNull()
  // Ordre croissant de quantité dans le texte lui-même (palier 50 avant 200 avant 500).
  // On utilise l'index du MATCH du palier (pas un indexOf('200') brut, qui accrocherait
  // aussi le prix unitaire d'exemple "200 DH"/"200 درهم" mentionné plus haut dans le texte).
  const i50 = text.indexOf(m50![0])
  const i200 = text.indexOf(m200![0])
  const i500 = text.indexOf(m500![0])
  expect(i200).toBeGreaterThan(i50)
  expect(i500).toBeGreaterThan(i200)
  expect(text).toContain(`https://wa.me/${WHATSAPP_PHONE}`)
  // Chiffres en numéraux latins uniquement (jamais de chiffres arabes-indic U+0660–0669).
  expect(text).not.toMatch(/[٠-٩]/)
}

// Contenu spécifique fr/en : littéralement "N pcs = M" (unité non traduite).
function expectPcsContent(text: string) {
  expect(text).toContain('50 pcs = 18')
  expect(text).toContain('200 pcs = 16')
  expect(text).toContain('500 pcs = 14')
}

describe('LOT 5 — buildSupplierWelcome (darija / ar-MA)', () => {
  const text = buildSupplierWelcome('ar-MA', WHATSAPP_PHONE)

  it('contient une consigne photo', () => {
    expect(text).toMatch(/تصويرة|صورة/)
  })

  it('contient les paliers dégressifs + le lien wa.me (contenu commun)', () => {
    expectCommonContent(text)
  })

  it('contient de l’arabe (darija)', () => {
    expect(text).toMatch(/[؀-ۿ]/)
  })
})

describe('LOT 5 — buildSupplierWelcome (msa / ar-AE)', () => {
  const text = buildSupplierWelcome('ar-AE', WHATSAPP_PHONE)

  it('contient une consigne photo', () => {
    expect(text).toMatch(/صورة/)
  })

  it('contient les paliers dégressifs + le lien wa.me (contenu commun)', () => {
    expectCommonContent(text)
  })

  it('contient de l’arabe (MSA)', () => {
    expect(text).toMatch(/[؀-ۿ]/)
  })
})

describe('LOT 5 — buildSupplierWelcome (fr)', () => {
  const text = buildSupplierWelcome('fr', WHATSAPP_PHONE)

  it('contient une consigne photo', () => {
    expect(text.toLowerCase()).toMatch(/photo/)
  })

  it('contient les paliers dégressifs + le lien wa.me (contenu commun)', () => {
    expectCommonContent(text)
  })

  it('paliers au format littéral "N pcs = M"', () => {
    expectPcsContent(text)
  })

  it('mentionne la devise', () => {
    expect(text.toLowerCase()).toMatch(/devise/)
  })
})

describe('LOT 5 — buildSupplierWelcome (en)', () => {
  const text = buildSupplierWelcome('en', WHATSAPP_PHONE)

  it('contient une consigne photo', () => {
    expect(text.toLowerCase()).toMatch(/photo/)
  })

  it('contient les paliers dégressifs + le lien wa.me (contenu commun)', () => {
    expectCommonContent(text)
  })

  it('paliers au format littéral "N pcs = M"', () => {
    expectPcsContent(text)
  })

  it('mentionne "currency"', () => {
    expect(text.toLowerCase()).toMatch(/currency/)
  })
})

describe('LOT 5 — les 4 textes sont distincts deux à deux', () => {
  const darija = buildSupplierWelcome('ar-MA', WHATSAPP_PHONE)
  const msa = buildSupplierWelcome('ar-AE', WHATSAPP_PHONE)
  const fr = buildSupplierWelcome('fr', WHATSAPP_PHONE)
  const en = buildSupplierWelcome('en', WHATSAPP_PHONE)
  const variants: [string, string][] = [
    ['darija', darija],
    ['msa', msa],
    ['fr', fr],
    ['en', en],
  ]

  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const [nameA, textA] = variants[i]
      const [nameB, textB] = variants[j]
      it(`${nameA} ≠ ${nameB}`, () => {
        expect(textA).not.toBe(textB)
      })
    }
  }
})

describe('LOT 5 — buildSupplierWelcome suit le paramètre whatsappPhone', () => {
  it('un autre numéro produit un autre lien wa.me (fr)', () => {
    const text = buildSupplierWelcome('fr', '212700000000')
    expect(text).toContain('https://wa.me/212700000000')
    expect(text).not.toContain('https://wa.me/212600000000')
  })

  it('un autre numéro produit un autre lien wa.me (en)', () => {
    const text = buildSupplierWelcome('en', '212700000000')
    expect(text).toContain('https://wa.me/212700000000')
    expect(text).not.toContain('https://wa.me/212600000000')
  })

  it('un autre numéro produit un autre lien wa.me (darija)', () => {
    const text = buildSupplierWelcome('ar-MA', '212700000000')
    expect(text).toContain('https://wa.me/212700000000')
    expect(text).not.toContain('https://wa.me/212600000000')
  })

  it('un autre numéro produit un autre lien wa.me (msa)', () => {
    const text = buildSupplierWelcome('ar-AE', '212700000000')
    expect(text).toContain('https://wa.me/212700000000')
    expect(text).not.toContain('https://wa.me/212600000000')
  })
})
