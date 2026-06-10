// ─── Sécurité CSV (source non fiable) — anti-injection + bornes ──────────────
// Cadrage @security A1/A2. Pur, sans I/O, testable.

// Bornes de fichier (avant tout parsing).
export const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_CSV_ROWS = 5000

// En-têtes dangereux (pollution de prototype) → rejet du fichier.
export const FORBIDDEN_HEADERS = ['__proto__', 'constructor', 'prototype'] as const

/**
 * Anti CSV-injection (formula injection Excel/Sheets).
 * Toute cellule dont le 1er caractère est `= + - @`, une tabulation/retour
 * chariot, OU des espaces de tête suivis d'un caractère de formule, est
 * neutralisée par préfixe `'`. Aucune formule n'est jamais évaluée.
 * À appliquer à la LECTURE (avant insertion) ET à tout ré-export.
 */
export function sanitizeCsvCell(value: string): string {
  if (typeof value !== 'string' || value === '') return value
  if (/^[=+\-@\t\r]/.test(value) || /^\s+[=+\-@]/.test(value)) {
    return `'${value}`
  }
  return value
}

/**
 * Détection grossière d'un faux CSV (binaire déguisé : PNG/ZIP/PDF/…).
 * Rejette si octets de contrôle non-texte (hors \t \r \n) dans le préfixe.
 */
export function looksLikeBinary(text: string): boolean {
  const sample = text.slice(0, 4096)
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c === 0) return true // NUL → binaire
    if (c < 9 || (c > 13 && c < 32)) return true // contrôle non-texte
  }
  return false
}

/** En-tête sûr ? (rejette les clés de pollution de prototype) */
export function hasForbiddenHeader(headers: string[]): boolean {
  return headers.some((h) => (FORBIDDEN_HEADERS as readonly string[]).includes(h.trim().toLowerCase()))
}
