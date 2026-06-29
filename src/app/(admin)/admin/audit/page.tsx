import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { requireAdmin } from '@/app/actions/_guards'
import { getAuditLog } from '@/app/actions/audit'
import { AUDIT_ACTIONS } from '@/lib/audit/actions'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { AuditFilter } from '@/components/admin/audit-filter'

export async function generateMetadata() {
  const t = await getTranslations('admin.audit')
  return { title: t('metaTitle') }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>
}) {
  const { userId } = await requireAdmin()
  if (!userId) redirect('/admin')

  const { action } = await searchParams
  const [rows, t, tc] = await Promise.all([
    getAuditLog({ action }),
    getTranslations('admin.audit'),
    getTranslations('admin.common'),
  ])

  const locale = await getLocale()
  const isRtl = locale.split('-')[0] === 'ar'

  // Libellés d'action résolus côté serveur (strings → Client Component).
  const actionLabels: Record<string, string> = {}
  for (const a of AUDIT_ACTIONS) actionLabels[a] = t(`action.${a}`)
  const labelOf = (a: string) => actionLabels[a] ?? a

  return (
    <div className="min-h-screen bg-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
          </div>
          <AuditFilter allLabel={t('filterAll')} filterLabel={t('filterLabel')} actionLabels={actionLabels} />
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-12 text-center">
            <p className="text-sm font-medium text-foreground">{t('empty')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-start text-xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-3 text-start font-semibold">{t('colWho')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('colAction')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('colTarget')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('colChange')}</th>
                  <th className="px-4 py-3 text-start font-semibold whitespace-nowrap">{t('colWhen')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{r.actorName}</span>
                      <span className="block text-xs text-faint">{r.actorRole}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-foreground">
                        {labelOf(r.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{r.target || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted">{r.change || '—'}</td>
                    <td className="px-4 py-3 text-xs text-faint tabular-nums whitespace-nowrap">{r.dateLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
