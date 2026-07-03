// ─── Messages bot fournisseur (4 langues) — module PUR ───────────────────────
// Vérifie le ROUTAGE par language_code (mêmes règles que welcome.ts via
// pickWelcomeLang), la non-vacuité des 4 langues, l'interpolation des variables,
// la structure du composite « produit reçu », les 3 variantes de ligne prix, et
// le caractère GUIDANT des messages d'erreur (ils orientent vers l'action).
// Aucune DB, aucun réseau, aucun secret : fonctions pures.

import { describe, it, expect } from 'vitest'
import {
  msgLinkCodeInvalid,
  msgAlreadyLinked,
  msgCodeNotFound,
  msgCodeExpired,
  msgLinkFailed,
  msgLinkedSuccess,
  msgNotLinkedYet,
  msgRateLimited,
  msgNoCountry,
  msgLimitReached,
  msgPriceWithMad,
  msgPriceNoRate,
  msgPriceUnknown,
  msgProductReceived,
  msgAnalysisFailed,
  msgGuide,
} from '@/lib/telegram/messages'

// Toutes les fonctions « simples » (langue seule) pour les tests génériques.
const SIMPLE = [
  msgLinkCodeInvalid,
  msgAlreadyLinked,
  msgCodeNotFound,
  msgCodeExpired,
  msgLinkFailed,
  msgLinkedSuccess,
  msgNotLinkedYet,
  msgRateLimited,
  msgNoCountry,
  msgPriceUnknown,
  msgAnalysisFailed,
  msgGuide,
]

const ARABIC = /[؀-ۿ]/

describe('messages bot — non-vacuité dans les 4 langues', () => {
  const codes = ['fr', 'en', 'ar', 'ar-MA', 'ar-AE', 'tr', undefined, null] as const
  for (const fn of SIMPLE) {
    it(`${fn.name} : renvoie du texte non vide pour toute langue`, () => {
      for (const c of codes) {
        const out = fn(c as string | null | undefined)
        expect(typeof out).toBe('string')
        expect(out.trim().length).toBeGreaterThan(0)
      }
    })
  }
})

describe('messages bot — routage par language_code (ar-MA=darija ≠ ar=fus\'ha)', () => {
  it('ar-MA → darija, distinct de ar (fus\'ha)', () => {
    // msgAlreadyLinked diffère entre darija et fus'ha.
    expect(msgAlreadyLinked('ar-MA')).not.toBe(msgAlreadyLinked('ar'))
    // Les deux sont en arabe.
    expect(msgAlreadyLinked('ar-MA')).toMatch(ARABIC)
    expect(msgAlreadyLinked('ar')).toMatch(ARABIC)
  })

  it('ar-AE → fus\'ha (comme ar générique)', () => {
    expect(msgCodeExpired('ar-AE')).toBe(msgCodeExpired('ar'))
  })

  it('fr et en sont distincts et non arabes', () => {
    expect(msgGuide('fr')).not.toBe(msgGuide('en'))
    expect(msgGuide('fr')).not.toMatch(ARABIC)
  })

  it('langue non gérée (tr) et absente → fallback EN', () => {
    expect(msgGuide('tr')).toBe(msgGuide('en'))
    expect(msgGuide(undefined)).toBe(msgGuide('en'))
  })
})

describe('messages bot — messages d\'erreur GUIDANTS (orientent vers l\'action)', () => {
  it('lien expiré/invalide/introuvable → renvoient vers « Activer sur Telegram » (fr) / تيليغرام (ar)', () => {
    for (const fn of [msgCodeExpired, msgCodeNotFound, msgLinkCodeInvalid]) {
      expect(fn('fr')).toContain('Activer sur Telegram')
      expect(fn('ar-MA')).toContain('تيليغرام')
    }
  })

  it('compte non lié → guide vers la connexion puis renvoi de la photo', () => {
    expect(msgNotLinkedYet('fr')).toContain('Activer sur Telegram')
    expect(msgNotLinkedYet('en')).toContain('Activate on Telegram')
  })

  it('déjà connecté → dit quoi faire ensuite (envoyer une photo)', () => {
    expect(msgAlreadyLinked('fr').toLowerCase()).toContain('photo')
  })
})

describe('messages bot — interpolation & composite', () => {
  it('msgLimitReached interpole current/max/plan (numéraux latins)', () => {
    const out = msgLimitReached('fr', { current: 12, max: 20, plan: 'Pro' })
    expect(out).toContain('12/20')
    expect(out).toContain('Pro')
  })

  it('msgProductReceived assemble en-tête + nom + catégorie + ligne prix + pied', () => {
    const priceLine = msgPriceUnknown('fr')
    const out = msgProductReceived('fr', {
      productName: 'Ceinture cuir',
      category: 'Mode',
      subcategory: 'Accessoires',
      priceLine,
    })
    expect(out).toContain('Ceinture cuir')
    expect(out).toContain('Mode / Accessoires')
    expect(out).toContain(priceLine)
    expect(out).toContain('Produit reçu ✅')
    expect(out.split('\n').length).toBeGreaterThanOrEqual(5)
  })

  it('msgProductReceived sans sous-catégorie n\'affiche pas le séparateur " / "', () => {
    const out = msgProductReceived('fr', {
      productName: 'X',
      category: 'Mode',
      subcategory: null,
      priceLine: msgPriceUnknown('fr'),
    })
    expect(out).toContain('• Catégorie : Mode\n')
    expect(out).not.toContain('Mode /')
  })
})

describe('messages bot — lignes prix (3 variantes, tolérance null)', () => {
  it('converti MAD', () => {
    expect(msgPriceWithMad('fr', { price: 20, currency: 'MAD', mad: 20 })).toBe('Prix : 20 MAD ≈ 20 DH')
    expect(msgPriceWithMad('en', { price: 20, currency: 'AED', mad: 54 })).toBe('Price: 20 AED ≈ 54 MAD')
  })

  it('taux non configuré', () => {
    expect(msgPriceNoRate('fr', { price: 18, currency: 'AED' })).toContain('18 AED')
    expect(msgPriceNoRate('fr', { price: 18, currency: 'AED' })).toContain('taux')
  })

  it('tolère price/currency null → pas de "null" affiché', () => {
    const out = msgPriceWithMad('fr', { price: null, currency: null, mad: null })
    expect(out).not.toContain('null')
    expect(out).toContain('?')
  })

  it('non détecté', () => {
    expect(msgPriceUnknown('en')).toBe('Price: not detected (to be completed)')
  })
})
