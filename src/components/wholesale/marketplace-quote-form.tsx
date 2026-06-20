'use client'

import { useActionState, useState } from 'react'
import { requestSupplierProductQuote, type SupplierProductState } from '@/app/actions/supplier-products'
import {
  BUYER_PURCHASE_PROFILES,
  BUYER_VOLUME_TIERS,
  type BuyerPurchaseProfile,
  type BuyerVolumeTier,
} from '@/lib/rfq-buyer-intake'

const initial: SupplierProductState = { error: null }

const INPUT = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent bg-surface text-foreground placeholder:text-faint disabled:bg-surface-2'
const LABEL = 'block text-xs font-medium text-muted mb-1'

interface TQuote {
  qtyLabel: string
  qtyMin: string
  activityLabel: string
  activityPlaceholder: string
  volumeLabel: string
  volumePlaceholder: string
  volumeHint: string
  tier1: string
  tier2: string
  tier3: string
  tier4: string
  countryLabel: string
  cityLabel: string
  cityPlaceholder: string
  whatsappLabel: string
  whatsappPlaceholder: string
  notesLabel: string
  notesPlaceholder: string
  cancel: string
  submit: string
  submitting: string
  cta: string
  success: string
  // Labels d'OPTIONS du sélecteur (i18n) — profils d'activité + paliers de volume.
  // Résolus côté serveur (parent), passés en strings → jamais de fonction au client.
  profilePhysical: string
  profileSocial: string
  profileEcom: string
  profileImporter: string
  vol1: string
  vol2: string
  vol3: string
  vol4: string
  // Mode d'expédition — uniquement pour les produits importés (showShippingMode).
  shippingLabel?: string
  shippingNone?: string
  shippingAir?: string
  shippingSeaTextile?: string
  shippingSeaVolume?: string
}

interface Props {
  supplierProductId: string
  minQuantity: number
  /** Affiche le champ mode d'expédition (aérien/maritime) — réservé aux produits importés. */
  showShippingMode?: boolean
  tQuote: TQuote
}

export function MarketplaceQuoteForm({ supplierProductId, minQuantity, showShippingMode = false, tQuote }: Props) {
  const [state, action, isPending] = useActionState(requestSupplierProductQuote, initial)
  const [open, setOpen] = useState(false)

  // Labels d'options résolus i18n (depuis tQuote, strings serveur) — remplacent les
  // constantes FR en dur (PURCHASE_PROFILE_LABELS / VOLUME_TIER_LABELS).
  const profileLabel: Record<BuyerPurchaseProfile, string> = {
    physical_store: tQuote.profilePhysical,
    social_reseller: tQuote.profileSocial,
    wholesaler: tQuote.profileEcom,
    importer: tQuote.profileImporter,
  }
  const volumeLabel: Record<BuyerVolumeTier, string> = {
    test_20_50: tQuote.vol1,
    small_100_300: tQuote.vol2,
    active_500_1000: tQuote.vol3,
    importer_1000_plus: tQuote.vol4,
  }

  if (state?.success) {
    return (
      <div className="text-sm text-success-fg bg-success-soft border border-success px-4 py-3 rounded-lg">
        {tQuote.success}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
      >
        {tQuote.cta}
      </button>
    )
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="supplier_product_id" value={supplierProductId} />

      <div>
        <label className={LABEL}>
          {tQuote.qtyLabel}
        </label>
        <input
          name="quantity_requested"
          type="number"
          min={minQuantity}
          defaultValue={minQuantity}
          required
          disabled={isPending}
          className={INPUT}
        />
        <p className="text-xs text-faint mt-0.5">{tQuote.qtyMin}</p>
      </div>

      <div>
        <label className={LABEL}>{tQuote.activityLabel}</label>
        <select
          name="buyer_purchase_profile"
          required
          disabled={isPending}
          className={INPUT}
        >
          <option value="">{tQuote.activityPlaceholder}</option>
          {BUYER_PURCHASE_PROFILES.map((value) => (
            <option key={value} value={value}>
              {profileLabel[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL}>{tQuote.volumeLabel}</label>
        <select
          name="buyer_volume_tier"
          required
          disabled={isPending}
          className={INPUT}
        >
          <option value="">{tQuote.volumePlaceholder}</option>
          {BUYER_VOLUME_TIERS.map((value) => (
            <option key={value} value={value}>
              {volumeLabel[value]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted mt-1">{tQuote.volumeHint}</p>
      </div>

      <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted space-y-0.5">
        <p>{tQuote.tier1}</p>
        <p>{tQuote.tier2}</p>
        <p>{tQuote.tier3}</p>
        <p>{tQuote.tier4}</p>
      </div>

      <div>
        <label className={LABEL}>{tQuote.countryLabel}</label>
        <input
          name="destination_country"
          type="text"
          defaultValue="Maroc"
          required
          disabled={isPending}
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL}>{tQuote.cityLabel}</label>
        <input
          name="destination_city"
          type="text"
          disabled={isPending}
          className={INPUT}
          placeholder={tQuote.cityPlaceholder}
        />
      </div>

      <div>
        <label className={LABEL}>
          {tQuote.whatsappLabel} <span className="text-danger-fg">*</span>
        </label>
        <input
          name="whatsapp_number"
          type="tel"
          required
          disabled={isPending}
          className={INPUT}
          placeholder={tQuote.whatsappPlaceholder}
        />
      </div>

      {showShippingMode && tQuote.shippingLabel && (
        <div>
          <label className={LABEL}>{tQuote.shippingLabel}</label>
          <select name="preferred_shipping_mode" disabled={isPending} className={INPUT}>
            <option value="">{tQuote.shippingNone}</option>
            <option value="air_door_to_door_kg">{tQuote.shippingAir}</option>
            <option value="sea_textile_kg">{tQuote.shippingSeaTextile}</option>
            <option value="sea_volume_cbm">{tQuote.shippingSeaVolume}</option>
          </select>
        </div>
      )}

      <div>
        <label className={LABEL}>{tQuote.notesLabel}</label>
        <textarea
          name="buyer_notes"
          rows={2}
          disabled={isPending}
          className={`${INPUT} resize-none`}
          placeholder={tQuote.notesPlaceholder}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="flex-1 py-2 border border-line text-muted text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors"
        >
          {tQuote.cancel}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? tQuote.submitting : tQuote.submit}
        </button>
      </div>
    </form>
  )
}
