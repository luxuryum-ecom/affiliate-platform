// Déclarations ambiantes pour les libs de façonnage arabe des relevés PDF (Lot F).
// Ces paquets (CommonJS purs) n'embarquent pas de types. Surface minimale utilisée
// par src/lib/statements/pdf-fonts.ts.

declare module 'bidi-js' {
  interface BidiApi {
    getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl' | 'auto'): unknown
    getReorderSegments(text: string, embeddingLevels: unknown): [number, number][]
  }
  const bidiFactory: () => BidiApi
  export default bidiFactory
}

declare module 'arabic-persian-reshaper' {
  export const ArabicShaper: { convertArabic(input: string): string }
  export const PersianShaper: { convertArabic(input: string): string }
  const _default: {
    ArabicShaper: { convertArabic(input: string): string }
    PersianShaper: { convertArabic(input: string): string }
  }
  export default _default
}
