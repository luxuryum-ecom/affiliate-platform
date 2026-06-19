// ─── Conditionnement DESCRIPTIF (P3) — « carton de 50 boîtes — ≈ 4,00 MAD / boîte »
// Composant SERVEUR, AFFICHAGE PUR. Le prix/unité-de-cond. est DÉRIVÉ (prix ÷ pack_size)
// uniquement ici — jamais stocké, jamais facturé. Rendu UNIQUEMENT si pack_size +
// pack_unit sont posés → produit sans conditionnement = rien affiché (inchangé).

import { getTranslations } from 'next-intl/server'
import { formatMAD } from '@/lib/utils'
import { packPerUnitPrice, resolveUnitLabel, resolvePackUnitLabel } from '@/lib/units'

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
  // Conditionnement traduit + accordé : PLURIEL pour la composition (« de 50 boîtes »),
  // SINGULIER pour le prix/unité (« / boîte »). Terme inconnu → texte brut conservé.
  const packUnitPlural = resolvePackUnitLabel(packUnit, packSize, t)
  const packUnitSingular = resolvePackUnitLabel(packUnit, 1, t)
  // RTL : le « ≈ » est groupé AVEC la valeur dans UN SEUL isolat bidi (FSI U+2068 …
  // PDI U+2069) → en arabe « ≈ 2,98 MAD » forme un îlot LTR unique et le ≈ colle au
  // prix (au lieu de se détacher à droite). Calqué sur la convention du prix principal.
  // Les isolats sont INVISIBLES en LTR → FR « ≈ 2,98 MAD / boîte » et EN inchangés.
  const perUnit = `⁨≈ ${formatMAD(per)}⁩`
  // {size} nu isolé aussi (robustesse RTL) — invisible en LTR (chiffres latins conservés).
  const size = `⁨${packSize}⁩`

  return (
    <p className="text-xs text-muted">
      {t('packComposition', { unit: unitLabel, size, packUnit: packUnitPlural })}
      {' — '}
      {t('packPerUnit', { perUnit, packUnit: packUnitSingular })}
    </p>
  )
}
