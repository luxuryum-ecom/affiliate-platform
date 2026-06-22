import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/app/actions/_guards'
import {
  getValidatorCandidates,
  getPermissionAudit,
} from '@/app/actions/staff-permissions'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { PermissionToggle } from './permission-toggle'
import type { ToggleLabels } from './permission-toggle'

export async function generateMetadata() {
  const t = await getTranslations('admin.staffPermissions')
  return { title: t('metaTitle') }
}

// ─── Helper date ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = String(d.getFullYear())
  const hh    = String(d.getHours()).padStart(2, '0')
  const mm    = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hh}:${mm}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StaffPermissionsPage() {
  // GARDE : réservé aux admins uniquement (ce panneau distribue des capacités)
  const { userId } = await requireAdmin()
  if (!userId) redirect('/admin')

  const [candidates, auditRows, t, tc] = await Promise.all([
    getValidatorCandidates(),
    getPermissionAudit(),
    getTranslations('admin.staffPermissions'),
    getTranslations('admin.common'),
  ])

  // Labels résolus côté serveur — uniquement des strings sérialisables
  // passées aux Client Components (règle CLAUDE.md absolue)
  const toggleLabels: ToggleLabels = {
    grantLabel:     t('grant'),
    revokeLabel:    t('revoke'),
    pendingLabel:   t('pending'),
    successGrant:   t('successGrant'),
    successRevoke:  t('successRevoke'),
    errorFallback:  t('errorFallback'),
    statusActive:   t('statusActive'),
    statusInactive: t('statusInactive'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        {/* En-tête */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>

          {/* Note métier : distinguer validate_categories du canal affilié */}
          <div className="mt-4 rounded-lg border border-gold-400/40 bg-gold-400/5 px-4 py-3">
            <p className="text-xs font-semibold text-gold-500">{t('noteTitle')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('noteBody')}</p>
          </div>
        </div>

        {/* ── Section 1 : Liste des salariés ──────────────────────────────── */}
        <section aria-labelledby="section-staff">
          <h2 id="section-staff" className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint">
            {t('sectionStaff')}
          </h2>

          {candidates.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-12 text-center">
              <p className="text-sm font-medium text-foreground">{t('emptyStaff')}</p>
              <p className="mt-1 text-xs text-faint">{t('emptyStaffDesc')}</p>
            </div>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
              {candidates.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {member.full_name}
                    </p>
                    <p className="mt-0.5 text-xs text-faint capitalize">{member.role}</p>
                  </div>

                  <div className="shrink-0">
                    <p className="mb-1.5 text-xs font-medium text-muted">
                      {t('capabilityLabel')}
                    </p>
                    <PermissionToggle
                      userId={member.id}
                      currentlyEnabled={member.can_validate_categories}
                      labels={toggleLabels}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Section 2 : Journal d'audit ─────────────────────────────────── */}
        <section aria-labelledby="section-audit">
          <h2 id="section-audit" className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint">
            {t('sectionAudit')}
          </h2>

          {auditRows.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-12 text-center">
              <p className="text-sm font-medium text-foreground">{t('emptyAudit')}</p>
              <p className="mt-1 text-xs text-faint">{t('emptyAuditDesc')}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-faint uppercase tracking-wide">
                      {t('colAction')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-faint uppercase tracking-wide">
                      {t('colCapability')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-faint uppercase tracking-wide">
                      {t('colUser')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-faint uppercase tracking-wide">
                      {t('colActor')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-faint uppercase tracking-wide tabular-nums">
                      {t('colDate')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {auditRows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.action === 'grant'
                              ? 'bg-success-soft text-success-fg'
                              : 'bg-danger-soft text-danger-fg'
                          }`}
                        >
                          {row.action === 'grant' ? t('actionGranted') : t('actionRevoked')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted font-mono">
                        {row.capability}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">
                        {row.user_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {row.actor_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-faint tabular-nums whitespace-nowrap">
                        {formatDate(row.changed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
