import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { requireCapability } from '@/app/actions/_guards'
import {
  getMyAgentSourcingRequests,
  getMyAgentCountries,
} from '@/app/actions/agent-sourcing'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { AgentSourcingRequest } from '@/app/actions/agent-sourcing'

export async function generateMetadata() {
  const t = await getTranslations('admin.agentSourcingRequests')
  return { title: t('metaTitle') }
}

// ─── Helpers (Server Component — fonctions locales, non passées en props) ─────

/**
 * Traduit un code pays en libellé localisé.
 * Résolu côté serveur : seule une string descend aux composants.
 */
function countryLabel(code: string, t: Awaited<ReturnType<typeof getTranslations>>): string {
  const map: Record<string, string> = {
    CN: t('countryChina'),
    TR: t('countryTurkey'),
    EG: t('countryEgypt'),
    AE: t('countryDubai'),
    MA: t('countryMorocco'),
  }
  return map[code.toUpperCase()] ?? code
}

/**
 * Traduit un statut de sourcing en libellé localisé.
 * Résolu côté serveur : seule une string descend aux composants.
 */
function statusLabel(
  status: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const map: Record<string, string> = {
    pending:  t('statusPending'),
    matching: t('statusMatching'),
    matched:  t('statusMatched'),
    quoted:   t('statusQuoted'),
    closed:   t('statusClosed'),
  }
  return map[status] ?? status
}

/**
 * Classe CSS du badge de statut (CSS only — pas de logique côté client).
 */
function statusBadgeCls(status: string): string {
  const map: Record<string, string> = {
    pending:  'bg-surface-2 text-muted border border-line',
    matching: 'bg-warning-subtle text-warning border border-warning-line',
    matched:  'bg-warning-subtle text-warning-dark border border-warning-line',
    quoted:   'bg-success-subtle text-success border border-success-line',
    closed:   'bg-surface-2 text-faint border border-line',
  }
  return map[status] ?? 'bg-surface-2 text-muted border border-line'
}

// ─── Sous-composants Server Component ─────────────────────────────────────────

function CountryBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/40 bg-gold-400/10 px-2.5 py-0.5 text-xs font-medium text-gold-500">
      {label}
    </span>
  )
}

type RequestCardStrings = {
  categoryLabel: string
  quantityValue: string
  countryLabel: string
  deadlineLabel: string
  createdOn: string
  statusLabel: string
  statusBadgeCls: string
  notes: string | null
}

function RequestCard({
  request,
  strings,
}: {
  request: AgentSourcingRequest
  strings: RequestCardStrings
}) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{request.product_name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {strings.categoryLabel} · {strings.quantityValue}
            </p>
            {strings.notes && (
              <p className="mt-1 text-xs text-faint italic">&ldquo;{strings.notes}&rdquo;</p>
            )}
          </div>
          <span
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${strings.statusBadgeCls}`}
          >
            {strings.statusLabel}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CountryBadge label={strings.countryLabel} />
          {strings.deadlineLabel && (
            <span className="text-xs text-faint">{strings.deadlineLabel}</span>
          )}
        </div>

        <p className="mt-2 text-xs text-faint">{strings.createdOn}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AgentSourcingRequestsPage() {
  const { userId } = await requireCapability('manage_country_sourcing')
  if (!userId) redirect('/admin')

  const [requests, myCodes, locale, t, tc] = await Promise.all([
    getMyAgentSourcingRequests(),
    getMyAgentCountries(),
    getLocale(),
    getTranslations('admin.agentSourcingRequests'),
    getTranslations('admin.common'),
  ])

  // Libellés pays de l'agent résolus côté serveur — string[] sérialisable
  const myCountryLabels: string[] = myCodes.map((c) => countryLabel(c.country_code, t))

  // Toutes les strings de chaque carte résolues côté serveur avant de descendre
  const cardData = requests.map((r) => {
    const deadline = r.delivery_deadline
      ? new Date(r.delivery_deadline).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null

    const created = new Date(r.created_at).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

    return {
      request: r,
      strings: {
        categoryLabel: r.category,
        quantityValue: t('quantityValue', { qty: r.quantity }),
        countryLabel:  countryLabel(r.target_country_code, t),
        deadlineLabel: deadline ? t('deadlineLabel', { date: deadline }) : '',
        createdOn:     t('createdOn', { date: created }),
        statusLabel:   statusLabel(r.status, t),
        statusBadgeCls: statusBadgeCls(r.status),
        notes:         r.notes || null,
      } satisfies RequestCardStrings,
    }
  })

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        {/* En-tête */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>

          {/* Pays de l'agent */}
          {myCountryLabels.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-faint">{t('myCountriesLabel')} :</span>
              {myCountryLabels.map((label) => (
                <CountryBadge key={label} label={label} />
              ))}
            </div>
          )}

          <p className="mt-3 text-xs font-medium text-gold-400 tabular-nums">
            {t('requestCount', { count: requests.length })}
          </p>
        </div>

        {/* Rappel de confidentialité */}
        <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
          <p className="text-xs text-faint">{t('confidentialityNote')}</p>
        </div>

        {/* Liste ou état vide */}
        {cardData.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-14 text-center">
            <p className="text-sm font-medium text-foreground">{t('empty')}</p>
            <p className="mt-1 text-xs text-faint">{t('emptyDesc')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {cardData.map(({ request, strings }) => (
              <RequestCard
                key={request.id}
                request={request}
                strings={strings}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
