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

// ── Unités de CONDITIONNEMENT (pack_unit) — affichage pur, traduit + accordé ────
// Le pack_unit est du texte LIBRE (saisi admin / extrait IA). S'il correspond à une
// unité CONNUE, on l'affiche traduit (i18n) ET accordé en nombre (pluriel) ; sinon
// on garde le texte BRUT tel quel (fallback sûr). N'ALTÈRE JAMAIS la valeur stockée.

export const PACK_UNITS = ['boite', 'sac', 'carton', 'piece', 'paquet', 'kg', 'metre'] as const
export type PackUnit = (typeof PACK_UNITS)[number]
/** Clé i18n d'une unité de conditionnement (namespace 'units'). */
export type PackUnitKey = `pu_${PackUnit}`

// Variantes FR / arabe / darija / EN courantes → clé canonique. Inconnu → texte brut.
const PACK_UNIT_ALIASES: Record<string, PackUnit> = {
  boite: 'boite', 'boîte': 'boite', boites: 'boite', 'boîtes': 'boite', box: 'boite', boxes: 'boite', 'علبة': 'boite', 'علب': 'boite',
  sac: 'sac', sacs: 'sac', sachet: 'sac', sachets: 'sac', bag: 'sac', bags: 'sac', 'كيس': 'sac', 'أكياس': 'sac',
  carton: 'carton', cartons: 'carton', caisse: 'carton', caisses: 'carton', 'كرطونة': 'carton', 'صندوق': 'carton',
  piece: 'piece', 'pièce': 'piece', pieces: 'piece', 'pièces': 'piece', pcs: 'piece', pc: 'piece', 'قطعة': 'piece',
  paquet: 'paquet', paquets: 'paquet', pack: 'paquet', packs: 'paquet', 'حزمة': 'paquet',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', 'كغ': 'kg', 'كيلو': 'kg',
  metre: 'metre', 'mètre': 'metre', metres: 'metre', 'mètres': 'metre', meter: 'metre', meters: 'metre', 'متر': 'metre',
}

/**
 * Normalise un nom d'unité de conditionnement brut vers l'enum canonique.
 * Inconnu / vide / null → null (l'appelant gardera alors le texte brut).
 */
export function normalizePackUnit(raw: string | null | undefined): PackUnit | null {
  if (!raw) return null
  return PACK_UNIT_ALIASES[raw.trim().toLowerCase()] ?? null
}

/**
 * Libellé d'affichage d'une unité de conditionnement, traduit + accordé au nombre.
 * - unité CONNUE → traduction i18n `pu_<canonique>` (pluriel géré par ICU selon `count`) ;
 * - terme LIBRE inconnu → texte brut tel quel (fallback sûr, jamais d'erreur).
 * `t` = traducteur du namespace 'units'. AFFICHAGE PUR — n'altère jamais le stocké.
 */
export function resolvePackUnitLabel(
  raw: string | null | undefined,
  count: number,
  t: (key: PackUnitKey, values?: { count: number }) => string,
): string {
  const canon = normalizePackUnit(raw)
  if (!canon) return (raw ?? '').trim()
  return t(`pu_${canon}`, { count })
}

// ── Conditionnement DESCRIPTIF (P3) — prix/unité-de-cond. DÉRIVÉ à l'affichage ──
// JAMAIS stocké, JAMAIS facturé. On facture toujours au prix de l'unité de vente.

/**
 * Prix DÉRIVÉ par unité de conditionnement = prix ÷ pack_size, arrondi 2 décimales.
 * Retourne null (→ on n'affiche PAS le « ≈ prix/boîte ») si :
 *   - pas de pack_size exploitable (null, ≤ 1, non fini),
 *   - prix non fini / ≤ 0,
 *   - résultat non fini / ≤ 0.
 * AFFICHAGE PUR — aucune écriture, aucun impact facturation/checkout.
 */
export function packPerUnitPrice(
  price: number | null | undefined,
  packSize: number | null | undefined,
): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null
  if (packSize == null || !Number.isFinite(packSize) || packSize <= 1) return null
  const per = Math.round((price / packSize) * 100) / 100
  return Number.isFinite(per) && per > 0 ? per : null
}
