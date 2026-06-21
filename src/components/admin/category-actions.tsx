'use client'

import { useTransition, useState, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryActive,
  setCategorySortOrder,
  setCategoryAffiliateAllowed,
} from '@/app/actions/categories'
import type { ActionState } from '@/types/orders'
import type { AdminCategory, CategoryChannelAudit } from '@/app/actions/categories'

const INPUT = 'rounded border border-line bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 w-full'
const INPUT_SM = 'rounded border border-line bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400'
const BTN_PRIMARY = 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity'
const BTN_SECONDARY = 'rounded border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 transition-colors disabled:opacity-50'
const BTN_DANGER = 'rounded border border-danger px-2 py-0.5 text-xs text-danger-fg hover:bg-danger-soft disabled:opacity-50 transition-colors'

const ADD_INITIAL: ActionState = { error: null, success: false }

// ─── Add Category Form ────────────────────────────────────────────────────────

interface AddCategoryFormProps {
  parents: AdminCategory[]
  defaultParentId?: string
}

export function AddCategoryForm({ parents, defaultParentId }: AddCategoryFormProps) {
  const t  = useTranslations('admin.categories')
  const ta = useTranslations('admin.categoryActions')
  const [state, action, isPending] = useActionState(createCategory, ADD_INITIAL)
  const isSubMode = Boolean(defaultParentId)

  return (
    <form action={action} className="space-y-4">
      {defaultParentId && (
        <input type="hidden" name="parent_id" value={defaultParentId} />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('labelFrLabel')} *</label>
          <input
            name="label_fr"
            required
            placeholder={t('labelFrPlaceholder')}
            className={INPUT}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('labelArLabel')} *</label>
          <input
            name="label_ar"
            required
            dir="rtl"
            placeholder={t('labelArPlaceholder')}
            className={INPUT}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('labelEnLabel')} *</label>
          <input
            name="label_en"
            required
            placeholder={t('labelEnPlaceholder')}
            className={INPUT}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('iconLabel')}</label>
          <input
            name="icon"
            placeholder={t('iconPlaceholder')}
            className={INPUT}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium text-muted">{t('imageUrlLabel')}</label>
          <input
            name="image_url"
            type="url"
            placeholder={t('imageUrlPlaceholder')}
            className={INPUT}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('sortOrderLabel')}</label>
          <input
            name="sort_order"
            type="number"
            min="0"
            defaultValue={0}
            className={INPUT}
          />
        </div>
      </div>

      {!isSubMode && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('parentIdLabel')}</label>
          <select name="parent_id" className={INPUT}>
            <option value="">{t('parentIdNone')}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ? `${p.icon} ` : ''}{p.label_fr}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs text-faint">{t('slugNote')}</p>

      <div className="flex items-center gap-3">
        {state.error && <span className="text-xs text-danger-fg">{state.error}</span>}
        {state.success && <span className="text-xs text-success-fg">{ta('created')}</span>}
        <button type="submit" disabled={isPending} className={BTN_PRIMARY}>
          {isPending ? ta('adding') : (isSubMode ? ta('addSubButtonShort') : ta('addParentButton'))}
        </button>
      </div>
    </form>
  )
}

// ─── Edit Category Form (inline) ──────────────────────────────────────────────

interface EditCategoryFormProps {
  category: AdminCategory
  onCancel: () => void
}

