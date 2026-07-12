'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatMAD } from '@/lib/utils'
import { recordDepotReception } from '@/app/actions/guardian'

// ─── Types minimaux BarcodeDetector (API navigateur native, absente de
// lib.dom.d.ts en TS 5.9) — calqué sur src/components/courier/scan-panel.tsx
// et src/components/admin/depot-pickup-panel.tsx pour rester cohérent.
// Dégradation PROGRESSIVE : si l'API est absente, saisie manuelle (toujours
// visible), jamais un blocage. ────────────────────────────────────────────
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

type ResultState =
  | { kind: 'nominal'; orderRef: string; bearerName: string; amountMad: number }
  | { kind: 'collusion'; orderRef: string; bearerName: string; amountMad: number }
  | { kind: 'ghost_parcel'; orderRef: string }
  | { kind: 'cross_imputation'; orderRef: string }

/**
 * Réception guidée au dépôt — RÈGLE DU PORTEUR (Lot G). AUCUN menu déroulant
 * de livreur, AUCUNE saisie de livreur : le porteur est TOUJOURS déduit
 * côté serveur (`recordDepotReception`), jamais choisi ici. `recordDepotReception`
 * est importée directement (server action), jamais transmise en prop — données
 * sérialisables uniquement (RÈGLE ABSOLUE CLAUDE.md #2).
 *
 * Un seul appel serveur par colis scanné : la RPC `record_depot_reception` est
 * déjà l'action complète (elle écrit ET renvoie le résultat) — il n'y a pas
 * d'étape de « prévisualisation » séparée côté RPC. L'écran de résultat GRAND
 * (porteur + montant) affiché après cet appel EST la confirmation visuelle.
 * Décision UI : on n'ajoute pas un second appel réseau après ce premier appel
 * (le rappeler avec confirmedCourierId re-déclencherait la RPC sur un colis déjà
 * traité et pourrait, à tort, signaler une collusion — cf. commentaire dans
 * src/app/actions/guardian.ts). Le bouton unique déclenche donc l'unique appel.
 */
export function DepotReceptionPanel() {
  const t = useTranslations('admin.reception')
  const te = useTranslations('errors')

  const [orderIdInput, setOrderIdInput] = useState('')
  const [transporterNote, setTransporterNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState | null>(null)

  const [cameraSupported, setCameraSupported] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null)

  useEffect(() => {
    setCameraSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])

  function resolveError(message: string) {
    return message.startsWith('errors.') ? te(message.slice('errors.'.length)) : message
  }

  const stopScan = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setIsScanning(false)
  }, [])

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
            setError(null)
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

  async function handleConfirm() {
    setError(null)
    const orderId = orderIdInput.trim()
    if (!UUID_RE.test(orderId)) {
      setError(t('validationOrderId'))
      return
    }

    setIsSubmitting(true)
    const res = await recordDepotReception({
      orderId,
      transporterNote: transporterNote.trim() || undefined,
    })
    setIsSubmitting(false)

    const orderRef = orderId.slice(0, 8).toUpperCase()

    if (res.refusal === 'ghost_parcel') {
      setResult({ kind: 'ghost_parcel', orderRef })
      return
    }
    if (res.refusal === 'cross_imputation') {
      setResult({ kind: 'cross_imputation', orderRef })
      return
    }
    if (res.error) {
      setError(resolveError(res.error))
      return
    }
    if (res.reception) {
      setResult({
        kind: res.reception.path === 'collusion_flagged' ? 'collusion' : 'nominal',
        orderRef,
        bearerName: res.reception.bearerName,
        amountMad: res.reception.amountMad,
      })
    }
  }

  function reset() {
    setResult(null)
    setError(null)
    setOrderIdInput('')
    setTransporterNote('')
  }

  if (result) {
    if (result.kind === 'ghost_parcel' || result.kind === 'cross_imputation') {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-danger bg-danger-soft p-6 text-center space-y-3">
            <p className="text-4xl">🚨</p>
            <p className="text-sm font-mono text-danger-fg">{result.orderRef}</p>
            <p className="text-lg font-bold text-danger-fg">
              {result.kind === 'ghost_parcel' ? t('resultGhostTitle') : t('resultCrossTitle')}
            </p>
            <p className="text-sm text-danger-fg">
              {result.kind === 'ghost_parcel' ? t('resultGhostDetail') : t('resultCrossDetail')}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            {t('newScanButton')}
          </button>
        </div>
      )
    }

    const isCollusion = result.kind === 'collusion'
    return (
      <div className="space-y-4">
        <div
          className={`rounded-2xl border-2 p-6 text-center space-y-3 ${
            isCollusion ? 'border-warning bg-warning-soft' : 'border-success bg-success-soft'
          }`}
        >
          <p className="text-4xl">{isCollusion ? '⚠️' : '✅'}</p>
          <p className={`text-sm font-mono ${isCollusion ? 'text-warning-fg' : 'text-success-fg'}`}>{result.orderRef}</p>
          <div className={isCollusion ? 'text-warning-fg' : 'text-success-fg'}>
            <p className="text-xs uppercase tracking-wide opacity-80">{t('resultBearerLabel')}</p>
            <p className="text-xl font-bold">{result.bearerName}</p>
          </div>
          <p className={`text-3xl font-bold tabular-nums ${isCollusion ? 'text-warning-fg' : 'text-success-fg'}`}>
            {formatMAD(result.amountMad)}
          </p>
          <p className={`text-sm font-semibold ${isCollusion ? 'text-warning-fg' : 'text-success-fg'}`}>
            {isCollusion ? t('resultCollusionTitle') : t('resultNominalTitle')}
          </p>
          {isCollusion && <p className="text-xs text-warning-fg">{t('resultCollusionDetail')}</p>}
        </div>
        <button
          type="button"
          onClick={reset}
          className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
        >
          {t('newScanButton')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Scan caméra */}
      <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('scanSectionTitle')}</h2>

        {isScanning ? (
          <div className="space-y-2">
            <video ref={videoRef} muted playsInline className="w-full rounded-lg bg-black aspect-square object-cover" />
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
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="reception-order">
            {t('orderIdLabel')}
          </label>
          <input
            id="reception-order"
            type="text"
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('orderIdPlaceholder')}
            className="w-full px-3 py-3 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="reception-transporter">
            {t('transporterNoteLabel')}
          </label>
          <input
            id="reception-transporter"
            type="text"
            value={transporterNote}
            onChange={(e) => setTransporterNote(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('transporterNotePlaceholder')}
            className="w-full px-3 py-3 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2"
          />
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? t('submitting') : t('confirmButton')}
        </button>

        {error && (
          <p className="text-sm rounded-lg px-3 py-2 border bg-danger-soft border-danger text-danger-fg">{error}</p>
        )}
      </div>
    </div>
  )
}
