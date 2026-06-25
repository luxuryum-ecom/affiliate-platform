'use client'

import { useActionState, useState } from 'react'
import type { ProductVariantRow } from '@/types/database'
import {
  addProductVariant,
  updateVariantStock,
  toggleVariantActive,
  type VariantActionState,
} from '@/app/actions/products'

interface Strings {
  sectionTitle: string
  sectionSubtitle: string
  addVariant: string
  axisLabel: string
  valueLabel: string
  stockLabel: string
  addAxisBtn: string
  saveVariant: string
  noVariants: string
  defaultVariant: string
  stockColHeader: string
  attrsColHeader: string
  statusColHeader: string
  actionsColHeader: string
  stockSave: string
  deactivate: string
  reactivate: string
  inactive: string
  errorRequiredAxis: string
  errorDuplicateAttributes: string
  errorMinStock: string
  errorVariantSave: string
  errorLastActiveVariant: string
  successAdded: string
  successStockUpdated: string
  successToggled: string
  addFormTitle: string
  cancelAdd: string
}

interface Props {
  productId: string
  variants: ProductVariantRow[]
  strings: Strings
}

const initialState: VariantActionState = { success: false, error: null }

function resolveError(code: string | null, s: Strings): string | null {
  if (!code) return null
  if (code === 'errorRequiredAxis') return s.errorRequiredAxis
  if (code === 'errorDuplicateAttributes') return s.errorDuplicateAttributes
  if (code === 'errorMinStock') return s.errorMinStock
  if (code === 'errorVariantSave') return s.errorVariantSave
  if (code === 'errorLastActiveVariant') return s.errorLastActiveVariant
  // Fallback: mask any unmapped code (DB internals must not reach the UI).
  return s.errorVariantSave
}

function AttrsDisplay({ attrs }: { attrs: Record<string, string> }) {
  const entries = Object.entries(attrs)
  if (entries.length === 0) return <span className="text-gray-400 text-xs italic">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className="bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded">
          {k}: {v}
        </span>
      ))}
    </span>
  )
}

// ─── Inline stock edit row ────────────────────────────────────────────────────

function StockRow({
  variant,
  productId,
  strings,
}: {
  variant: ProductVariantRow
  productId: string
  strings: Strings
}) {
  const [stockState, stockAction, stockPending] = useActionState(updateVariantStock, initialState)
  const [toggleState, toggleAction, togglePending] = useActionState(toggleVariantActive, initialState)

  return (
    <tr className={!variant.active ? 'opacity-50' : ''}>
      <td className="py-2 px-3">
        <AttrsDisplay attrs={variant.attributes} />
        {variant.is_default && (
          <span className="ml-1 text-xs text-blue-500">({strings.defaultVariant})</span>
        )}
      </td>

      <td className="py-2 px-3">
        <form action={stockAction} className="flex items-center gap-1">
          <input type="hidden" name="variantId" value={variant.id} />
          <input type="hidden" name="productId" value={productId} />
          <input
            name="stock"
            type="number"
            min="0"
            defaultValue={variant.stock_count}
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
            required
          />
          <button
            type="submit"
            disabled={stockPending}
            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {strings.stockSave}
          </button>
        </form>
        {stockState.success && (
          <p className="text-green-600 text-xs mt-0.5">{strings.successStockUpdated}</p>
        )}
        {stockState.error && (
          <p className="text-red-600 text-xs mt-0.5">{resolveError(stockState.error, strings)}</p>
        )}
      </td>

      <td className="py-2 px-3">
        {variant.active ? (
          <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">✓</span>
        ) : (
          <span className="inline-block bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
            {strings.inactive}
          </span>
        )}
      </td>

      <td className="py-2 px-3">
        <form action={toggleAction}>
          <input type="hidden" name="variantId" value={variant.id} />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="currentActive" value={String(variant.active)} />
          <button
            type="submit"
            disabled={togglePending}
            className="text-xs text-gray-500 hover:text-red-600 underline disabled:opacity-50"
          >
            {variant.active ? strings.deactivate : strings.reactivate}
          </button>
        </form>
        {toggleState.error && (
          <p className="text-red-600 text-xs mt-0.5">{resolveError(toggleState.error, strings)}</p>
        )}
      </td>
    </tr>
  )
}

// ─── Add-variant form ─────────────────────────────────────────────────────────

function AddVariantForm({
  productId,
  strings,
  onCancel,
}: {
  productId: string
  strings: Strings
  onCancel: () => void
}) {
  const [addState, addAction, addPending] = useActionState(addProductVariant, initialState)
  const [pairs, setPairs] = useState([{ axis: '', value: '' }])

  const addPair = () => setPairs((p) => [...p, { axis: '', value: '' }])
  const setAxis = (i: number, val: string) =>
    setPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, axis: val } : pair)))
  const setValue = (i: number, val: string) =>
    setPairs((p) => p.map((pair, idx) => (idx === i ? { ...pair, value: val } : pair)))

  return (
    <form action={addAction} className="border border-dashed border-indigo-300 rounded-lg p-4 space-y-3 bg-indigo-50">
      <p className="font-medium text-sm text-indigo-700">{strings.addFormTitle}</p>

      <input type="hidden" name="productId" value={productId} />
      {/* Serialise pairs as JSON so the action receives a single field */}
      <input type="hidden" name="pairs" value={JSON.stringify(pairs)} />

      <div className="space-y-2">
        {pairs.map((pair, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              placeholder={strings.axisLabel}
              value={pair.axis}
              onChange={(e) => setAxis(i, e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
            />
            <input
              placeholder={strings.valueLabel}
              value={pair.value}
              onChange={(e) => setValue(i, e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPair}
        className="text-xs text-indigo-600 hover:underline"
      >
        {strings.addAxisBtn}
      </button>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-700">{strings.stockLabel}</label>
        <input
          name="stock"
          type="number"
          min="0"
          defaultValue={0}
          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
          required
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={addPending}
          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {strings.saveVariant}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:underline px-3 py-1.5"
        >
          {strings.cancelAdd}
        </button>
      </div>

      {addState.success && (
        <p className="text-green-600 text-sm">{strings.successAdded}</p>
      )}
      {addState.error && (
        <p className="text-red-600 text-sm">{resolveError(addState.error, strings)}</p>
      )}
    </form>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function ProductVariantsEditor({ productId, variants, strings }: Props) {
  const [showAddForm, setShowAddForm] = useState(false)

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">{strings.sectionTitle}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{strings.sectionSubtitle}</p>
      </div>

      {variants.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{strings.noVariants}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm text-gray-700">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-2 px-3 text-start">{strings.attrsColHeader}</th>
                <th className="py-2 px-3 text-start">{strings.stockColHeader}</th>
                <th className="py-2 px-3 text-start">{strings.statusColHeader}</th>
                <th className="py-2 px-3 text-start">{strings.actionsColHeader}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {variants.map((v) => (
                <StockRow key={v.id} variant={v} productId={productId} strings={strings} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm ? (
        <AddVariantForm
          productId={productId}
          strings={strings}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="text-sm text-indigo-600 hover:underline font-medium"
        >
          + {strings.addVariant}
        </button>
      )}
    </section>
  )
}
