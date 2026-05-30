'use client'

import { useActionState, useState } from 'react'
import { bulkApproveProducts, bulkRejectProducts, bulkArchiveProducts } from '@/app/actions/supplier-bulk'
import type { SupplierProductStatus, SupplierType } from '@/types/database'

type ActionResult = { error: string | null; success: boolean }
const initial: ActionResult = { error: null, success: false }

interface ProductRow {
  id: string
  product_name: string
  approval_status: SupplierProductStatus
  supplier_type: SupplierType
  category: string
  origin_country: string
  supplierName: string | null
  createdAt: string
}

const STATUS_BADGE: Record<SupplierProductStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvé',   cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejeté',     cls: 'bg-red-100 text-red-600' },
}

export default function BulkProductList({ products, detailBase }: { products: ProductRow[]; detailBase: string }) {
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

  return (
    <div>
      {/* Bulk action bar */}
      {count > 0 && (
        <div className="sticky top-0 z-10 bg-gray-900 text-white rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">{count} sélectionné{count > 1 ? 's' : ''}</span>

          <form action={approveAction} className="contents">
            <input type="hidden" name="product_ids" value={ids} />
            <button type="submit" disabled={isApproving} className="text-xs px-3 py-1.5 bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
              {isApproving ? '...' : 'Approuver'}
            </button>
          </form>

          <form action={rejectAction} className="contents">
            <input type="hidden" name="product_ids" value={ids} />
            <button type="submit" disabled={isRejecting} className="text-xs px-3 py-1.5 bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
              {isRejecting ? '...' : 'Rejeter'}
            </button>
          </form>

          <form action={archiveAction} className="contents">
            <input type="hidden" name="product_ids" value={ids} />
            <button type="submit" disabled={isArchiving} className="text-xs px-3 py-1.5 bg-gray-500 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors">
              {isArchiving ? '...' : 'Archiver'}
            </button>
          </form>

          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-white ml-auto">
            Effacer la sélection
          </button>
        </div>
      )}

      {anySuccess && <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">Action effectuée.</div>}
      {anyError   && <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{approveState.error ?? rejectState.error ?? archiveState.error}</div>}

      {/* Table header */}
      <div className="bg-white rounded-t-xl border border-b-0 border-gray-200 px-4 py-2.5 flex items-center gap-3">
        <input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded border-gray-300" />
        <span className="text-xs text-gray-500">Sélectionner tout</span>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-b-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">Aucune soumission fournisseur.</p>
        </div>
      ) : (
        <div className="bg-white rounded-b-xl border border-gray-200 divide-y divide-gray-100">
          {products.map((p) => {
            const badge = STATUS_BADGE[p.approval_status]
            return (
              <div key={p.id} className={`p-4 flex items-start gap-3 transition-colors ${selected.has(p.id) ? 'bg-blue-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="rounded border-gray-300 mt-0.5 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{p.product_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    {p.supplier_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {p.supplier_type === 'morocco' ? '🇲🇦 Maroc' : '🌍 International'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                    {p.supplierName && <span className="font-medium text-gray-700">{p.supplierName}</span>}
                    {p.category && <span>· {p.category}</span>}
                    {p.origin_country && <span>· {p.origin_country}</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <a
                  href={`${detailBase}/${p.id}`}
                  className="shrink-0 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Examiner →
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
