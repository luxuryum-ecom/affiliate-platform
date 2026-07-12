'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatMAD } from '@/lib/utils'
import { blockCourier } from '@/app/actions/guardian'

/**
 * Livreurs à risque (solde vs plafond). Blocage/déblocage manuel tracé
 * (`blockCourier`). Rappel : perso = blocage AUTO (Agent Gardien) ; société =
 * TOUJOURS manuel (jamais bloquée automatiquement). Données sérialisables
 * uniquement — server action importée directement (RÈGLE ABSOLUE CLAUDE.md #2).
 */

export interface CourierRiskItem {
  courierId: string
  name: string
  courierType: string
  status: string
  totalBalanceMad: number
  balanceCapMad: number
  overCap: boolean
  openAlerts: number
}

interface GuardianCourierRiskPanelProps {
  items: CourierRiskItem[]
}

export function GuardianCourierRiskPanel({ items }: GuardianCourierRiskPanelProps) {
  const t = useTranslations('admin.guardian')
  const te = useTranslations('errors')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Les RPC gardien renvoient parfois une clé `errors.xxx` brute — résolue ici,
  // comme src/components/account/delete-account-section.tsx.
  function resolveError(message: string) {
    return message.startsWith('errors.') ? te(message.slice('errors.'.length)) : message
  }

  const [actingId, setActingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [errorItemId, setErrorItemId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function openAction(courierId: string) {
    setActingId(courierId)
    setReason('')
    setErrorItemId(null)
    setRowError(null)
  }

  function cancelAction() {
    setActingId(null)
    setReason('')
    setErrorItemId(null)
    setRowError(null)
  }

  function submitAction(e: React.FormEvent, courierId: string, block: boolean) {
    e.preventDefault()
    setErrorItemId(null)
    setRowError(null)
    startTransition(async () => {
      const res = await blockCourier({ courierId, block, reason: reason.trim() })
      if (res.error) {
        setErrorItemId(courierId)
        setRowError(resolveError(res.error))
        return
      }
      cancelAction()
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-line overflow-hidden">
      {items.length === 0 ? (
        <p className="text-sm text-muted p-5">{t('riskEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-faint text-left border-b border-line bg-surface-2">
                <th className="py-2.5 px-4 font-medium">{t('colCourier')}</th>
                <th className="py-2.5 px-4 font-medium">{t('colStatus')}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t('colBalance')}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t('colCap')}</th>
                <th className="py-2.5 px-4 font-medium text-right">{t('colOpenAlerts')}</th>
                <th className="py-2.5 px-4 font-medium">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.courierId} className="border-b border-line/60 last:border-0 align-top">
                  <td className="py-2.5 px-4 font-medium text-foreground">
                    {c.name}
                    <span className="block text-faint font-normal">
                      {c.courierType === 'company' ? t('typeCompany') : t('typePersonal')}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'
                      }`}
                    >
                      {c.status === 'active' ? t('statusActive') : t('statusBlocked')}
                    </span>
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right tabular-nums font-medium ${
                      c.overCap ? 'text-danger-fg' : 'text-foreground'
                    }`}
                  >
                    {formatMAD(c.totalBalanceMad)}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-muted">{formatMAD(c.balanceCapMad)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-muted">{c.openAlerts}</td>
                  <td className="py-2.5 px-4">
                    {actingId === c.courierId ? (
                      <form
                        onSubmit={(e) => submitAction(e, c.courierId, c.status !== 'blocked')}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={t('reasonPlaceholder')}
                          disabled={isPending}
                          className="min-w-[160px] px-2.5 py-1.5 border border-line rounded-lg text-xs bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2"
                        />
                        <button
                          type="submit"
                          disabled={isPending}
                          className={`text-xs px-2.5 py-1.5 rounded-lg transition-opacity disabled:opacity-50 ${
                            c.status === 'blocked'
                              ? 'bg-success-soft text-success-fg border border-success hover:opacity-90'
                              : 'bg-danger text-white hover:opacity-90'
                          }`}
                        >
                          {isPending
                            ? t('blockSubmitting')
                            : c.status === 'blocked'
                              ? t('unblockConfirm')
                              : t('blockConfirm')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelAction}
                          disabled={isPending}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-line text-muted hover:bg-surface-2 transition-colors disabled:opacity-50"
                        >
                          {t('cancelAction')}
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAction(c.courierId)}
                        disabled={isPending}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-opacity disabled:opacity-50 ${
                          c.status === 'blocked'
                            ? 'border-success text-success-fg bg-success-soft hover:opacity-90'
                            : 'border-danger text-danger-fg bg-danger-soft hover:opacity-90'
                        }`}
                      >
                        {c.status === 'blocked' ? t('unblockAction') : t('blockAction')}
                      </button>
                    )}
                    {rowError && errorItemId === c.courierId && (
                      <p className="text-xs text-danger-fg mt-1">{rowError}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
