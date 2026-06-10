'use client'

import { useTransition, useState } from 'react'
import { deleteCity, toggleCityActive, updateCity } from '@/app/actions/cities'
import type { ActionState } from '@/types/orders'
import type { City } from '@/types/database'

// ─── Inline edit form ─────────────────────────────────────────────────────────

interface EditFormProps {
  city: City
  onCancel: () => void
}

function EditForm({ city, onCancel }: EditFormProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result: ActionState = await updateCity({ error: null, success: false }, formData)
      if (!result.success) {
        setError(result.error ?? 'Erreur inconnue.')
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
        className="w-36 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="relative">
        <input
          name="delivery_fee_mad"
          type="number"
          min="0"
          step="0.01"
          defaultValue={city.delivery_fee_mad}
          required
          className="w-24 rounded border border-gray-300 py-1 pl-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">
          MAD
        </span>
      </div>

      {error && <span className="text-xs text-red-600">{error}</span>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? '…' : 'Enregistrer'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
      >
        Annuler
      </button>
    </form>
  )
}

// ─── Row actions (edit / toggle / delete) ─────────────────────────────────────

interface CityRowActionsProps {
  city: City
}

export function CityRowActions({ city }: CityRowActionsProps) {
  const [isEditing, setIsEditing]     = useState(false)
  const [isPending, startTransition]  = useTransition()
  const [error, setError]             = useState<string | null>(null)

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      const result = await toggleCityActive(city.id, !city.is_active)
      if (!result.success) setError(result.error ?? 'Erreur.')
    })
  }

  const handleDelete = () => {
    if (!confirm(`Supprimer "${city.name}" ? Les commandes existantes ne sont pas affectées.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteCity(city.id)
      if (!result.success) setError(result.error ?? 'Erreur.')
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
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          Modifier
        </button>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
            city.is_active
              ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
              : 'border-green-200 text-green-700 hover:bg-green-50'
          }`}
        >
          {city.is_active ? 'Désactiver' : 'Activer'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Supprimer
        </button>
      </span>
      {error && <span className="text-[10px] text-red-600 leading-tight">{error}</span>}
    </span>
  )
}

// ─── Add city form ─────────────────────────────────────────────────────────────

import { useActionState } from 'react'
import { addCity } from '@/app/actions/cities'

const ADD_INITIAL: ActionState = { error: null, success: false }

export function AddCityForm() {
  const [state, action, isPending] = useActionState(addCity, ADD_INITIAL)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">Nom de la ville</label>
        <input
          name="name"
          required
          placeholder="Ex : Témara"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">Frais de livraison</label>
        <div className="relative">
          <input
            name="delivery_fee_mad"
            type="number"
            min="0"
            step="0.01"
            defaultValue={40}
            required
            className="w-28 rounded-lg border border-gray-300 py-2 pl-3 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">
            MAD
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {state.error && (
          <span className="text-xs text-red-600">{state.error}</span>
        )}
        {state.success && (
          <span className="text-xs text-green-600">Ville ajoutée.</span>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isPending ? 'Ajout…' : '+ Ajouter'}
        </button>
      </div>
    </form>
  )
}
