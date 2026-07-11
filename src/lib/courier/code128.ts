// ─── Encodeur Code 128 (jeu B) — pur JS, sans dépendance ─────────────────────
//
// Génère la suite de largeurs de barres/espaces (en modules) pour un code-barres
// Code 128B, destiné aux étiquettes de livraison (Lot B module Livreurs). Le
// lecteur du portail /courier/scan lit `code_128` (BarcodeDetector natif).
//
// Structure : Start B (104) · données (ASCII 32..126 → valeur c−32) · checksum
// (104 + Σ (i+1)·valeur_i) mod 103 · Stop (106) · barre de terminaison (2 modules).

// Table canonique Code 128 : index = valeur (0..106), motif = 6 largeurs
// (barre,espace,barre,espace,barre,espace), somme = 11 modules.
const PATTERNS: readonly string[] = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','233111',
]
const START_B = 104
const STOP = 106

/**
 * Encode `data` (ASCII imprimable 32..126) en Code 128B et retourne la suite des
 * largeurs de modules, alternant barre/espace en commençant par une BARRE.
 * Lève si un caractère est hors du jeu B.
 */
export function code128Widths(data: string): number[] {
  const values: number[] = []
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 126) throw new Error(`Code128B: caractère non supporté (${code})`)
    values.push(code - 32)
  }
  // Checksum pondéré (mod 103), Start B pèse 1.
  let checksum = START_B
  values.forEach((v, i) => { checksum += v * (i + 1) })
  checksum %= 103

  const sequence = [START_B, ...values, checksum, STOP]
  const widths: number[] = []
  for (const v of sequence) {
    for (const w of PATTERNS[v]) widths.push(Number(w))
  }
  widths.push(2) // barre de terminaison (2 modules)
  return widths
}

/** Vérifie l'intégrité de la table (chaque motif = 11 modules). Utilisé en test. */
export function code128TableIsValid(): boolean {
  return PATTERNS.every((p) => p.length === 6 && p.split('').reduce((s, d) => s + Number(d), 0) === 11)
}
