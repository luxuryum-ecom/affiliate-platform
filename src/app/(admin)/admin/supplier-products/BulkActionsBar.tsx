'use client'

import { useActionState, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { bulkApproveProducts, bulkRejectProducts, bulkArchiveProducts } from '@/app/actions/supplier-bulk'
import {
  MODERATION_FLAG_LABELS,
  SUPPLIER_PRODUCT_STATUS_BADGES,
} from '@/lib/supplier-product-moderation'
import type { SupplierProductStatus, SupplierType, SupplierModerationFlag } from '@/types/database'

type ActionResult = { error: string | null; success: boolean }
const initial: ActionResult = { error: null, success: false }

interface ProductRow {
  id: string
  product_name: string
  approval_status: SupplierProductStatus
  moderation_flag: SupplierModerationFlag | null
  ai_risk_score: number | null
  supplier_type: SupplierType
  category: string
  min_quantity: number
  origin_country: string
  supplierName: string | null
  createdAt: string
}

interface BulkProductListProps {
  products: ProductRow[]
  detailBase: string
  locale: string
}

export default function BulkProductList({ products, detailBase, locale }: BulkProductListProps) {
  const t  = useTranslations('admin.supplierProducts')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [approveState, approveAction, isApproving] = useActionState(bulkApproveProducts, initial)
  const [rejectState,  rejectAction,  isRejecting]  = useActionState(bulkRejectProducts,  initial)
  const [archiveState, archiveAction, isArchiving]  = useActionState(bulkArchiveProducts, initial)

  const toggle    = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) { n.delete(id) } else { n.add(id) } return n })
  const toggleAll = () => setSelected(selected.size === products.length && products.length > 0 ? new Set() : new Set(products.map((p) => p.id)))
  const allChecked = selected.size === products.length && products.length > 0
  const count = selected.size
  const ids = [...selected].join(',')

  const anySuccess = approveState.success || rejectState.success || archiveState.success
  const anyError   = approveState.error   || rejectState.error   || archiveState.error

  const isRTL = locale === 'ar'
  const reviewLabel = isRTL ? t('reviewAr') : t('review')

  return (
    <div>
      {/* ── Bulk action bar ── */}
      {count > 0 && (
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">
            {t('selected', { count })}
          </span>

          <form action={approveAction} className="contents">
            <input type="hidden" name="product_ids" value={ids} />
            <button
              type="submit"
              disabled={isApproving}
              className="text-xs px-3 py-1.5 bg-success-soft text-success-fg border border-success rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isApproving ? t('bulkApproving') : t('bulkApprove')}
            </button>
          </form>

          <form action={rejectAction} className="contents">
            <input type="hidden" name="product_ids" value={ids} />
            <button
              type="submit"
              disabled={isRejecting}
              className="text-xs px-3 py-1.5 bg-danger-soft text-danger-fg border border-danger rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isRejecting ? t('bulkBlocking') : t('bulkBlock')}
            </button>
          </form>

          <form action={archiveAction} className="contents">
            <input type="hidden" name="product_ids" value={ids} />
            <button
              type="submit"
              disabled={isArchiving}
              className="text-xs px-3 py-1.5 bg-surface-2 text-muted border border-line rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isArchiving ? t('bulkArchiving') : t('bulkArchive')}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-primary-foreground/60 hover:text-primary-foreground ml-auto transition-colors"
          >
            {t('clearSelection')}
          </button>
        </div>
      )}

      {anySuccess && !approveState.error && (
        <div className="mb-3 text-xs text-success-fg bg-success-soft border border-success rounded-lg px-4 py-2">
          {t('actionDone')}
        </div>
      )}
      {approveState.success && approveState.error && (
        <div className="mb-3 text-xs text-warning-fg bg-warning-soft border border-warning rounded-lg px-4 py-2">
          {approveState.error}
        </div>
      )}
      {anyError && !approveState.success && (
        <div className="mb-3 text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-4 py-2">
          {approveState.error ?? rejectState.error ?? archiveState.error}
        </div>
      )}

      {/* ── Table header ── */}
      <div className="bg-surface rounded-t-xl border border-b-0 border-line px-4 py-2.5 flex items-center gap-3">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="rounded border-line focus:ring-2 focus:ring-gold-400"
        />
        <span className="text-xs text-muted">{t('selectAll')}</span>
      </div>

      {products.length === 0 ? (
        <div className="bg-surface rounded-b-xl border border-line p-12 text-center">
          <p className="text-sm text-faint">{t('empty')}</p>
        </div>
      ) : (
        <div className="bg-surface rounded-b-xl border border-line divide-y divide-line">
          {products.map((p) => {
            const badge    = SUPPLIER_PRODUCT_STATUS_BADGES[p.approval_status]
            const modLabel = p.moderation_flag != null ? MODERATION_FLAG_LABELS[p.moderation_flag] : null
            const dateStr  = new Date(p.createdAt).toLocaleDateString(locale, {
              year: 'numeric', month: 'short', day: 'numeric',
            })
            return (
              <div
                key={p.id}
                className={`p-4 flex items-start gap-3 transition-colors ${
                  selected.has(p.id) ? 'bg-gold-50 dark:bg-gold-950/10' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="rounded border-line mt-0.5 flex-shrink-0 focus:ring-2 focus:ring-gold-400"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-foreground text-sm truncate max-w-[200px]">
                      {p.product_name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {modLabel && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-surface-2 border-line text-muted">
                        {t('aiSignal', { label: modLabel })}
                      </span>
                    )}
                    {p.ai_risk_score != null && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-surface-2 border-line text-faint tabular-nums">
                        {t('risk', { score: p.ai_risk_score })}
                      </span>
                    )}
                    {p.supplier_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-surface-2 border-line text-muted">
                        {p.supplier_type === 'morocco'
                          ? `🇲🇦 ${t('supplierMorocco')}`
                          : `🌍 ${t('supplierInternational')}`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted flex flex-wrap gap-x-2">
                    {p.supplierName && (
                      <span className="font-medium text-foreground">{p.supplierName}</span>
                    )}
                    {p.category && <span>· {p.category}</span>}
                    <span>· {t('moq', { qty: p.min_quantity })}</span>
                    {p.origin_country && <span>· {p.origin_country}</span>}
                  </p>
                  <p className="text-xs text-faint mt-0.5">{dateStr}</p>
                </div>
                <a
                  href={`${detailBase}/${p.id}`}
                  className="shrink-0 text-xs px-3 py-1.5 bg-surface-2 hover:bg-line text-muted rounded-lg transition-colors border border-line"
                >
                  {reviewLabel}
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