function EditCategoryForm({ category, onCancel }: EditCategoryFormProps) {
  const t  = useTranslations('admin.categories')
  const ta = useTranslations('admin.categoryActions')
  const tc = useTranslations('admin.common')
  const [state, action, isPending] = useActionState(updateCategory, ADD_INITIAL)

  return (
    <form action={action} className="space-y-3 p-4 bg-surface-2 rounded-xl border border-line">
      <input type="hidden" name="id" value={category.id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('labelFrLabel')} *</label>
          <input
            name="label_fr"
            required
            defaultValue={category.label_fr}
            className={INPUT_SM + ' w-full'}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('labelArLabel')} *</label>
          <input
            name="label_ar"
            required
            dir="rtl"
            defaultValue={category.label_ar}
            className={INPUT_SM + ' w-full'}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('labelEnLabel')} *</label>
          <input
            name="label_en"
            required
            defaultValue={category.label_en}
            className={INPUT_SM + ' w-full'}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('iconLabel')}</label>
          <input
            name="icon"
            defaultValue={category.icon ?? ''}
            placeholder={t('iconPlaceholder')}
            className={INPUT_SM + ' w-full'}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium text-muted">{t('imageUrlLabel')}</label>
          <input
            name="image_url"
            type="url"
            defaultValue={category.image_url ?? ''}
            placeholder={t('imageUrlPlaceholder')}
            className={INPUT_SM + ' w-full'}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted">{t('sortOrderLabel')}</label>
          <input
            name="sort_order"
            type="number"
            min="0"
            defaultValue={category.sort_order}
            className={INPUT_SM + ' w-full'}
          />
        </div>
      </div>

      {state.error && <p className="text-xs text-danger-fg">{state.error}</p>}
      {state.success && <p className="text-xs text-success-fg">{ta('updated')}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={isPending} className={BTN_PRIMARY}>
          {isPending ? ta('saving') : tc('save')}
        </button>
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>
          {tc('cancel')}
        </button>
      </div>
    </form>
  )
}

// ─── Category Row Actions ─────────────────────────────────────────────────────

interface CategoryRowActionsProps {
  category: AdminCategory
  nameForConfirm: string
  // i18n strings resolved server-side and passed as serializable props
  labelEdit: string
  labelDelete: string
  labelActivate: string
  labelDeactivate: string
  labelMoveUp: string
  labelMoveDown: string
  labelCancel: string
  labelSave: string
  confirmDeleteMsg: string
  errorFallback: string
  deletedMsg: string
}

