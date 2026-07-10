'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createCourier } from '@/app/actions/couriers'

/**
 * Formulaire de création d'un livreur (société ou personnel). Reçoit uniquement
 * des données sérialisables — RÈGLE ABSOLUE CLAUDE.md #2 : jamais de fonction
 * passée à un Client Component. `createCourier` est importée directement
 * (server action 'use server'), pas transmise en prop. Validation client EN
 * PLUS de la validation zod côté serveur (déjà dans l'action).
 */

const INPUT =
  'w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2'

export function CourierCreateForm() {
  const t = useTranslations('admin.couriers')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const [name, setName] = useState('')
  const [courierType, setCourierType] = useState<'company' | 'personal'>('personal')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [balanceCapMad, setBalanceCapMad] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function resetForm() {
    setName('')
    setCourierType('personal')
    setCompanyName('')
    setPhone('')
    setBalanceCapMad('')
    setNotes('')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('validationName'))
      return
    }
    const capNumber = balanceCapMad.trim() === '' ? 0 : Number(balanceCapMad.replace(',', '.'))
    if (!Number.isFinite(capNumber) || capNumber < 0) {
      setError(t('validationCap'))
      return
    }

    startTransition(async () => {
      const res = await createCourier({
        name: trimmedName,
        courierType,
        companyName: courierType === 'company' ? companyName.trim() || undefined : undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        balanceCapMad: capNumber,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      setSuccess(true)
      resetForm()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setSuccess(false)
        }}
        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {t('addButton')}
      </button>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-line p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">{t('formTitle')}</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          {t('formClose')}
        </button>
      </div>

      {success && (
        <p className="mb-4 text-sm text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
          {t('createSuccess')}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="courier-name">
              {t('nameLabel')}
            </label>
            <input
              id="courier-name"
              type="text"
              value={name}
              disabled={isPending}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="courier-type">
              {t('typeLabel')}
            </label>
            <select
              id="courier-type"
              value={courierType}
              disabled={isPending}
              onChange={(e) => setCourierType(e.target.value === 'company' ? 'company' : 'personal')}
              className={INPUT}
            >
              <option value="personal">{t('typePersonal')}</option>
              <option value="company">{t('typeCompany')}</option>
            </select>
          </div>
          {courierType === 'company' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="courier-company">
                {t('companyNameLabel')}
              </label>
              <input
                id="courier-company"
                type="text"
                value={companyName}
                disabled={isPending}
                onChange={(e) => setCompanyName(e.target.value)}
                className={INPUT}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="courier-phone">
              {t('phoneLabel')}
            </label>
            <input
              id="courier-phone"
              type="tel"
              value={phone}
              disabled={isPending}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="courier-cap">
              {t('balanceCapLabel')}
            </label>
            <input
              id="courier-cap"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={balanceCapMad}
              disabled={isPending}
              onChange={(e) => setBalanceCapMad(e.target.value)}
              className={`${INPUT} tabular-nums`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="courier-notes">
              {t('notesLabel')}
            </label>
            <input
              id="courier-notes"
              type="text"
              value={notes}
              disabled={isPending}
              onChange={(e) => setNotes(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          {isPending ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  )
}
