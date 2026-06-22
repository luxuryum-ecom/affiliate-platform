'use client'

import { useActionState } from 'react'
import {
  createCategoryFromSuggestion,
  fileSuggestionIntoCategory,
  rejectSuggestion,
} from '@/app/actions/category-suggestions'
import type { ActionState } from '@/types/orders'

// ─── Styles ──────────────────────────────────────────────────────────────────
const INPUT = 'rounded border border-line bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 w-full'
const SELECT = 'rounded border border-line bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 w-full'
const BTN_PRIMARY = 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity'
const BTN_SECONDARY = 'rounded border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 transition-colors disabled:opacity-50'
const BTN_DANGER = 'rounded border border-danger px-2 py-0.5 text-xs text-danger-fg hover:bg-danger-soft disabled:opacity-50 transition-colors'

const INITIAL: ActionState = { error: null, success: false }

// ─── Types passés depuis le Server Component ──────────────────────────────────
export type ParentOption = { value: string; label: string }
export type CategoryOption = { value: string; label: string }

// ─── Feedback inline ──────────────────────────────────────────────────────────
function Feedback({ state, successMsg, errorFallback }: {
  state: ActionState
  successMsg: string
  errorFallback: string
}) {
  if (state.success) {
    return (
      <p role="status" className="mt-2 text-xs font-medium text-success-fg">
        {successMsg}
      </p>
    )
  }
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-xs font-medium text-danger-fg">
        {state.error || errorFallback}
      </p>
    )
  }
  return null
}

// ─── A) Créer une nouvelle catégorie ─────────────────────────────────────────
export function CreateCategoryForm({
  suggestionId,
  proposedLabel,
  parentOptions,
  labels,
}: {
  suggestionId: string
  proposedLabel: string
  parentOptions: ParentOption[]
  labels: {
    labelFr: string
    labelAr: string
    labelEn: string
    parentOptional: string
    parentNone: string
    btnCreate: string
    creating: string
    successCreate: string
    errorFallback: string
  }
}) {
  const [state, action, isPending] = useActionState(createCategoryFromSuggestion, INITIAL)

  if (state.success) {
    return <Feedback state={state} successMsg={labels.successCreate} errorFallback={labels.errorFallback} />
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="suggestion_id" value={suggestionId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{labels.labelFr}</label>
          <input
            name="label_fr"
            required
            defaultValue={proposedLabel}
            className={INPUT}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{labels.labelAr}</label>
          <input
            name="label_ar"
            required
            dir="rtl"
            className={INPUT}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{labels.labelEn}</label>
          <input
            name="label_en"
            required
            defaultValue={proposedLabel}
            className={INPUT}
            disabled={isPending}
          />
        </div>
      </div>

      {parentOptions.length > 0 && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{labels.parentOptional}</label>
          <select name="parent_id" className={SELECT} disabled={isPending}>
            <option value="">{labels.parentNone}</option>
            {parentOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <button type="submit" disabled={isPending} className={BTN_PRIMARY}>
        {isPending ? labels.creating : labels.btnCreate}
      </button>

      <Feedback state={state} successMsg={labels.successCreate} errorFallback={labels.errorFallback} />
    </form>
  )
}

// ─── B) Ranger dans une catégorie existante ───────────────────────────────────
export function FileIntoExistingForm({
  suggestionId,
  categoryOptions,
  labels,
}: {
  suggestionId: string
  categoryOptions: CategoryOption[]
  labels: {
    selectCategory: string
    btnFile: string
    filing: string
    successFile: string
    errorFallback: string
  }
}) {
  const [state, action, isPending] = useActionState(fileSuggestionIntoCategory, INITIAL)

  if (state.success) {
    return <Feedback state={state} successMsg={labels.successFile} errorFallback={labels.errorFallback} />
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="suggestion_id" value={suggestionId} />
      <select name="category_id" required className={SELECT} disabled={isPending}>
        <option value="">{labels.selectCategory}</option>
        {categoryOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button type="submit" disabled={isPending} className={BTN_SECONDARY}>
        {isPending ? labels.filing : labels.btnFile}
      </button>
      <Feedback state={state} successMsg={labels.successFile} errorFallback={labels.errorFallback} />
    </form>
  )
}

// ─── C) Rejeter ───────────────────────────────────────────────────────────────
export function RejectForm({
  suggestionId,
  labels,
}: {
  suggestionId: string
  labels: {
    btnReject: string
    rejecting: string
    successReject: string
    errorFallback: string
  }
}) {
  const [state, action, isPending] = useActionState(rejectSuggestion, INITIAL)

  if (state.success) {
    return <Feedback state={state} successMsg={labels.successReject} errorFallback={labels.errorFallback} />
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="suggestion_id" value={suggestionId} />
      <button type="submit" disabled={isPending} className={BTN_DANGER}>
        {isPending ? labels.rejecting : labels.btnReject}
      </button>
      <Feedback state={state} successMsg={labels.successReject} errorFallback={labels.errorFallback} />
    </form>
  )
}
