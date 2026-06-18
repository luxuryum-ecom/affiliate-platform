// ─── Unités de VENTE (affichage pur) ─────────────────────────────────────────
// Mètre / kg / paquet / pièce / carton. AUCUN calcul ne dépend de l'unité :
// prix, capital, commission, paliers et checkout sont indépendants. Ce module ne
// sert qu'à RÉSOUDRE un label i18n et à construire un suffixe d'affichage.
//
// RÈGLE non-régression : une unité absente (null/''/'pcs') = « pièce » → un produit
// existant s'affiche comme avant. Le suffixe n'est ajouté QUE si l'unité est posée
// explicitement (voir priceWithUnit / l'usage `sale_unit != null` côté pages).

export const SALE_UNITS = ['piece', 'metre', 'kg', 'paquet', 'carton'] as const
export type SaleUnit = (typeof SALE_UNITS)[number]

/**
 * Normalise une valeur d'unité brute (DB ou IA) vers l'enum applicatif.
 * Tolère les héritages ('pcs'), le langage naturel FR/AR courant, et retombe
 * TOUJOURS sur 'piece' (jamais d'erreur) pour une valeur inconnue / vide / null.
 */
export function normalizeSaleUnit(raw: string | null | undefined): SaleUnit {
  if (!raw) return 'piece'
  // Tolère les articles en tête (« le mètre », « la caisse », « au kg ») au cas où
  // l'IA n'aurait pas renvoyé l'enum nu. Robustesse — ne change rien aux tokens nus.
  const v = raw.trim().toLowerCase().replace(/^(le |la |l'|au |du |de |des |un |une )/, '').trim()
  if (['pcs', 'pc', 'piece', 'pièce', 'pieces', 'pièces', 'unité', 'unite', 'u', 'قطعة'].includes(v)) return 'piece'
  if (['metre', 'mètre', 'm', 'meter', 'متر', 'متر'].includes(v)) return 'metre'
  if (['kg', 'kilo', 'kilos', 'kilogramme', 'كغ', 'كيلو'].includes(v)) return 'kg'
  if (['paquet', 'pack', 'sac', 'sachet', 'حزمة', 'كيس'].includes(v)) return 'paquet'
  if (['carton', 'cartons', 'caisse', 'box', 'كرطونة', 'صندوق'].includes(v)) return 'carton'
  return 'piece'
}

/**
 * Label i18n d'une unité. `t` = traducteur du namespace 'units' (getTranslations
 * ou useTranslations). Renvoie une STRING (jamais une fonction → sûr à passer à un
 * Client Component). Valeur inconnue/null → label « pièce ».
 */
export function resolveUnitLabel(
  raw: string | null | undefined,
  t: (key: SaleUnit) => string,
): string {
  return t(normalizeSaleUnit(raw))
}

/**
 * Construit l'affichage prix + suffixe d'unité. Le suffixe n'est ajouté QUE si
 * `unitLabel` est fourni (non-null) → un produit sans unité (sale_unit NULL) reste
 * STRICTEMENT identique à l'affichage actuel (« 40 MAD », sans suffixe).
 * Ex. priceWithUnit('40 MAD', 'kg') = '40 MAD / kg' ; priceWithUnit('40 MAD', null) = '40 MAD'.
 */
export function priceWithUnit(priceFormatted: string, unitLabel: string | null | undefined): string {
  return unitLabel ? `${priceFormatted} / ${unitLabel}` : priceFormatted
}
