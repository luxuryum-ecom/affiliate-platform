import { describe, it, expect } from 'vitest'
import {
  classifyPhotoIssue,
  photoIssueDecision,
  type PhotoIssue,
} from '@/lib/telegram/photo-quality'
import { buildCleanExtraction } from '@/lib/telegram/schema'

// ─── C2 — contrôle qualité IA de la photo (flou / non-produit) ───────────────

describe('classifyPhotoIssue — normalisation fail-open', () => {
  it('reconnaît les verdicts standards', () => {
    expect(classifyPhotoIssue('ok')).toBe('ok')
    expect(classifyPhotoIssue('blurry')).toBe('blurry')
    expect(classifyPhotoIssue('not_product')).toBe('not_product')
  })

  it('tolère les synonymes FR/EN et la casse/espaces', () => {
    expect(classifyPhotoIssue('  BLUR ')).toBe('blurry')
    expect(classifyPhotoIssue('Flou')).toBe('blurry')
    expect(classifyPhotoIssue('not_a_product')).toBe('not_product')
    expect(classifyPhotoIssue('NON_PRODUIT')).toBe('not_product')
    expect(classifyPhotoIssue('no_product')).toBe('not_product')
  })

  it('FAIL-OPEN : valeur absente/vide/inattendue/non-string → ok (jamais bloquer un vrai produit)', () => {
    expect(classifyPhotoIssue(undefined)).toBe('ok')
    expect(classifyPhotoIssue(null)).toBe('ok')
    expect(classifyPhotoIssue('')).toBe('ok')
    expect(classifyPhotoIssue('   ')).toBe('ok')
    expect(classifyPhotoIssue('bizarre')).toBe('ok')
    expect(classifyPhotoIssue(42)).toBe('ok')
    expect(classifyPhotoIssue({})).toBe('ok')
  })
})

describe('photoIssueDecision — action d’ingestion', () => {
  it('not_product → BLOQUE la création, pas de signal', () => {
    const d = photoIssueDecision('not_product')
    expect(d.block).toBe(true)
    expect(d.signal).toBeNull()
  })

  it('blurry → crée quand même (vrai produit) + signal de modération', () => {
    const d = photoIssueDecision('blurry')
    expect(d.block).toBe(false)
    expect(d.signal).toBe('blurry_photo')
  })

  it('ok → rien de spécial', () => {
    const d = photoIssueDecision('ok')
    expect(d.block).toBe(false)
    expect(d.signal).toBeNull()
  })

  it('couvre exhaustivement les 3 verdicts', () => {
    const all: PhotoIssue[] = ['ok', 'blurry', 'not_product']
    for (const v of all) expect(() => photoIssueDecision(v)).not.toThrow()
  })
})

describe('buildCleanExtraction — expose photo_issue normalisé', () => {
  const base = {
    product_name: 'Test',
    category: 'Autres',
    subcategory: '',
    description: 'x',
    price: 10,
  }

  it('recopie le verdict de qualité', () => {
    expect(buildCleanExtraction({ ...base, photo_issue: 'blurry' }).photo_issue).toBe('blurry')
    expect(buildCleanExtraction({ ...base, photo_issue: 'not_product' }).photo_issue).toBe('not_product')
  })

  it('absence de verdict → ok (fail-open), n’altère aucun autre champ', () => {
    const clean = buildCleanExtraction({ ...base })
    expect(clean.photo_issue).toBe('ok')
    expect(clean.product_name).toBe('Test')
  })
})
