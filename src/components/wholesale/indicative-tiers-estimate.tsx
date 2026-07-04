// ─── Paliers de gros INDICATIFS — fiche international (AFFICHAGE PUR) ─────────
// Composant SERVEUR PUR : reçoit des paliers MAD déjà dérivés (cf.
// `getIndicativeMadTiers`), AUCUN recalcul, AUCUNE lecture DB. Bandeau
// « estimation » (ton avertissement doux, pas rouge) + tableau 2 colonnes
// Quantité / Prix unitaire estimé (« ≈ » devant chaque prix). JAMAIS de colonne
// « Tu économises » — ce n'est pas ferme, le prix ferme est communiqué au devis.
// i18n via getTranslations ('wholesale.marketplaceDetail'). Chiffres LATINS.

import { getTranslations } from 'next-intl/server'
import { formatSavingMad, formatSavingQty } from '@/lib/wholesale-savings'
import { priceWithUnit } from '@/lib/units'

export async function IndicativeTiersEstimate({
  tiers,
  unitLabel,
}: {
  tiers: { min_qty: number; price_per_unit: number }[]
  /** Libellé d'unité déjà résolu côté SERVEUR (string, jamais une fonction). */
  unitLabel?: string
}) {
  if (tiers.length < 2) return null // garde-fou (appelant filtre déjà, défense en profondeur)

  const t = await getTranslations('wholesale.marketplaceDetail')
  const unit = unitLabel ? ` ${unitLabel}` : ''
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty)

  return (
    <div className="rounded-xl border border-warning bg-warning-soft px-4 py-4 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-warning-fg">
          {t('indicativeTiersTitle')}
        </p>
        <p className="mt-1 text-xs text-muted leading-relaxed">
          {t('indicativeTiersBanner')}
        </p>
      </div>

      <table className="w-full text-sm border-t border-warning/40">
        <thead>
          <tr className="text-xs text-muted">
            <th className="text-start font-medium py-1.5">{t('indicativeColQty')}</th>
            <th className="text-end font-medium py-1.5">{t('indicativeColUnitPrice')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tier) => (
            <tr key={tier.min_qty} className="border-t border-warning/20">
              <td className="py-1.5 text-foreground">
                {formatSavingQty(tier.min_qty)}
                {unit}
              </td>
              <td className="py-1.5 text-end font-medium text-foreground tabular-nums">
                ≈ {priceWithUnit(formatSavingMad(tier.price_per_unit), unitLabel)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
