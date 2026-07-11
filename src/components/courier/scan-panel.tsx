'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatMAD } from '@/lib/utils'
import { recordDeliveryScan, declareCourierReturn, type ScanQueueOrder } from '@/app/actions/courier-scan'

// ─── Types minimaux BarcodeDetector (API navigateur native, absente de lib.dom.d.ts
// en TS 5.9) — décrits ici pour rester typés sans dépendance externe. Détection
// PROGRESSIVE : si l'API est absente, on retombe sur la saisie manuelle (toujours
// visible), jamais un blocage. ─────────────────────────────────────────────────
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance
}
declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor
  }
}

interface ScanPanelProps {
  /** Code d'accès livreur — string sérialisable (RÈGLE ABSOLUE CLAUDE.md #2). */
  code: string
  orders: ScanQueueOrder[]
}

type Outcome = 'delivered_collected' | 'delivery_refused'

/**
 * Panneau de scan livraison — cloisonné par `code`. L'action `recordDeliveryScan`
 * est importée directement (jamais transmise en prop) ; seules des données
 * sérialisables (`code` string, `orders` array) arrivent en props.
 *
 * Deux voies pour identifier la commande :
 *  1. Caméra (`BarcodeDetector`, si dispo) : le code scanné DOIT correspondre à
 *     l'`orderId` d'une commande déjà présente dans la file (`orders`) — sinon
 *     « commande inconnue ». On ne fait confiance à aucune donnée hors file.
 *  2. Sélection manuelle (toujours visible, fallback).
 *
 * Double-tap de confirmation avant l'écriture (livré+encaissé / refusé) : pur
 * choix UX pour éviter un mauvais tap en conditions de terrain, ne touche à
 * aucune logique serveur.
 */
