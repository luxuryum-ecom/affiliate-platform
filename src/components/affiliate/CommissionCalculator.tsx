'use client'

import { useActionState, useState } from 'react'
import { saveAffiliateProductPrice, type AffiliatePriceState } from '@/app/actions/affiliate-prices'
import { formatDH } from '@/lib/utils'

/**
 * CommissionCalculator — refonte d'AffiliatePriceForm (LOT 3).
 * Le commerçant teste son prix de vente ; la commission (prix − prix revendeur) se
 * met à jour en temps réel et s'affiche en gros. Boutons −/+ (pas de slider), chip
 * « Prix testé » qui réinitialise au prix conseillé (= prix revendeur + 60).
 *
 * CALCUL INCHANGÉ : commission = prix saisi − resellerPrice (le resellerPrice = capital
 * = prix catalogue, déjà public). AUCUNE donnée coût/marge ici (DETTE 073), aucun nouveau
 * calcul serveur. La PERSISTANCE (saveAffiliateProductPrice) est conservée.
 * Strings résolues serveur (règle #2 : zéro fonction passée au Client).
 */

const initialState: AffiliatePriceState = { error: null, success: false, cleared: false }

/** Marge conseillée par défaut au-dessus du prix revendeur (décision Abdou). */
const SUGGESTED_MARKUP = 60
/** Pas des boutons −/+. */
const STEP = 5
/** Demi-largeur de la bande « proche du conseillé » pour le message contextuel. */
const NEAR_BAND = 15

export interface CommissionCalculatorStrings {
  title: string
  myPrice: string
  priceSave: string
  priceSaving: string
  priceSavedOk: string
  priceResetOk: string
  commissionLabel: string
  /** ICU template: {price} */
  testedChip: string
  /** ICU template: {price} */
  msgBelow: string
  msgNear: string
  msgOther: string
  freeLine: string
  decrease: string
  increase: string
}

interface Props {
  productId: string
  /** Prix revendeur = capital de l'affilié (déjà public). Aucune donnée coût/marge. */
  resellerPrice: number
  currentCustomPrice: number | null
  strings: CommissionCalculatorStrings
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}

export function CommissionCalculator({ productId, resellerPrice, currentCustomPrice, strings }: Props) {
  const [state, action, isPending] = useActionState(saveAffiliateProductPrice, initialState)

  const suggested = resellerPrice + SUGGESTED_MARKUP

  // Pré-rempli au prix conseillé si aucun prix custom encore enregistré.
  const [value, setValue] = useState<string>(
    currentCustomPrice != null ? String(currentCustomPrice) : String(suggested),
  )

  const typed = value === '' ? null : Number(value)
  const priceNum = typed != null && Number.isFinite(typed) ? typed : 0
  const commission = priceNum - resellerPrice

  // Message contextuel sous le chip.
  let contextMsg: string
  if (priceNum <= resellerPrice) {
    contextMsg = interpolate(strings.msgBelow, { price: formatDH(resellerPrice) })
  } else if (Math.abs(priceNum - suggested) <= NEAR_BAND) {
    contextMsg = strings.msgNear
  } else {
    contextMsg = strings.msgOther
  }

  const nudge = (delta: number) => {
    const base = typed != null && Number.isFinite(typed) ? typed : suggested
    setValue(String(Math.max(0, base + delta)))
  }

  return (
    <div className="border-t border-line pt-3 mt-1">
      <p className="text-xs font-bold text-accent-fg mb-2">💰 {strings.title}</p>

      {/* Commission en TRÈS gros — temps réel */}
      <p className="text-sm text-faint">{strings.commissionLabel}</p>
      <p
        className={`text-5xl font-extrabold tabular-nums leading-tight ${
          commission > 0 ? 'text-success-fg' : 'text-muted'
        }`}
      >
        {formatDH(Math.max(0, commission))}
      </p>

      {/* Chip « Prix testé » → reset au conseillé */}
      <button
        type="button"
        onClick={() => setValue(String(suggested))}
        className="mt-2 inline-flex items-center rounded-full border border-gold-300 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-fg tabular-nums hover:bg-accent-soft/70 transition-colors"
      >
        {interpolate(strings.testedChip, { price: formatDH(suggested) })}
      </button>

      {/* Message contextuel */}
      <p className="text-[11px] text-muted mt-1.5">{contextMsg}</p>

      {/* Champ prix + boutons −/+ + enregistrer */}
      <p className="text-xs font-medium text-muted mb-1 mt-2">{strings.myPrice}</p>
      <form action={action} className="flex gap-1.5 items-stretch">
        <input type="hidden" name="productId" value={productId} />
        <button
          type="button"
          onClick={() => nudge(-STEP)}
          aria-label={strings.decrease}
          disabled={isPending}
          className="shrink-0 w-12 min-h-[48px] flex items-center justify-center text-2xl border border-line rounded-lg bg-surface text-foreground hover:bg-surface-2 disabled:opacity-50 transition-colors"
        >
          −
        </button>
        <input
          type="number"
          name="customSellPriceMad"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          min={resellerPrice}
          step="1"
          inputMode="numeric"
          disabled={isPending}
          className="flex-1 min-w-0 px-3 py-3 text-2xl font-semibold text-center border border-line rounded-lg bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2 tabular-nums"
        />
        <button
          type="button"
          onClick={() => nudge(STEP)}
          aria-label={strings.increase}
          disabled={isPending}
          className="shrink-0 w-12 min-h-[48px] flex items-center justify-center text-2xl border border-line rounded-lg bg-surface text-foreground hover:bg-surface-2 disabled:opacity-50 transition-colors"
        >
          +
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 text-sm px-4 min-h-[48px] bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? strings.priceSaving : strings.priceSave}
        </button>
      </form>

      {/* Ligne fixe */}
      <p className="text-[11px] text-faint mt-1">{strings.freeLine}</p>

      {state.error && <p className="text-xs text-danger-fg mt-1">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-success-fg mt-1">
          {state.cleared ? strings.priceResetOk : strings.priceSavedOk}
        </p>
      )}
    </div>
  )
}
