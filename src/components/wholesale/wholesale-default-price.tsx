// ─── Bloc « Prix de gros » PAR DÉFAUT (AFFICHAGE PUR) ─────────────────────────
// Rendu pour un produit local avec < 2 paliers (WholesaleSavingsHook n'affichant
// rien dans ce cas). Composant SERVEUR PUR : props strictement sérialisables,
// aucun calcul de prix, aucune lecture DB. i18n via getTranslations
// ('wholesale.productDetail'). Chiffres LATINS (cf. formatMAD/formatQty).

import { getTranslations } from 'next-intl/server'
import { formatMAD, formatQty } from '@/lib/utils'
import { priceWithUnit } from '@/lib/units'

export async function WholesaleDefaultPrice({
  sellPrice,
  minQty,
  unitLabel,
}: {
  /** Prix de vente MAD (déjà entier — cf. règle DH entiers). */
  sellPrice: number
  /** Quantité minimum de commande. */
  minQty: number
  /**
   * Libellé d'unité déjà résolu côté SERVEUR (string, jamais une fonction). Si
   * non fourni → défaut = clé i18n `savingsUnit` (« pièces »), cohérent avec
   * WholesaleSavingsHook.
   */
  unitLabel?: string
}) {
  const t = await getTranslations('wholesale.productDetail')
  const unit = unitLabel ?? t('savingsUnit')

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t('defaultPriceTitle')}
      </p>
      <p className="text-2xl font-extrabold text-foreground tabular-nums">
        {priceWithUnit(formatMAD(sellPrice), unitLabel)}
      </p>
      <p className="text-sm text-muted">
        {t('defaultPriceMinOrder', { qty: formatQty(minQty), unit })}
      </p>
      <p className="text-xs text-faint">{t('defaultPriceSingleNote')}</p>
    </div>
  )
}
