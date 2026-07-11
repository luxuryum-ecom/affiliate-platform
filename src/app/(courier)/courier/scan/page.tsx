import { getTranslations } from 'next-intl/server'
import { resolveCourierSession, getCourierScanQueue } from '@/app/actions/courier-scan'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ScanPanel } from '@/components/courier/scan-panel'

export async function generateMetadata() {
  const t = await getTranslations('courier.scan')
  return { title: t('metaTitle') }
}

interface PageProps {
  searchParams: Promise<{ code?: string }>
}

/**
 * Portail livreur cloisonné — `/courier/scan?code=...` (module Livreurs, Lot B).
 *
 * AUCUNE session Supabase : le livreur est résolu uniquement via son `code`
 * (mig 127, hash + TTL + rate-limit côté `resolveCourierSession`). Erreur
 * GÉNÉRIQUE si invalide/expiré — ne jamais divulguer pourquoi (code faux vs
 * expiré vs bloqué vs rate-limité), cf. `courier-scan.ts`.
 *
 * Cloisonnement strict : la file (`getCourierScanQueue`) ne renvoie que
 * référence courte / ville / montant COD / statut — zéro marge, zéro PII
 * client au-delà de la ville, zéro donnée admin.
 */
export default async function CourierScanPage({ searchParams }: PageProps) {
  const { code } = await searchParams
  const cleanCode = (code ?? '').trim()

  const t = await getTranslations('courier.scan')

  const { error: sessionError, session } = await resolveCourierSession(cleanCode)

  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-bg grid place-items-center px-4">
        <div className="max-w-sm w-full text-center space-y-3 bg-surface border border-line rounded-xl p-6">
          <p className="text-3xl" aria-hidden="true">
            🔒
          </p>
          <h1 className="text-base font-semibold text-foreground">{t('invalidTitle')}</h1>
          <p className="text-sm text-muted">{t('invalidMessage')}</p>
        </div>
      </div>
    )
  }

  const { error: queueError, courierName, orders } = await getCourierScanQueue(cleanCode)

  return (
    <div className="min-h-screen bg-bg">
      {/* Header minimal mobile — PAS le header admin (ni logo admin ni cloche notifs) */}
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{courierName ?? session.name}</p>
            <p className="text-[11px] text-muted">{t('pageTitle')}</p>
          </div>
          <LanguageSwitcher variant="light" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {queueError && (
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger rounded-xl px-3 py-2">
            {t('queueError', { message: queueError })}
          </p>
        )}
        <ScanPanel code={cleanCode} orders={orders} />
      </main>
    </div>
  )
}
