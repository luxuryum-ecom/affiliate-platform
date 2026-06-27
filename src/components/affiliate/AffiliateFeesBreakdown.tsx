import { formatDH } from '@/lib/utils'

/**
 * AffiliateFeesBreakdown — bloc « Prix revendeur + frais déjà inclus ».
 * Utilisé en mode COMPACT sur la liste catalogue `/affiliate/products`. (La fiche
 * détail utilise désormais AffiliateResellerDisclosure ; le mode complet ici est
 * conservé comme variante mais non câblé — nettoyage possible ultérieurement.)
 *
 * AFFICHAGE PUR (Server Component, zéro état) : reçoit des montants DÉJÀ calculés
 * côté serveur + des libellés i18n résolus par la page (pattern strings-only,
 * cohérent avec les autres composants affilié). Aucun calcul ici.
 *
 * DETTE 073 : ne reçoit JAMAIS factory_cost_mad ni marge plateforme — uniquement
 * resellerPrice (= prix catalogue public) et les frais d'affichage.
 * Montants formatés via formatDH (DH — harmonisé avec la fiche, décision Abdou). Affichage seul.
 */

export interface AffiliateFeesBreakdownStrings {
  resellerPrice: string
  productIncluded: string
  delivery: string
  packaging: string
  confirmation: string
  noAdvance: string
  compactTag: string
}

interface Props {
  resellerPrice: number
  /** Frais détaillés — requis en mode complet, ignorés en mode compact. */
  deliveryFee?: number
  packagingFee?: number
  confirmationFee?: number
  strings: AffiliateFeesBreakdownStrings
  compact?: boolean
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-bg px-2.5 py-1 text-xs text-muted tabular-nums">
      {children}
    </span>
  )
}

export function AffiliateFeesBreakdown({
  resellerPrice,
  deliveryFee = 0,
  packagingFee = 0,
  confirmationFee = 0,
  strings,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <p className="text-[10px] text-muted mt-0.5">
        {strings.resellerPrice}&nbsp;:{' '}
        <span className="tabular-nums">{formatDH(resellerPrice)}</span>
        {' · '}
        {strings.compactTag}
      </p>
    )
  }

  return (
    <div className="mt-6 bg-surface rounded-xl border border-line p-4">
      <p className="text-sm font-semibold text-foreground">
        {strings.resellerPrice}&nbsp;:{' '}
        <span className="tabular-nums">{formatDH(resellerPrice)}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill>{strings.productIncluded}</Pill>
        <Pill>
          {strings.delivery}&nbsp;<span className="tabular-nums">{formatDH(deliveryFee)}</span>
        </Pill>
        <Pill>
          {strings.packaging}&nbsp;<span className="tabular-nums">{formatDH(packagingFee)}</span>
        </Pill>
        <Pill>
          {strings.confirmation}&nbsp;<span className="tabular-nums">{formatDH(confirmationFee)}</span>
        </Pill>
      </div>
      <p className="mt-3 text-xs text-muted">{strings.noAdvance}</p>
    </div>
  )
}
