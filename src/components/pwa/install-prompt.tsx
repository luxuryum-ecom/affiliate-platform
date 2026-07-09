'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

// PWA (AM-10) : enregistre le service worker + propose l'installation.
// - Chrome/Android/Edge : bannière custom déclenchée par `beforeinstallprompt`.
// - iOS/Safari : pas d'API d'install -> on affiche la marche à suivre manuelle.
// Aucun texte en dur : tout passe par le namespace i18n `pwa` (FR/AR/EN), RTL hérité du <html dir>.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ se présente comme un Mac tactile
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return (iOSDevice || iPadOS) && isSafari
}

export function InstallPrompt() {
  const t = useTranslations('pwa')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [visible, setVisible] = useState(false)

  // Enregistrement du service worker — production uniquement (évite d'interférer avec le HMR en dev).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    const onLoad = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  useEffect(() => {
    if (isStandalone()) return // déjà installée : rien à proposer
    if (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1') return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // on garde la main sur le moment d'afficher
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // iOS n'émet pas beforeinstallprompt : on montre la marche à suivre.
    if (isIos()) {
      setShowIosHint(true)
      setVisible(true)
    }

    const onInstalled = () => setVisible(false)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* stockage indisponible : on masque simplement pour cette session */
    }
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label={t('installTitle')}
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-gold-300/40 bg-ink-900 px-4 py-3 text-white shadow-premium">
        <Image
          src="/icons/icon-192.png"
          alt="Abdou Baba"
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-white">{t('installTitle')}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/70">
            {showIosHint ? t('iosHint') : t('installBody')}
          </p>
        </div>
        {showIosHint ? (
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-white/70"
          >
            {t('gotIt')}
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-2.5 py-2 text-xs font-medium text-white/60"
            >
              {t('later')}
            </button>
            <button
              type="button"
              onClick={install}
              className="rounded-lg bg-gold-500 px-3.5 py-2 text-xs font-bold text-ink-900 active:bg-gold-600"
            >
              {t('installButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
