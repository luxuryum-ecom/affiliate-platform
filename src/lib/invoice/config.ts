// ─── Identité fiscale du vendeur (émetteur de la facture) ────────────────────
//
// Les identifiants légaux (ICE / RC / IF / Patente / adresse) sont propres à
// l'entité **Mozouna Group** et NE DOIVENT PAS être devinés/inventés : ils sont
// lus depuis l'environnement. Tant qu'ils ne sont pas renseignés, les lignes
// correspondantes sont simplement OMISES de la facture (jamais de faux numéro
// fiscal imprimé). Abdou renseigne les vraies valeurs en variables Vercel avant
// d'émettre de vraies factures.
//
// Le taux de TVA est lui aussi configurable. Défaut = 20 % (taux normal Maroc).
// Quel que soit le taux, le TOTAL TTC de la facture reste égal au montant
// facturé (cf. `compute.ts` → `deriveTotals`) : le taux ne change QUE la
// répartition HT/TVA affichée, jamais le total.

export interface SellerIdentity {
  name: string
  legalForm: string | null
  ice: string | null
  rc: string | null
  taxId: string | null // Identifiant Fiscal (IF)
  patente: string | null
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
}

const env = (key: string): string | null => {
  const v = process.env[key]
  return v && v.trim() ? v.trim() : null
}

/** Identité vendeur résolue depuis l'environnement (placeholders si absents). */
export function getSellerIdentity(): SellerIdentity {
  return {
    name: env('INVOICE_SELLER_NAME') ?? 'Mozouna Group',
    legalForm: env('INVOICE_SELLER_LEGAL_FORM'),
    ice: env('INVOICE_SELLER_ICE'),
    rc: env('INVOICE_SELLER_RC'),
    taxId: env('INVOICE_SELLER_IF'),
    patente: env('INVOICE_SELLER_PATENTE'),
    address: env('INVOICE_SELLER_ADDRESS'),
    city: env('INVOICE_SELLER_CITY'),
    phone: env('INVOICE_SELLER_PHONE'),
    email: env('INVOICE_SELLER_EMAIL'),
  }
}

/**
 * Taux de TVA en % (≥ 0). Lu depuis `INVOICE_VAT_RATE`, défaut 20 (Maroc).
 * Une valeur invalide (négative, non numérique) retombe sur 20 sans planter.
 */
export function getVatRatePercent(): number {
  const raw = process.env.INVOICE_VAT_RATE
  if (raw == null || raw.trim() === '') return 20
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 20
  return n
}
