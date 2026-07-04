import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { PlatformMarginType, WholesaleTier } from '@/types/database'

/** Merge Tailwind classes safely — resolves conflicts in priority order. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compute the platform selling price from factory cost and margin.
 *
 * percentage: platform_price = factory_cost × (1 + value / 100)
 * fixed:      platform_price = factory_cost + value
 *
 * Result is rounded to whole MAD (no decimals) per business model.
 */
export function calculatePlatformPrice(
  factoryCostMad: number,
  marginType: PlatformMarginType,
  marginValue: number
): number {
  const raw =
    marginType === 'percentage'
      ? factoryCostMad * (1 + marginValue / 100)
      : factoryCostMad + marginValue
  return Math.round(raw)
}

/**
 * Plancher de frais de livraison (MAD) — différencié par zone.
 *
 * Règle métier non négociable : la livraison est TOUJOURS payée par l'affilié,
 * déduite de sa commission — jamais 0. Toute résolution de frais de livraison
 * est planchée à ces valeurs (D1) :
 *   - Casablanca (hub)      → 25 MAD
 *   - Reste du Maroc / défaut → 35 MAD
 */
export const MIN_DELIVERY_FEE_MAD = 35
export const MIN_DELIVERY_FEE_CASABLANCA_MAD = 25

/**
 * Provision livraison fixe incluse dans le capital/prix catalogue affilié.
 * Utilisée comme deliveryFee dans le calcul de commission pour ne compter
 * la livraison qu'une seule fois : prix catalogue = usine + marge + packaging
 * + confirmation + DELIVERY_PROVISION_MAD. Commission = prix_vente − capital.
 * NE PAS cumuler avec la livraison par ville dans le même calcul de commission.
 */
export const DELIVERY_PROVISION_MAD = 35

/**
 * Compute the net affiliate commission per unit.
 *
 * net = affiliate_sell_price
 *       − factory_cost
 *       − platform_margin
 *       − packaging_fee
 *       − delivery_fee
 *       − confirmation_fee   (incluse dans le capital — ne JAMAIS passer 0)
 *
 * Returns the total for the given quantity (can be negative if sell_price is too low).
 */
export function calculateNetAffiliateCommission(params: {
  affiliateSellPrice: number
  factoryCostMad: number
  marginType: PlatformMarginType
  marginValue: number
  packagingFee: number
  deliveryFee: number
  /** La confirmation est incluse dans le capital ; ne JAMAIS passer 0 ici.
   *  La pré-confirmation (is_pre_confirmed) est gérée au niveau commande
   *  (Option A : plateforme garde les 10 MAD), elle NE modifie PAS ce calcul. */
  confirmationFee: number
  quantity: number
}): number {
  // Option B (capital exact) — on soustrait le PRIX PLATEFORME ARRONDI
  // (calculatePlatformPrice = usine + marge, même arrondi half-up que le capital
  // catalogue), et NON `usine + marge_non_arrondie`. Garantit commission =
  // prix_vente − capital EXACTEMENT → 0 pile au prix catalogue, jamais de fraction
  // de MAD versée par erreur d'arrondi (audit @finance, GO Abdou).
  const platformPrice = calculatePlatformPrice(
    params.factoryCostMad,
    params.marginType,
    params.marginValue
  )

  const netPerUnit =
    params.affiliateSellPrice -
    platformPrice -
    params.deliveryFee -
    params.confirmationFee -
    params.packagingFee

  // Commission arrondie au centime sans parseFloat : Math.round sur la valeur
  // mise à l'échelle ×100 absorbe l'erreur flottante du calcul (netPerUnit est
  // fractionnaire — la marge en % produit des décimales arbitraires).
  return Math.round(netPerUnit * params.quantity * 100) / 100
}

