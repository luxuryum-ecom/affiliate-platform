'use client'

import { useTransition, useState, useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { deleteCity, toggleCityActive, updateCity, addCity } from '@/app/actions/cities'
import type { ActionState } from '@/types/orders'
import type { City } from '@/types/database'

const INPUT_SM = 'rounded border border-line bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400'

// ─── Inline edit form ─────────────────────────────────────────────────────────

interface EditFormProps {
  city: City
  onCancel: () => void
}

function EditForm({ city, onCancel }: EditFormProps) {
  const tc = useTranslations('admin.common')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result: ActionState = await updateCity({ error: null, success: false }, formData)
      if (!result.success) {
        setError(result.error ?? tc('errorUnknown'))
      } else {
        onCancel()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id"        value={city.id} />
      <input type="hidden" name="is_active" value={String(city.is_active)} />

      <input
        name="name"
        defaultValue={city.name}
        required
        className={`w-36 ${INPUT_SM}`}
      />

      <div className="relative">
        <input
          name="delivery_fee_mad"
          type="number"
          min="1"
          step="0.01"
          defaultValue={city.delivery_fee_mad}
          required
          className={`w-24 pr-10 ${INPUT_SM}`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-faint">
          MAD
        </span>
      </div>

      {error && <span className="text-xs text-danger-fg">{error}</span>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? '…' : tc('save')}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-line px-3 py-1 text-xs text-muted hover:bg-surface-2 transition-colors"
      >
        {tc('cancel')}
      </button>
    </form>
  )
}

// ─── Row actions (edit / toggle / delete) ─────────────────────────────────────

interface CityRowActionsProps {
  city: City
}

export function CityRowActions({ city }: CityRowActionsProps) {
  const t  = useTranslations('admin.cityActions')
  const tc = useTranslations('admin.common')
  const [isEditing, setIsEditing]     = useState(false)
  const [isPending, startTransition]  = useTransition()
  const [error, setError]             = useState<string | null>(null)

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      const result = await toggleCityActive(city.id, !city.is_active)
      if (!result.success) setError(result.error ?? t('error'))
    })
  }

  const handleDelete = () => {
    if (!confirm(t('confirmDelete', { name: city.name }))) return
    setError(null)
    startTransition(async () => {
      const result = await deleteCity(city.id)
      if (!result.success) setError(result.error ?? t('error'))
    })
  }

  if (isEditing) {
    return <EditForm city={city} onCancel={() => setIsEditing(false)} />
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:bg-surface-2 transition-colors"
        >
          {tc('edit')}
        </button>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 transition-colors ${
            city.is_active
              ? 'border-warning text-warning-fg hover:bg-warning-soft'
              : 'border-success text-success-fg hover:bg-success-soft'
          }`}
        >
          {city.is_active ? tc('deactivate') : tc('activate')}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded border border-danger px-2 py-0.5 text-xs text-danger-fg hover:bg-danger-soft disabled:opacity-50 transition-colors"
        >
          {tc('delete')}
        </button>
      </span>
      {error && <span className="text-[10px] text-danger-fg leading-tight">{error}</span>}
    </span>
  )
}

// ─── Add city form ─────────────────────────────────────────────────────────────

const ADD_INITIAL: ActionState = { error: null, success: false }

export function AddCityForm() {
  const t = useTranslations('admin.cityActions')
  const [state, action, isPending] = useActionState(addCity, ADD_INITIAL)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-muted">{t('addNameLabel')}</label>
        <input
          name="name"
          required
          placeholder={t('addNamePlaceholder')}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-muted">{t('addFeeLabel')}</label>
        <div className="relative">
          <input
            name="delivery_fee_mad"
            type="number"
            min="1"
            step="0.01"
            defaultValue={35}
            required
            className="w-28 rounded-lg border border-line bg-surface py-2 pl-3 pr-12 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-faint">
            MAD
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {state.error && (
          <span className="text-xs text-danger-fg">{state.error}</span>
        )}
        {state.success && (
          <span className="text-xs text-success-fg">{t('added')}</span>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? t('adding') : t('addButton')}
        </button>
      </div>
    </form>
  )
}
