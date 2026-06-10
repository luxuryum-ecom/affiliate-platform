// ─── Pays fournisseur autorisés (compte) → devise de saisie ─────────────────
// Pur (aucun import serveur) — utilisable côté client (form) ET serveur (auth).
// Les codes DOIVENT exister dans la table `countries` (seed migration 050).
// La devise est dérivée côté DB de countries.operational_currency ; ce mapping
// n'est qu'un repère d'affichage, cohérent avec le seed.

export type SupplierCountry = {
  code: string
  label: string
  currency: string
  flag: string
}

export const SUPPLIER_COUNTRIES: readonly SupplierCountry[] = [
  { code: 'MA', label: 'Maroc', currency: 'MAD', flag: '🇲🇦' },
  { code: 'AE', label: 'Dubaï / Émirats', currency: 'AED', flag: '🇦🇪' },
  { code: 'EG', label: 'Égypte', currency: 'USD', flag: '🇪🇬' },
  { code: 'TR', label: 'Turquie', currency: 'USD', flag: '🇹🇷' },
]

export const SUPPLIER_COUNTRY_CODES: readonly string[] = SUPPLIER_COUNTRIES.map((c) => c.code)

export function isSupplierCountryCode(code: string | null | undefined): boolean {
  return !!code && SUPPLIER_COUNTRY_CODES.includes(code)
}