export function CategoryRowActions({
  category,
  nameForConfirm,
  labelEdit,
  labelDelete,
  labelActivate,
  labelDeactivate,
  labelMoveUp,
  labelMoveDown,
  labelCancel,
  labelSave,
  confirmDeleteMsg,
  errorFallback,
  deletedMsg,
}: CategoryRowActionsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      const result = await toggleCategoryActive(category.id, !category.active)
      if (!result.success) setError(result.error ?? errorFallback)
    })
  }

  const handleMoveUp = () => {
    if (category.sort_order <= 0) return
    setError(null)
    startTransition(async () => {
      const result = await setCategorySortOrder(category.id, category.sort_order - 1)
      if (!result.success) setError(result.error ?? errorFallback)
    })
  }

  const handleMoveDown = () => {
    setError(null)
    startTransition(async () => {
      const result = await setCategorySortOrder(category.id, category.sort_order + 1)
      if (!result.success) setError(result.error ?? errorFallback)
    })
  }

  const handleDelete = () => {
    if (!confirm(confirmDeleteMsg)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteCategory(category.id)
      if (!result.success) {
        setError(result.error ?? errorFallback)
      } else {
        setDeleted(true)
      }
    })
  }

  if (deleted) {
    return <span className="text-xs text-success-fg">{deletedMsg}</span>
  }

  if (isEditing) {
    return (
      <EditCategoryForm
        category={category}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          disabled={isPending}
          className={BTN_SECONDARY}
        >
          {labelEdit}
        </button>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 transition-colors ${
            category.active
              ? 'border-warning text-warning-fg hover:bg-warning-soft'
              : 'border-success text-success-fg hover:bg-success-soft'
          }`}
        >
          {category.active ? labelDeactivate : labelActivate}
        </button>
        <button
          type="button"
          onClick={handleMoveUp}
          disabled={isPending || category.sort_order <= 0}
          title={labelMoveUp}
          className={BTN_SECONDARY}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={handleMoveDown}
          disabled={isPending}
          title={labelMoveDown}
          className={BTN_SECONDARY}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className={BTN_DANGER}
        >
          {labelDelete}
        </button>
      </span>
      {error && <span className="text-[10px] text-danger-fg leading-tight max-w-xs text-right">{error}</span>}
    </span>
  )
}

// ─── Channel Toggle (sensitive — audited action) ───────────────────────────────

interface ChannelToggleProps {
  category: AdminCategory
  // All strings resolved server-side
  labelEnable: string
  labelDisable: string
  confirmEnableMsg: string
  confirmDisableMsg: string
  impactWarning: string
  errorFallback: string
  channelUpdatedMsg: string
  auditTitle: string
  auditEmpty: string
  auditRecords: CategoryChannelAudit[]
  auditByLabel: string  // "by {user}" with user already interpolated per record — passed per-record as array
  auditChannelOn: string
  auditChannelOff: string
  auditSystemLabel: string
}

export function ChannelToggle({
  category,
  labelEnable,
  labelDisable,
  confirmEnableMsg,
  confirmDisableMsg,
  impactWarning,
  errorFallback,
  channelUpdatedMsg,
  auditTitle,
  auditEmpty,
  auditRecords,
  auditByLabel,
  auditChannelOn,
  auditChannelOff,
  auditSystemLabel,
}: ChannelToggleProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [showAudit, setShowAudit] = useState(false)

  const handleToggle = () => {
    const msg = category.affiliate_allowed ? confirmDisableMsg : confirmEnableMsg
    if (!confirm(msg)) return
    setError(null)
    setDone(false)
    startTransition(async () => {
      const result = await setCategoryAffiliateAllowed(category.id, !category.affiliate_allowed)
      if (!result.success) {
        setError(result.error ?? errorFallback)
      } else {
        setDone(true)
      }
    })
  }

  return (
    <div className="space-y-2">
      {/* Impact warning banner */}
      <div className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2">
        <span className="mt-0.5 text-warning-fg text-xs font-bold shrink-0">!</span>
        <p className="text-xs text-warning-fg leading-snug">{impactWarning}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            category.affiliate_allowed
              ? 'border-danger text-danger-fg hover:bg-danger-soft'
              : 'border-success text-success-fg hover:bg-success-soft'
          }`}
        >
          {isPending ? '…' : (category.affiliate_allowed ? labelDisable : labelEnable)}
        </button>

        {auditRecords.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className="text-xs text-faint underline underline-offset-2 hover:text-muted transition-colors"
          >
            {auditTitle} ({auditRecords.length})
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger-fg">{error}</p>}
      {done && <p className="text-xs text-success-fg">{channelUpdatedMsg}</p>}

      {/* Audit log */}
      {showAudit && (
        <div className="rounded-lg border border-line bg-surface-2 overflow-hidden">
          <p className="px-3 py-2 text-xs font-semibold text-muted border-b border-line">{auditTitle}</p>
          {auditRecords.length === 0 ? (
            <p className="px-3 py-3 text-xs text-faint">{auditEmpty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {auditRecords.map((rec) => (
                <li key={rec.id} className="px-3 py-2 flex items-start justify-between gap-4">
                  <span className={`text-xs font-medium ${rec.new_value ? 'text-success-fg' : 'text-danger-fg'}`}>
                    {rec.new_value ? auditChannelOn : auditChannelOff}
                  </span>
                  <span className="text-xs text-faint text-right shrink-0">
                    {new Date(rec.changed_at).toLocaleString()} — {rec.changed_by ?? auditSystemLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Add Sub-category inline trigger ─────────────────────────────────────────

interface AddSubFormInlineProps {
  parentId: string
  parents: AdminCategory[]
  labelButton: string
  labelCancel: string
}

export function AddSubFormInline({ parentId, parents, labelButton, labelCancel }: AddSubFormInlineProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted border border-dashed border-line rounded px-2 py-1 hover:bg-surface-2 transition-colors"
      >
        {labelButton}
      </button>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <AddCategoryForm parents={parents} defaultParentId={parentId} />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-faint underline"
      >
        {labelCancel}
      </button>
    </div>
  )
}