export function ScanPanel({ code, orders }: ScanPanelProps) {
  const t = useTranslations('courier.scan')
  const router = useRouter()

  const [selectedId, setSelectedId] = useState<string>('')
  const [confirmOutcome, setConfirmOutcome] = useState<Outcome | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [cameraSupported, setCameraSupported] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null)

  // Détection de support caméra APRÈS montage — évite tout accès à `window`
  // pendant le rendu serveur du Client Component.
  useEffect(() => {
    setCameraSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])

  const selectedOrder = orders.find((o) => o.orderId === selectedId) ?? null

  const stopScan = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setIsScanning(false)
  }, [])

  // Coupe la caméra si le composant se démonte pendant un scan actif.
  useEffect(() => {
    return () => stopScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startScan = useCallback(async () => {
    setScanError(null)
    if (!window.BarcodeDetector) {
      setScanError(t('scanUnavailable'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code', 'code_128'] })
      setIsScanning(true)

      const knownIds = new Set(orders.map((o) => o.orderId))

      const loop = async () => {
        if (!videoRef.current || !detectorRef.current) return
        try {
          const codes = await detectorRef.current.detect(videoRef.current)
          const raw = codes[0]?.rawValue?.trim()
          if (raw) {
            if (knownIds.has(raw)) {
              setSelectedId(raw)
              setScanError(null)
              stopScan()
              return
            }
            setScanError(t('unknownOrder'))
          }
        } catch {
          // Erreur de détection transitoire (frame illisible) — on continue la boucle.
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch {
      setScanError(t('cameraError'))
    }
  }, [orders, stopScan, t])

  function selectOrder(orderId: string) {
    setSelectedId(orderId)
    setConfirmOutcome(null)
    setFeedback(null)
  }

  function handleOutcomeTap(outcome: Outcome) {
    setFeedback(null)
    setConfirmOutcome(outcome)
  }

  async function handleConfirm() {
    if (!selectedOrder || !confirmOutcome) return
    setIsSubmitting(true)
    setFeedback(null)
    // CHAÎNE DE GARDE (Lot D) : « Livré+encaissé » enregistre la livraison (ledger),
    // mais « Refusé/retour » ne fait que DÉCLARER le retour (état declared, dette
    // INCHANGÉE) — la validation (dette annulée) vient du scan de réception d'un
    // salarié dépôt (double confirmation). Le livreur ne peut pas auto-valider un retour.
    const res =
      confirmOutcome === 'delivered_collected'
        ? await recordDeliveryScan({ code, orderId: selectedOrder.orderId, outcome: 'delivered_collected' })
        : await declareCourierReturn({ code, orderId: selectedOrder.orderId })
    setIsSubmitting(false)
    setConfirmOutcome(null)

    if (res.error) {
      setFeedback({ type: 'error', message: res.error })
      return
    }
    setFeedback({
      type: 'success',
      message: confirmOutcome === 'delivered_collected' ? t('successDelivered') : t('successReturnDeclared'),
    })
    setSelectedId('')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Scan caméra */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('scanSectionTitle')}</h2>

        {isScanning ? (
          <div className="space-y-2">
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full rounded-lg bg-black aspect-square object-cover"
            />
            <button
              type="button"
              onClick={stopScan}
              className="w-full py-2.5 rounded-lg border border-line text-sm font-medium text-muted hover:bg-surface-2 transition-colors"
            >
              {t('stopScan')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startScan}
            disabled={!cameraSupported}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('scanButton')}
          </button>
        )}

        {!cameraSupported && <p className="text-xs text-muted">{t('scanUnavailable')}</p>}
        {scanError && <p className="text-xs text-danger-fg">{scanError}</p>}
      </div>

      {/* File / sélection manuelle (toujours visible — fallback) */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('manualSectionTitle')}</h2>

        {orders.length === 0 ? (
          <p className="text-sm text-muted">{t('queueEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <button
                key={o.orderId}
                type="button"
                onClick={() => selectOrder(o.orderId)}
                className={`w-full text-start rounded-lg border p-3 transition-colors ${
                  selectedId === o.orderId
                    ? 'border-primary bg-surface-2'
                    : 'border-line bg-bg hover:bg-surface-2'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-foreground">{o.reference}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      o.assignedToMe ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg'
                    }`}
                  >
                    {o.assignedToMe ? t('assignedBadge') : t('availableBadge')}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted">{o.customerCity ?? '—'}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{formatMAD(o.totalAmount)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Commande sélectionnée + actions */}
      {selectedOrder && (
        <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t('selectedOrderTitle')}</h2>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm text-foreground">{selectedOrder.reference}</span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {formatMAD(selectedOrder.totalAmount)}
            </span>
          </div>
          <p className="text-xs text-muted">{selectedOrder.customerCity ?? '—'}</p>

          {confirmOutcome ? (
            <div className="space-y-2 pt-1">
              <p className="text-sm text-foreground font-medium">
                {confirmOutcome === 'delivered_collected' ? t('confirmDelivered') : t('confirmRefused')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOutcome(null)}
                  disabled={isSubmitting}
                  className="py-2.5 rounded-lg border border-line text-sm font-medium text-muted hover:bg-surface-2 transition-colors disabled:opacity-50"
                >
                  {t('cancelButton')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? t('submitting') : t('confirmButton')}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleOutcomeTap('delivered_collected')}
                className="py-3.5 rounded-lg bg-success-soft border border-success text-success-fg text-sm font-semibold"
              >
                {t('deliveredButton')}
              </button>
              <button
                type="button"
                onClick={() => handleOutcomeTap('delivery_refused')}
                className="py-3.5 rounded-lg bg-danger-soft border border-danger text-danger-fg text-sm font-semibold"
              >
                {t('refusedButton')}
              </button>
            </div>
          )}
        </div>
      )}

      {feedback && (
        <p
          className={`text-sm rounded-xl px-3 py-2 border ${
            feedback.type === 'success'
              ? 'bg-success-soft border-success text-success-fg'
              : 'bg-danger-soft border-danger text-danger-fg'
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  )
}