/**
 * Borne le `max_qty` d'un tableau de paliers grossiste TRIÉS croissants par `min_qty`
 * — correctif de la SURFACTURATION du catalogue.
 *
 * PROBLÈME : `getWholesaleTier` (.find) renvoie le PREMIER palier dont `min_qty ≤ quantité`
 * et (`max_qty` absent OU `quantité ≤ max_qty`). Un palier NON-dernier SANS `max_qty` capte
 * donc TOUTES les grandes quantités → le 1er palier (le plus cher) est facturé au lieu du
 * palier volume attendu → le prix facturé ≠ le prix affiché.
 *
 * CORRECTIF : chaque palier reçoit `max_qty = (min_qty du palier suivant − 1)` ; le DERNIER
 * palier reste ouvert (`max_qty` retiré / undefined, conformément à l'invariant WholesaleTier).
 * Logique IDENTIQUE au bornage de `buildMirrorTiers` (canal fournisseur, déjà sûr) — répliquée
 * ici et NON partagée pour ne pas toucher `buildMirrorTiers`.
 *
 * PUR et IDEMPOTENT : des paliers déjà bornés (`max_qty = min suivant − 1`) restent identiques.
 * N'altère JAMAIS `min_qty` ni `price_per_unit` (aucun prix touché — RÈGLE ARGENT).
 * PRÉREQUIS : `tiers` trié croissant par `min_qty`, sans doublon (garanti par l'appelant).
 */
export function boundWholesaleTierMaxQty(tiers: WholesaleTier[]): WholesaleTier[] {
  return tiers.map((tier, i, arr) =>
    i < arr.length - 1
      ? { min_qty: tier.min_qty, max_qty: arr[i + 1].min_qty - 1, price_per_unit: tier.price_per_unit }
      : { min_qty: tier.min_qty, price_per_unit: tier.price_per_unit },
  )
}

/**
 * Calculate the matching wholesale tier for a given quantity.
 * Returns the matching tier or null if below minimum or no tiers defined.
 */
export function getWholesaleTier(
  tiers: Array<{ min_qty: number; max_qty?: number; price_per_unit: number }>,
  quantity: number
): { price_per_unit: number; label: string } | null {
  if (!tiers.length || quantity <= 0) return null

  const match = tiers.find(
    (t) => quantity >= t.min_qty && (t.max_qty === undefined || quantity <= t.max_qty)
  )
  if (!match) return null

  const label = match.max_qty
    ? `${match.min_qty}–${match.max_qty} unités @ ${match.price_per_unit} MAD/u`
    : `${match.min_qty}+ unités @ ${match.price_per_unit} MAD/u`

  return { price_per_unit: match.price_per_unit, label }
}

/** Format a number in the given ISO 4217 currency (default MAD).
 *
 * Le résultat est entouré d'isolats bidi Unicode (FSI U+2068 … PDI U+2069) :
 * en contexte RTL (arabe), le montant « 30,40 MAD » reste affiché dans le bon
 * ordre au lieu d'être réordonné en « MAD 30,40 ». Invisible en LTR. Chiffres
 * latins conservés (locale fr-MA). */
export function formatCurrency(amount: number, currency: string = 'MAD'): string {
  const formatted = new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
  return `⁨${formatted}⁩`
}

/** Format a number as Moroccan dirham. Thin wrapper over formatCurrency. */
export function formatMAD(amount: number): string {
  return formatCurrency(amount, 'MAD')
}

/** Format a number with the « DH » label (fiche affilié — cible commerçant).
 *  ≠ formatMAD : suffixe « DH » (pas le code ISO « MAD ») et AUCUNE décimale forcée
 *  (60 → « 60 DH » ; 149,5 → « 149,5 DH »). Isolats bidi (FSI/PDI) pour le RTL,
 *  chiffres latins (fr-MA). AFFICHAGE SEUL — n'altère aucune valeur ni calcul. */
export function formatDH(amount: number): string {
  const n = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 }).format(amount)
  return `⁨${n} DH⁩`
}

/** Format a plain QUANTITY (no currency) with bidi isolation + latin digits.
 *  Pour les nombres NON monétaires (MOQ, stock…) affichés à côté d'une unité en
 *  contexte RTL : l'isolat FSI/PDI empêche le réordonnancement. N'AJOUTE PAS « MAD »
 *  (≠ formatMAD) — c'est une quantité, pas un montant. */
export function formatQty(n: number): string {
  return `⁨${new Intl.NumberFormat('fr-MA').format(n)}⁩`
}
