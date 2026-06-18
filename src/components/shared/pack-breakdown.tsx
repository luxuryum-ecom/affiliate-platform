// ─── Conditionnement DESCRIPTIF (P3) — « carton de 50 boîtes — ≈ 4,00 MAD / boîte »
// Composant SERVEUR, AFFICHAGE PUR. Le prix/unité-de-cond. est DÉRIVÉ (prix ÷ pack_size)
// uniquement ici — jamais stocké, jamais facturé. Rendu UNIQUEMENT si pack_size +
// pack_unit sont posés → produit sans conditionnement = rien affiché (inchangé).

import { getTranslations } from 'next-intl/server'
import { formatMAD } from '@/lib/utils'
import { packPerUnitPrice, resolveUnitLabel } from '@/lib/units'

export async function PackBreakdown({
  price,
  packSize,
  packUnit,
  saleUnit,
}: {
  price: number
  packSize: number | null
  packUnit: string | null
  saleUnit: string | null
}) {
  if (!packSize || !packUnit) return null // garde-fou : pas de conditionnement → rien
  const per = packPerUnitPrice(price, packSize)
  if (per == null) return null

  const t = await getTranslations('units')
  // Unité de vente (« carton ») si posée, sinon « Lot » générique.
  const unitLabel = saleUnit ? resolveUnitLabel(saleUnit, t) : t('lot')

  return (
    <p className="text-xs text-muted">
      {/* size en string → chiffres latins garantis (pas de format locale) */}
      {t('packComposition', { unit: unitLabel, size: String(packSize), packUnit })}
      {' — '}
      {t('packPerUnit', { perUnit: formatMAD(per), packUnit })}
    </p>
  )
}
