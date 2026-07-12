'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { formatMAD } from '@/lib/utils'
import { resolveGuardianAlert, runGuardianDetections } from '@/app/actions/guardian'

/**
 * Liste des alertes actives (triées critical d'abord — déjà fait côté serveur).
 * Données sérialisables uniquement — les server actions sont importées
 * directement, jamais transmises en prop (RÈGLE ABSOLUE CLAUDE.md #2).
 */

export interface GuardianAlertItem {
  id: string
  alertType: string
  severity: 'info' | 'warning' | 'critical'
  courierName: string | null
  orderId: string | null
  createdAt: string
  details: Record<string, unknown>
}

interface GuardianAlertsPanelProps {
  alerts: GuardianAlertItem[]
}

const SEVERITY_ICON: Record<GuardianAlertItem['severity'], string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
}

const SEVERITY_CLASS: Record<GuardianAlertItem['severity'], string> = {
  critical: 'border-danger bg-danger-soft',
  warning: 'border-warning bg-warning-soft',
  info: 'border-line bg-surface-2',
}

type ResolveMode = 'resolved' | 'dismissed'

export function GuardianAlertsPanel({ alerts }: GuardianAlertsPanelProps) {
  const t = useTranslations('admin.guardian')
  const te = useTranslations('errors')
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Les RPC gardien renvoient parfois une clé `errors.xxx` brute (RAISE EXCEPTION
  // côté Postgres) au lieu d'une phrase déjà traduite — on la résout ici, comme
  // src/components/account/delete-account-section.tsx.
  function resolveError(message: string) {
    return message.startsWith('errors.') ? te(message.slice('errors.'.length)) : message
  }

  const [detecting, setDetecting] = useState(false)
  const [detectionResult, setDetectionResult] = useState<string | null>(null)
  const [detectionError, setDetectionError] = useState<string | null>(null)

  const [activeAlertId, setActiveAlertId] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<ResolveMode | null>(null)
  const [reason, setReason] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)

  function typeLabel(alertType: string) {
    return t(`alertTypes.${alertType}`)
  }

  function detailText(item: GuardianAlertItem) {
    const d = item.details ?? {}
    switch (item.alertType) {
      case 'ghost_parcel':
        return t('detailGhostParcel')
      case 'cross_imputation':
        return t('detailCrossImputation')
      case 'reception_without_declaration':
        return t('detailCollusion', {
          bearer: String(d.bearer_name ?? '—'),
          amount: formatMAD(Number(d.amount_mad ?? 0)),
        })
      case 'cash_declared_pending':
        return t('detailCashPending', {
          courier: String(d.courier_name ?? '—'),
          amount: formatMAD(Number(d.amount_mad ?? 0)),
          method: d.method === 'virement' ? t('methodVirement') : t('methodCash'),
        })
      case 'return_ghost_48h':
        return t('detailReturnGhost', {
          courier: String(d.courier_name ?? '—'),
          hours: String(d.hours ?? 48),
        })
      case 'pattern_courier_staff':
        return t('detailPattern', {
          count: String(d.event_count ?? 0),
          days: String(d.window_days ?? 30),
        })
      case 'debt_spike':
        return t('detailDebtSpike', {
          courier: String(d.courier_name ?? '—'),
          amount: formatMAD(Number(d.total_balance_mad ?? 0)),
        })
      case 'fraud_auto_block':
        return t('detailAutoBlock')
      case 'over_cap':
        return t('detailOverCap')
      case 'inventory_delta':
        return t('detailInventoryDelta', { delta: String(d.delta ?? 0) })
      default:
        return ''
    }
  }

  function handleRunDetections() {
    setDetecting(true)
    setDetectionResult(null)
    setDetectionError(null)
    startTransition(async () => {
      const res = await runGuardianDetections()
      setDetecting(false)
      if (res.error) {
        setDetectionError(resolveError(res.error))
        return
      }
      setDetectionResult(
        t('detectionsResult', {
          ghost: res.ghostReturns ?? 0,
          patterns: res.patterns ?? 0,
          debt: res.debtSpikes ?? 0,
        }),
      )
      router.refresh()
    })
  }

  function openResolveForm(alertId: string, mode: ResolveMode) {
    setActiveAlertId(alertId)
    setActiveMode(mode)
    setReason('')
    setRowError(null)
  }

  function cancelResolve() {
    setActiveAlertId(null)
    setActiveMode(null)
    setReason('')
    setRowError(null)
  }

  function submitResolve(e: React.FormEvent) {
    e.preventDefault()
    if (!activeAlertId || !activeMode) return
    setRowError(null)
    startTransition(async () => {
      const res = await resolveGuardianAlert({ alertId: activeAlertId, status: activeMode, reason: reason.trim() })
      if (res.error) {
        setRowError(resolveError(res.error))
        return
      }
      cancelResolve()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRunDetections}
          disabled={detecting || isPending}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {detecting ? t('runDetectionsRunning') : t('runDetectionsButton')}
        </button>
        {detectionResult && <p className="text-xs text-success-fg">{detectionResult}</p>}
        {detectionError && <p className="text-xs text-danger-fg">{detectionError}</p>}
      </div>

      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted p-5">{t('alertsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {alerts.map((a) => (
              <li key={a.id} className={`p-4 border-l-4 ${SEVERITY_CLASS[a.severity]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {SEVERITY_ICON[a.severity]} {typeLabel(a.alertType)}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {a.courierName && <span>{a.courierName}</span>}
                      {a.courierName && a.orderId && <span> · </span>}
                      {a.orderId && <span className="font-mono">{a.orderId.slice(0, 8).toUpperCase()}</span>}
                      {(a.courierName || a.orderId) && <span> · </span>}
                      <span>
                        {new Date(a.createdAt).toLocaleString(locale, {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </p>
                    <p className="text-xs text-foreground mt-1.5">{detailText(a)}</p>
                  </div>
                  {activeAlertId !== a.id && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openResolveForm(a.id, 'resolved')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-success-soft text-success-fg border border-success hover:opacity-90 transition-opacity"
                      >
                        {t('resolveAction')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openResolveForm(a.id, 'dismissed')}
                        className="text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-surface-2 transition-colors"
                      >
                        {t('dismissAction')}
                      </button>
                    </div>
                  )}
                </div>

                {activeAlertId === a.id && (
                  <form onSubmit={submitResolve} className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t('reasonPlaceholder')}
                      disabled={isPending}
                      className="flex-1 min-w-[200px] px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2"
                    />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isPending
                        ? t('resolveSubmitting')
                        : activeMode === 'resolved'
                          ? t('resolveConfirm')
                          : t('dismissConfirm')}
                    </button>
                    <button
                      type="button"
                      onClick={cancelResolve}
                      disabled={isPending}
                      className="text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-surface-2 transition-colors disabled:opacity-50"
                    >
                      {t('cancelAction')}
                    </button>
                    {rowError && <p className="w-full text-xs text-danger-fg">{rowError}</p>}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
