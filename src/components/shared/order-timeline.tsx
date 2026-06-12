interface TimelineStep {
  label: string
  timestamp: string | null
  /** 'done' = past step; 'current' = current status; 'future' = not yet reached; 'skipped' = cancelled/returned */
  state: 'done' | 'current' | 'future' | 'skipped'
  /** Optional note shown below the timestamp. */
  note?: string | null
}

interface OrderTimelineProps {
  steps: TimelineStep[]
}

const DOT: Record<TimelineStep['state'], string> = {
  done:    'bg-green-500 border-green-500',
  current: 'bg-blue-500 border-blue-500',
  future:  'bg-white border-gray-300',
  skipped: 'bg-red-400 border-red-400',
}

const LABEL: Record<TimelineStep['state'], string> = {
  done:    'text-gray-900',
  current: 'text-blue-700 font-semibold',
  future:  'text-gray-400',
  skipped: 'text-red-500 line-through',
}

const CONNECTOR: Record<TimelineStep['state'], string> = {
  done:    'bg-green-200',
  current: 'bg-blue-100',
  future:  'bg-gray-100',
  skipped: 'bg-red-100',
}

export function OrderTimeline({ steps }: OrderTimelineProps) {
  return (
    <ol>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        return (
          <li key={i} className="flex gap-3">
            {/* Icon column */}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full border-2 mt-0.5 shrink-0 ${DOT[step.state]}`} />
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-5 ${CONNECTOR[step.state]}`} />
              )}
            </div>

            {/* Content */}
            <div className="pb-5 min-w-0">
              <p className={`text-sm ${LABEL[step.state]}`}>{step.label}</p>
              {step.timestamp ? (
                <p className="text-xs text-gray-400 tabular-nums mt-0.5">
                  {new Date(step.timestamp).toLocaleString('fr-MA', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              ) : step.state === 'future' ? (
                <p className="text-xs text-gray-300 mt-0.5">En attente</p>
              ) : null}
              {step.note && (
                <p className="text-xs text-gray-400 italic mt-0.5">{step.note}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Helper: build COD order timeline steps ───────────────────────────────────

import type { Order } from '@/types/database'

export function buildCodTimeline(order: Order): TimelineStep[] {
  const { status } = order

  const isCancelled           = status === 'cancelled'
  const isPendingConfirmation = status === 'pending_confirmation'
  const reachedConfirmed      = ['confirmed', 'shipped', 'delivered', 'returned'].includes(status)
  const reachedShipped        = ['shipped', 'delivered', 'returned'].includes(status)
  const reachedDelivered      = ['delivered', 'returned'].includes(status) && !!order.delivered_at
  const isReturned            = status === 'returned'

  const steps: TimelineStep[] = [
    {
      label: 'Commande reçue',
      timestamp: order.created_at,
      state: 'done',
    },
    {
      label: 'Confirmation téléphonique',
      timestamp: isPendingConfirmation ? order.created_at : order.confirmed_at,
      state: isCancelled && !reachedConfirmed
        ? 'skipped'
        : reachedConfirmed
        ? 'done'
        : isPendingConfirmation
        ? 'current'
        : 'future',
    },
    {
      label: 'Confirmée',
      timestamp: order.confirmed_at,
      state: isCancelled && !reachedConfirmed
        ? 'skipped'
        : reachedConfirmed && !isPendingConfirmation
        ? 'done'
        : status === 'confirmed'
        ? 'current'
        : 'future',
    },
    {
      label: 'Expédiée',
      timestamp: order.shipped_at,
      state: isCancelled && !reachedShipped
        ? 'skipped'
        : reachedShipped
        ? 'done'
        : status === 'confirmed'
        ? 'current'
        : 'future',
    },
    {
      label: 'Livrée',
      timestamp: order.delivered_at,
      state: isCancelled
        ? 'skipped'
        : reachedDelivered
        ? 'done'
        : isReturned && !order.delivered_at
        ? 'skipped'
        : status === 'delivered'
        ? 'done'
        : status === 'shipped'
        ? 'current'
        : 'future',
    },
  ]

  // Append a "Retournée" step only when the order is actually returned.
  // This handles both shipped→returned (delivered step shows skipped) and
  // delivered→returned (delivered step shows done, then Retournée appended).
  if (isReturned) {
    steps.push({
      label: 'Retournée',
      timestamp: order.returned_at,
      state: 'skipped',
    })
  }

  return steps
}

// ─── Helper: build wholesale order timeline steps ─────────────────────────────

import type { WholesaleOrder, WholesaleOrderBuyerView } from '@/types/database'

export function buildWholesaleTimeline(order: WholesaleOrder | WholesaleOrderBuyerView): TimelineStep[] {
  const { status } = order

  const isCancelled = status === 'cancelled'
  const reached = (s: string) =>
    ['confirmed', 'sourcing', 'shipped', 'delivered'].slice(
      ['confirmed', 'sourcing', 'shipped', 'delivered'].indexOf(s)
    ).length === 0
      ? false
      : ['confirmed', 'sourcing', 'shipped', 'delivered'].indexOf(status) >=
        ['confirmed', 'sourcing', 'shipped', 'delivered'].indexOf(s)

  return [
    {
      label: 'Commande créée',
      timestamp: order.created_at,
      state: 'done',
    },
    {
      label: 'Confirmée',
      timestamp: order.confirmed_at,
      state: isCancelled && !reached('confirmed')
        ? 'skipped'
        : reached('confirmed')
        ? 'done'
        : status === 'pending'
        ? 'current'
        : 'future',
    },
    {
      label: 'En sourcing',
      timestamp: order.sourcing_at,
      state: isCancelled && !reached('sourcing')
        ? 'skipped'
        : reached('sourcing')
        ? 'done'
        : status === 'confirmed'
        ? 'current'
        : 'future',
    },
    {
      label: 'Expédiée',
      timestamp: order.shipped_at,
      state: isCancelled && !reached('shipped')
        ? 'skipped'
        : reached('shipped')
        ? 'done'
        : status === 'sourcing'
        ? 'current'
        : 'future',
    },
    {
      label: 'Livrée',
      timestamp: order.delivered_at,
      state: isCancelled
        ? 'skipped'
        : status === 'delivered'
        ? 'done'
        : status === 'shipped'
        ? 'current'
        : 'future',
    },
  ]
}

// ─── Helper: build import history as timeline steps ───────────────────────────

import type { WholesaleOrderImportHistory, WholesaleImportStatus } from '@/types/database'

const IMPORT_LABELS: Record<WholesaleImportStatus, string> = {
  awaiting_supplier: 'En attente fournisseur',
  purchased:         'Acheté',
  in_production:     'En production',
  ready_to_ship:     'Prêt à expédier',
  shipped:           'Expédié (import)',
  customs_clearance: 'Dédouanement',
  delivered:         'Livré (import)',
}

/**
 * Converts import history entries (newest first) into timeline steps.
 * Most recent entry = 'current'; all others = 'done'.
 */
export function buildImportHistoryTimeline(
  history: WholesaleOrderImportHistory[]
): TimelineStep[] {
  return history.map((entry, i) => ({
    label:     IMPORT_LABELS[entry.import_status as WholesaleImportStatus] ?? entry.import_status,
    timestamp: entry.changed_at,
    state:     i === 0 ? 'current' : 'done',
    note:      entry.notes ?? null,
  }))
}

// ─── Helper: build payment history as timeline steps ─────────────────────────

import type { WholesaleOrderPaymentHistory, WholesalePaymentStatus } from '@/types/database'

const PAYMENT_LABELS: Record<WholesalePaymentStatus, string> = {
  no_deposit:        'Aucun acompte',
  deposit_requested: 'Acompte demandé',
  deposit_received:  'Acompte reçu',
  fully_paid:        'Entièrement réglé',
}

/**
 * Converts payment history entries (newest first) into timeline steps.
 * Most recent entry = 'current'; all others = 'done'.
 */
export function buildPaymentHistoryTimeline(
  history: WholesaleOrderPaymentHistory[]
): TimelineStep[] {
  return history.map((entry, i) => ({
    label:     PAYMENT_LABELS[entry.payment_status as WholesalePaymentStatus] ?? entry.payment_status,
    timestamp: entry.changed_at,
    state:     i === 0 ? 'current' : 'done',
    note:      entry.notes ?? null,
  }))
}
