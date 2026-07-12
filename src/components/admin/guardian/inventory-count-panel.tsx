'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { openInventory, recordInventoryCount, closeInventory } from '@/app/actions/guardian'

/**
 * Inventaire mensuel guidé (Lot G) — ouvrir une campagne, compter les lignes,
 * clôturer. Données sérialisables uniquement — les server actions sont
 * importées directement, jamais transmises en prop (RÈGLE ABSOLUE CLAUDE.md #2).
 */

export interface InventoryLineItem {
  variantId: string
  label: string
  expectedQty: number
  countedQty: number | null
}

interface InventorySnapshotInfo {
  id: string
  periodLabel: string
  status: string
}

interface InventoryCountPanelProps {
  snapshot: InventorySnapshotInfo | null
  lines: InventoryLineItem[]
  closedDeltasCount: number
  /** true = admin (seul rôle autorisé à clôturer, cf. close_inventory_snapshot). */
  canClose: boolean
}

export function InventoryCountPanel({ snapshot, lines, closedDeltasCount, canClose }: InventoryCountPanelProps) {
  const t = useTranslations('admin.inventory')
  const te = useTranslations('errors')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function resolveError(message: string) {
    return message.startsWith('errors.') ? te(message.slice('errors.'.length)) : message
  }

  // ── Ouverture d'une nouvelle campagne ────────────────────────────────────
  const [periodLabel, setPeriodLabel] = useState('')
  const [openError, setOpenError] = useState<string | null>(null)

  function handleOpen(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = periodLabel.trim()
    if (!trimmed) {
      setOpenError(t('periodLabelRequired'))
      return
    }
    setOpenError(null)
    startTransition(async () => {
      const res = await openInventory(trimmed)
      if (res.error) {
        setOpenError(resolveError(res.error))
        return
      }
      router.refresh()
    })
  }

  // ── Comptage des lignes ───────────────────────────────────────────────
  const [localLines, setLocalLines] = useState<InventoryLineItem[]>(lines)
  const [draftQty, setDraftQty] = useState<Record<string, string>>({})
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null)
  const [lineError, setLineError] = useState<string | null>(null)

  const countedCount = useMemo(() => localLines.filter((l) => l.countedQty !== null).length, [localLines])

  function handleSaveLine(variantId: string) {
    if (!snapshot) return
    const raw = draftQty[variantId]
    const qty = Number(raw)
    if (raw === undefined || raw === '' || !Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      setLineError(t('countInvalid'))
      return
    }
    setLineError(null)
    setSavingVariantId(variantId)
    startTransition(async () => {
      const res = await recordInventoryCount({ snapshotId: snapshot.id, variantId, countedQty: qty })
      setSavingVariantId(null)
      if (res.error) {
        setLineError(resolveError(res.error))
        return
      }
      setLocalLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, countedQty: qty } : l)))
    })
  }

  // ── Clôture ───────────────────────────────────────────────────────────
  const [closeResult, setCloseResult] = useState<number | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)

  function handleClose() {
    if (!snapshot) return
    setCloseError(null)
    startTransition(async () => {
      const res = await closeInventory(snapshot.id)
      if (res.error) {
        setCloseError(resolveError(res.error))
        return
      }
      setCloseResult(res.deltas ?? 0)
      router.refresh()
    })
  }

  // ── Pas de campagne ouverte : formulaire de démarrage ────────────────
  if (!snapshot || snapshot.status === 'closed') {
    return (
      <div className="space-y-4">
        {snapshot?.status === 'closed' && (
          <div className="rounded-xl border border-success bg-success-soft p-4">
            <p className="text-sm font-semibold text-success-fg">{t('lastCampaignClosedTitle', { period: snapshot.periodLabel })}</p>
            <p className="text-xs text-success-fg mt-1">{t('lastCampaignDeltas', { count: closedDeltasCount })}</p>
          </div>
        )}

        <form onSubmit={handleOpen} className="bg-surface border border-line rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t('openSectionTitle')}</h2>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="inventory-period">
              {t('periodLabelLabel')}
            </label>
            <input
              id="inventory-period"
              type="text"
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              disabled={isPending}
              placeholder={t('periodLabelPlaceholder')}
              className="w-full px-3 py-3 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? t('openSubmitting') : t('openButton')}
          </button>
          {openError && <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">{openError}</p>}
        </form>
      </div>
    )
  }

  // ── Campagne ouverte : comptage guidé ─────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t('countingSectionTitle', { period: snapshot.periodLabel })}</h2>
          <span className="text-xs px-2 py-0.5 bg-surface-2 text-muted rounded-full tabular-nums">
            {t('countingProgress', { counted: countedCount, total: localLines.length })}
          </span>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl divide-y divide-line/60">
        {localLines.length === 0 ? (
          <p className="text-sm text-muted p-5">{t('linesEmpty')}</p>
        ) : (
          localLines.map((line) => {
            const isSaving = savingVariantId === line.variantId
            const value = draftQty[line.variantId] ?? (line.countedQty !== null ? String(line.countedQty) : '')
            return (
              <div key={line.variantId} className="p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{line.label}</p>
                  <p className="text-xs text-muted">{t('expectedQtyLabel', { qty: line.expectedQty })}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={value}
                  disabled={isPending}
                  onChange={(e) => setDraftQty((prev) => ({ ...prev, [line.variantId]: e.target.value }))}
                  className="w-20 px-2 py-2 border border-line rounded-lg text-sm bg-surface text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2"
                />
                <button
                  type="button"
                  onClick={() => handleSaveLine(line.variantId)}
                  disabled={isPending}
                  className={`text-xs px-3 py-2 rounded-lg font-medium transition-opacity disabled:opacity-50 ${
                    line.countedQty !== null
                      ? 'bg-success-soft text-success-fg border border-success'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {isSaving ? t('savingLine') : line.countedQty !== null ? t('savedLine') : t('saveLine')}
                </button>
              </div>
            )
          })
        )}
      </div>

      {lineError && <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">{lineError}</p>}

      {canClose && (
        <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
          <p className="text-xs text-muted">{t('closeNote')}</p>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="w-full py-3.5 rounded-lg bg-danger text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? t('closeSubmitting') : t('closeButton')}
          </button>
          {closeError && <p className="text-sm text-danger-fg">{closeError}</p>}
          {closeResult !== null && (
            <p className="text-sm font-medium text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2">
              {t('closeResult', { count: closeResult })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
