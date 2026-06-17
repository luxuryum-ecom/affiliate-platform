import Link from 'next/link'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'

// ─── Props — all serializable. `source` never crosses the server boundary. ────
export interface WholesaleCatalogCardProps {
  href: string
  name: string
  imageUrl: string | null
  /** Pre-formatted via formatMAD server-side. */
  fromPriceLabel: string
  /** Pre-formatted server-side e.g. "50 u. min." */
  minQtyLabel: string
  /** Pre-resolved availability badge text. */
  availabilityBadge: string
  /** True when availability_type is 'local_stock'. Used only for badge colour. */
  isLocalStock: boolean
  isVerified: boolean
  isFeatured: boolean
  /** Pre-resolved "Vérifié" / "ثقة" / "Verified" label. */
  verifiedLabel: string
  /** Pre-resolved "Vedette" / "مميز" / "Featured" label. */
  featuredLabel: string
  /** CTA label — pre-resolved server-side e.g. "Commander →" */
  ctaLabel: string
  /** If the product is in the cart, the pre-formatted "X au panier" label. */
  inCartLabel?: string
}

export function WholesaleCatalogCard({
  href,
  name,
  imageUrl,
  fromPriceLabel,
  minQtyLabel,
  availabilityBadge,
  isLocalStock,
  isVerified,
  isFeatured,
  verifiedLabel,
  featuredLabel,
  ctaLabel,
  inCartLabel,
}: WholesaleCatalogCardProps) {
  const cardBorder = isVerified
    ? 'border-gold-300 ring-1 ring-gold-100'
    : isFeatured
    ? 'border-gold-200 ring-1 ring-gold-100'
    : 'border-line'

  return (
    <div
      className={`group bg-surface rounded-xl border overflow-hidden flex flex-col hover:shadow-premium transition-all duration-200 ${cardBorder}`}
    >
      {/* Thumbnail */}
      <Link href={href} className="aspect-square relative overflow-hidden block">
        <ProductThumbnail
          src={imageUrl}
          name={name}
          className="w-full h-full text-2xl group-hover:scale-105 transition-transform duration-300"
        />

        {/* In-cart badge */}
        {inCartLabel != null && (
          <div className="absolute top-2 end-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
            {inCartLabel}
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isLocalStock
                ? 'bg-success-soft text-success-fg border border-success'
                : 'bg-surface-2 text-muted border border-line'
            }`}
          >
            {availabilityBadge}
          </span>
          {isVerified && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent-soft text-accent-fg border border-gold-300">
              ✓ {verifiedLabel}
            </span>
          )}
          {!isVerified && isFeatured && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent-soft text-accent-fg border border-gold-300">
              ★ {featuredLabel}
            </span>
          )}
        </div>

        {/* Name */}
        <Link href={href}>
          <h3 className="font-medium text-foreground text-sm leading-snug line-clamp-2 hover:text-muted transition-colors">
            {name}
          </h3>
        </Link>

        {/* Price + MOQ */}
        <div className="mt-auto pt-1.5 border-t border-line">
          <p className="text-sm font-bold text-foreground">{fromPriceLabel}</p>
          <p className="text-xs text-faint mt-0.5">{minQtyLabel}</p>
        </div>

        {/* CTA */}
        <Link
          href={href}
          className="block w-full text-center text-xs font-bold py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  )
}
