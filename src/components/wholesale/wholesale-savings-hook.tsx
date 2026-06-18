// ─── Hook grossiste « économie totale en achetant gros » (AFFICHAGE PUR) ─────
// Composant SERVEUR : lit les `wholesale_tiers` DÉJÀ stockés et affiche un tableau
// CLAIR à 3 colonnes — Quantité / Prix du lot (ce que le client paie) / Tu économises —
// pour lever toute ambiguïté (un montant nu pourrait être pris pour le prix). Aucun
// calcul de prix serveur, aucune donnée sensible. Garde-fou : < 2 paliers exploitables
// → rien. i18n via getTranslations ('wholesale.productDetail'). Chiffres LATINS.

import { getTranslations } from 'next-intl/server'
import type { WholesaleTier } from '@/types/database'
import {
  computeWholesaleSavings,
  formatSavingMad,
  formatSavingQty,
} from '@/lib/wholesale-savings'

export async function WholesaleSavingsHook({ tiers }: { tiers: WholesaleTier[] }) {
  const savings = computeWholesaleSavings(tiers)
  if (!savings) return null // garde-fou : 1 seul palier / pas de tiers / aucune économie

  const t = await getTranslations('wholesale.productDetail')
  const unit = t('savingsUnit')

  return (
    <div className="rounded-xl border border-gold-500/40 bg-warning-soft px-4 py-4 space-y-3">
      {/* Accroche : le gros chiffre est TOUJOURS labellisé « économie », jamais nu. */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-warning-fg">
          {t('savingsTitle')}
        </p>
        <p className="mt-1 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-xs text-muted">{t('savingsUpTo')}</span>
          <span className="text-2xl font-extrabold text-success-fg tabular-nums">
            {formatSavingMad(savings.maxSaving)}
          </span>
          <span className="text-xs text-muted">
            {t('savingsMaxAmountSuffix', {
              qty: formatSavingQty(savings.maxSavingQty),
              unit,
            })}
          </span>
        </p>
      </div>

      {/* Tableau 3 colonnes : Quantité / Prix du lot / Tu économises. */}
      <table className="w-full text-sm border-t border-warning/40">
        <thead>
          <tr className="text-xs text-muted">
            <th className="text-start font-medium py-1.5">{t('savingsColQty')}</th>
            <th className="text-end font-medium py-1.5">{t('savingsColLotPrice')}</th>
            <th className="text-end font-medium py-1.5">{t('savingsColSaving')}</th>
          </tr>
        </thead>
        <tbody>
          {savings.tiers.map((s) => (
            <tr key={s.minQty} className="border-t border-warning/20">
              <td className="py-1.5 text-foreground">
                {formatSavingQty(s.minQty)} {unit}
              </td>
              <td className="py-1.5 text-end font-medium text-foreground tabular-nums">
                {formatSavingMad(s.lotPrice)}
              </td>
              <td className="py-1.5 text-end font-bold text-success-fg tabular-nums">
                {formatSavingMad(s.totalSaving)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
