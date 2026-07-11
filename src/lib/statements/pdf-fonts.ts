// ─── Polices + façonnage arabe pour les relevés PDF (module Livreurs, Lot F) ──
//
// Deux familles :
//   • FR / EN → Helvetica standard (WinAnsi) — léger, gère les accents latins.
//   • AR       → Noto Sans Arabic embarqué (base64) via @pdf-lib/fontkit.
//
// L'arabe dans pdf-lib : arabic-persian-reshaper convertit les lettres en formes de
// présentation LIÉES, dont la sortie est DÉJÀ prête au rendu visuel RTL par pdf-lib
// (vérifié empiriquement — pas de réordonnancement bidi à ajouter, cf. shapeArabic).
// La police arabe embarquée n'ayant PAS de glyphes latins, les runs latins/chiffres
// sont dessinés avec Helvetica (cf. pick()). subset:false obligatoire (le
// sous-ensemble casse le rendu de certains lecteurs PDF sur ces glyphes).

import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import reshaper from 'arabic-persian-reshaper'
import { NOTO_SANS_ARABIC_400_WOFF_BASE64 } from './fonts/noto-arabic'

// arabic-persian-reshaper est CommonJS : l'export nommé passe par l'objet default.
const ArabicShaper: { convertArabic(s: string): string } =
  (reshaper as unknown as { ArabicShaper: { convertArabic(s: string): string } }).ArabicShaper

/** Vrai si la chaîne contient au moins un caractère arabe (blocs Arabic + formes). */
export function hasArabic(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s)
}

// Marques diacritiques arabes (tashkeel/harakat) : optionnelles à la lecture, mais
// elles déclenchent un bug de positionnement GPOS (mark-to-base) dans fontkit@1.1.1
// (getAnchor null → crash au rendu). On les retire — l'arabe non vocalisé est la
// norme d'usage et reste parfaitement lisible. Le façonnage (jointures) est fait par
// le reshaper (formes de présentation), pas par GPOS : aucune liaison perdue.
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g

export function shapeArabic(input: string): string {
  if (!hasArabic(input)) return input
  // La sortie du reshaper est DÉJÀ prête au rendu visuel RTL par pdf-lib (vérifié
  // empiriquement). NE PAS réordonner via bidi par-dessus : cela double-inverse et
  // casse l'ordre des lettres. Les runs latins/chiffres passent par Helvetica
  // (pick()), donc ce qui arrive ici est purement arabe (aucun bidi mixte à gérer).
  return ArabicShaper.convertArabic(input.replace(TASHKEEL, ""))
}

/**
 * Assainit une chaîne pour l'encodage WinAnsi d'Helvetica (FR/EN). Sans ça,
 * `drawText` LÈVE sur tout code point hors Latin-1 (calque invoice/pdf.ts).
 */
export function winAnsi(s: string): string {
  return s
    // Espaces spéciaux (U+00A0, U+2000-200B, U+202F de fr-MA, U+3000, U+FEFF…) -> espace normal.
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, String.fromCharCode(34))
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    // Tout ce qui reste hors WinAnsi imprimable -> « ? » (preserve les accents FR).
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
}

/** Police + chaîne prête à dessiner, résolues selon le CONTENU de la chaîne. */
export interface ResolvedText {
  font: PDFFont
  text: string
}

export interface StatementFonts {
  /** true en mode arabe (RTL + Noto pour les runs arabes). */
  isArabic: boolean
  /**
   * Résout police + chaîne préparée selon le contenu. La police arabe embarquée
   * (Noto, sous-ensemble ARABE UNIQUEMENT) n'a PAS de glyphes latins/chiffres → on
   * dessine les runs latins (chiffres, dates, montants, réfs) avec Helvetica, et
   * seulement les runs arabes avec Noto (façonnés + bidi). En mode FR/EN : toujours
   * Helvetica + assainissement WinAnsi.
   */
  pick(s: string, bold?: boolean): ResolvedText
}

/**
 * Prépare les polices d'un document selon la locale. Pour 'ar', embarque Noto Sans
 * Arabic (fontkit) POUR L'ARABE et Helvetica pour les runs latins ; sinon Helvetica.
 */
export async function embedStatementFonts(
  doc: PDFDocument,
  locale: 'fr' | 'ar' | 'en',
): Promise<StatementFonts> {
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold)

  if (locale === 'ar') {
    doc.registerFontkit(fontkit)
    const bytes = Buffer.from(NOTO_SANS_ARABIC_400_WOFF_BASE64, 'base64')
    // Noto Sans Arabic embarqué : une seule graisse (regular = bold, sûr et lisible).
    const noto = await doc.embedFont(bytes, { subset: false })
    return {
      isArabic: true,
      pick: (s: string): ResolvedText =>
        hasArabic(s) ? { font: noto, text: shapeArabic(s) } : { font: helv, text: winAnsi(s) },
    }
  }
  return {
    isArabic: false,
    pick: (s: string, bold?: boolean): ResolvedText =>
      ({ font: bold ? helvBold : helv, text: winAnsi(s) }),
  }
}
