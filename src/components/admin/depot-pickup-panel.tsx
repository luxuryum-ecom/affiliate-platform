'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { recordPickupScan, type DepotCourierOption } from '@/app/actions/courier-tours'

// ─── Types minimaux BarcodeDetector (API navigateur native, absente de
// lib.dom.d.ts en TS 5.9) — calqué exactement sur src/components/courier/
// scan-panel.tsx pour rester cohérent. Dégradation PROGRESSIVE : si l'API est
// absente, on retombe sur la saisie manuelle (toujours visible), jamais un
// blocage. ───────────────────────────────────────────────────────────────────
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface DepotPickupPanelProps {
  /** Livreurs actifs — données sérialisables uniquement (RÈGLE ABSOLUE CLAUDE.md #2). */
  couriers: DepotCourierOption[]
}

interface ScannedEntry {
  orderId: string
  reference: string
  courierId: string
}

/**
 * Scan ramassage dépôt (transfert de garde dépôt→livreur). `recordPickupScan`
 * est importée directement (jamais transmise en prop) ; seule la liste des
 * livreurs (déjà filtrée/dénudée côté serveur — id/nom/type, zéro solde) arrive
 * en props.
 *
 * Deux voies pour renseigner la commande :
 *  1. Caméra (`BarcodeDetector`, si dispo) — remplit le champ manuel, ne
 *     soumet jamais automatiquement (le salarié valide toujours le tap).
 *  2. Saisie manuelle (toujours visible, fallback) — UUID collé/tapé.
 */
export function DepotPickupPanel({ couriers }: DepotPickupPanelProps) {
  const t = useTranslations('admin.depotPickup')

  const [courierId, setCourierId] = useState('')
  const [tourId, setTourId] = useState('')
  const [orderIdInput, setOrderIdInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [scanned, setScanned] = useState<ScannedEntry[]>([])

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

      const loop = async () => {
        if (!videoRef.current || !detectorRef.current) return
        try {
          const codes = await detectorRef.current.detect(videoRef.current)
          const raw = codes[0]?.rawValue?.trim()
          if (raw) {
            setOrderIdInput(raw)
            setFeedback(null)
            stopScan()
            return
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
  }, [stopScan, t])

  async function handleScanSubmit() {
    setFeedback(null)

    if (!courierId) {
      setFeedback({ type: 'error', message: t('validationCourier') })
      return
    }
    const orderId = orderIdInput.trim()
    if (!UUID_RE.test(orderId)) {
      setFeedback({ type: 'error', message: t('validationOrderId') })
      return
    }
    const trimmedTourId = tourId.trim()
    if (trimmedTourId && !UUID_RE.test(trimmedTourId)) {
      setFeedback({ type: 'error', message: t('validationTourId') })
      return
    }

    setIsSubmitting(true)
    const res = await recordPickupScan({
      orderId,
      courierId,
      tourId: trimmedTourId || undefined,
    })
    setIsSubmitting(false)

    if (res.error) {
      setFeedback({ type: 'error', message: res.error })
      return
    }

    setScanned((prev) => [
      { orderId, reference: orderId.slice(0, 8).toUpperCase(), courierId },
      ...prev,
    ])
    setFeedback({ type: 'success', message: t('scanSuccess') })
    setOrderIdInput('')
  }

  const selectedCourierName = couriers.find((c) => c.id === courierId)?.name ?? ''

  return (
    <div className="space-y-4">
      {/* Sélecteur livreur + tournée */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('courierSectionTitle')}</h2>

        {couriers.length === 0 ? (
          <p className="text-sm text-muted">{t('noCouriers')}</p>
        ) : (
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="depot-pickup-courier">
              {t('courierLabel')}
            </label>
            <select
              id="depot-pickup-courier"
              value={courierId}
              onChange={(e) => setCourierId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-3 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2"
            >
              <option value="">{t('courierPlaceholder')}</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || t('unnamedCourier')} — {c.courierType === 'company' ? t('typeCompany') : t('typePersonal')}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="depot-pickup-tour">
            {t('tourLabel')}
          </label>
          <input
            id="depot-pickup-tour"
            type="text"
            value={tourId}
            onChange={(e) => setTourId(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('tourPlaceholder')}
            className="w-full px-3 py-3 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2 font-mono"
          />
        </div>
      </div>

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
              className="w-full py-3 rounded-lg border border-line text-sm font-medium text-muted hover:bg-surface-2 transition-colors"
            >
              {t('stopScan')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startScan}
            disabled={!cameraSupported}
            className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('scanButton')}
          </button>
        )}

        {!cameraSupported && <p className="text-xs text-muted">{t('scanUnavailable')}</p>}
        {scanError && <p className="text-xs text-danger-fg">{scanError}</p>}
      </div>

      {/* Saisie manuelle (toujours visible — fallback) + confirmation */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('manualSectionTitle')}</h2>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="depot-pickup-order">
            {t('orderIdLabel')}
          </label>
          <input
            id="depot-pickup-order"
            type="text"
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('orderIdPlaceholder')}
            className="w-full px-3 py-3 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2 font-mono"
          />
        </div>

        {selectedCourierName && (
          <p className="text-xs text-muted">{t('targetCourierHint', { name: selectedCourierName })}</p>
        )}

        <button
          type="button"
          onClick={handleScanSubmit}
          disabled={isSubmitting}
          className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? t('submitting') : t('submitScan')}
        </button>

        {feedback && (
          <p
            className={`text-sm rounded-lg px-3 py-2 border ${
              feedback.type === 'success'
                ? 'bg-success-soft border-success text-success-fg'
                : 'bg-danger-soft border-danger text-danger-fg'
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      {/* Colis ramassés cette session */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t('sessionListTitle', { count: scanned.length })}
        </h2>

        {scanned.length === 0 ? (
          <p className="text-sm text-muted">{t('sessionListEmpty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {scanned.map((entry, idx) => (
              <li
                key={`${entry.orderId}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-success bg-success-soft px-3 py-2"
              >
                <span className="font-mono text-xs text-success-fg">{entry.reference}</span>
                <span className="text-success-fg">✅</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
