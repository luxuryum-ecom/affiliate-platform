// ─── Hook grossiste « économie totale en achetant gros » (AFFICHAGE PUR) ─────
// Composant SERVEUR : lit les `wholesale_tiers` DÉJÀ stockés et met en avant
// l'ÉCONOMIE TOTALE (montant global) pour pousser au volume. Aucun calcul de prix
// serveur, aucune donnée sensible. Garde-fou : < 2 paliers exploitables → rien.
// i18n via getTranslations ('wholesale.productDetail'). Chiffres LATINS (locale fixe).

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
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-warning-fg">
          {t('savingsTitle')}
        </p>
        {/* Accroche : LE plus gros montant, en gros chiffre. */}
        <p className="text-2xl font-extrabold text-success-fg tabular-nums mt-1">
          {formatSavingMad(savings.maxSaving)}
        </p>
        <p className="text-xs text-muted">
          {t('savingsMaxAmountSuffix', {
            qty: formatSavingQty(savings.maxSavingQty),
            unit,
          })}
        </p>
      </div>

      {/* Détail par palier : économie TOTALE (lot de min_qty) vs plus petit palier. */}
      <ul className="space-y-1 border-t border-warning/40 pt-2">
        {savings.tiers.map((s) => (
          <li key={s.minQty} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">
              {formatSavingQty(s.minQty)} {unit}
            </span>
            <span className="font-bold text-success-fg tabular-nums">
              {formatSavingMad(s.totalSaving)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
