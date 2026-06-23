import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/app/actions/_guards'
import {
  getStaffMembersWithCapabilities,
  getPermissionAudit,
} from '@/app/actions/staff-permissions'
import { ALL_VOLETS, ALL_CAPABILITIES } from '@/lib/permissions/catalog'
import type { StaffCapability } from '@/app/actions/_guards'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { CapabilitySwitch } from '../_components/capability-switch'
import type { SwitchLabels } from '../_components/capability-switch'

export async function generateMetadata() {
  const t = await getTranslations('admin.permissionsV2')
  return { title: t('metaTitle') }
}

// ─── Helper date locale ───────────────────────────────────────────────────────

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    // Fallback sûr si locale inconnue
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StaffPermissionsPage() {
  // GARDE : réservé aux admins uniquement (ce panneau distribue des capacités)
  const { userId } = await requireAdmin()
  if (!userId) redirect('/admin')

  const [members, auditRows, t, tc] = await Promise.all([
    getStaffMembersWithCapabilities(),
    getPermissionAudit(),
    getTranslations('admin.permissionsV2'),
    getTranslations('admin.common'),
  ])

  // ── Labels toggle résolus côté serveur (strings uniquement → Client Component) ─
  const switchLabels: SwitchLabels = {
    grantLabel: t('grant'),
    revokeLabel: t('revoke'),
    pendingLabel: t('pending'),
    errorFallback: t('errorFallback'),
    statusActive: t('statusActive'),
    statusInactive: t('statusInactive'),
  }

  // ── Libellés volets résolus côté serveur ─────────────────────────────────────
  // t() ne peut pas être appelé côté client → on résout tout ici en strings.
  const voletLabels: Record<string, string> = {}
  for (const volet of ALL_VOLETS) {
    voletLabels[volet.id] = t(`volet.${volet.id}`)
  }

  // ── Libellés capacités résolus côté serveur ───────────────────────────────────
  const capLabels: Record<string, { label: string; desc: string }> = {}
  for (const cap of ALL_CAPABILITIES) {
    capLabels[cap.id] = {
      label: t(`cap.${cap.id}.label`),
      desc: t(`cap.${cap.id}.desc`),
    }
  }

  // ── Libellés audit résolus côté serveur ───────────────────────────────────────
  // La phrase complète est construite ici pour éviter tout texte en dur côté client.
  type AuditCard = {
    id: string
    action: 'grant' | 'revoke'
    sentence: string
    formattedDate: string
  }

  const locale = 'fr-MA' // TODO: récupérer la locale utilisateur depuis les cookies si disponible
  const auditCards: AuditCard[] = auditRows.map((row) => {
    const capLabel = capLabels[row.capability]?.label ?? row.capability
    const actionWord = row.action === 'grant' ? t('auditGranted') : t('auditRevoked')
    // Phrase construite par t() — pas de template en dur dans le JSX
    const sentence = t('auditSentence', {
      actor: row.actor_name,
      action: actionWord,
      capability: capLabel,
      user: row.user_name,
    })
    return {
      id: row.id,
      action: row.action,
      sentence,
      formattedDate: formatDate(row.changed_at, locale),
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

      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        {/* En-tête */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        </div>

        {/* ── Section 1 : Salariés par volet ─────────────────────────────────── */}
        <section aria-labelledby="section-staff">
          <h2
            id="section-staff"
            className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint"
          >
            {t('sectionStaff')}
          </h2>

          {members.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-12 text-center">
              <p className="text-sm font-medium text-foreground">{t('emptyStaff')}</p>
              <p className="mt-1 text-xs text-faint">{t('emptyStaffDesc')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => {
                const granted = new Set<string>(member.grantedCapabilities)

                return (
                  <div
                    key={member.userId}
                    className="rounded-xl border border-line bg-surface overflow-hidden"
                  >
                    {/* En-tête carte salarié */}
                    <div className="border-b border-line bg-surface-2 px-5 py-3">
                      <p className="text-sm font-semibold text-foreground">{member.fullName}</p>
                    </div>

                    {/* Volets — data-driven : boucle sur ALL_VOLETS */}
                    <div className="divide-y divide-line">
                      {ALL_VOLETS.map((volet) => {
                        // Le toggle « Superviseur [volet] » est actif si le salarié
                        // possède TOUTES les capacités du volet (calcul côté serveur).
                        const allGranted =
                          volet.capabilities.length > 0 &&
                          volet.capabilities.every((c: StaffCapability) => granted.has(c))

                        return (
                          <div key={volet.id} className="px-5 py-4">
                            {/* Toggle superviseur volet */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                  {voletLabels[volet.id]}
                                </p>
                                <p className="text-xs text-faint">{t('supervisorLabel')}</p>
                              </div>
                              <CapabilitySwitch
                                kind="volet"
                                userId={member.userId}
                                capabilityOrVolet={volet.id}
                                currentlyEnabled={allGranted}
                                labels={switchLabels}
                              />
                            </div>

                            {/* Tâches fines — une par capacité du volet */}
                            {volet.capabilities.length > 0 && (
                              <div className="mt-3 space-y-2 pl-4 border-l-2 border-line">
                                <p className="text-xs font-medium text-faint mb-2">
                                  {t('fineTasks')}
                                </p>
                                {volet.capabilities.map((cap: StaffCapability) => {
                                  const meta = capLabels[cap]
                                  return (
                                    <div
                                      key={cap}
                                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground">
                                          {meta?.label ?? cap}
                                        </p>
                                        {meta?.desc && (
                                          <p className="mt-0.5 text-xs text-faint leading-relaxed">
                                            {meta.desc}
                                          </p>
                                        )}
                                      </div>
                                      <div className="shrink-0">
                                        <CapabilitySwitch
                                          kind="capability"
                                          userId={member.userId}
                                          capabilityOrVolet={cap}
                                          currentlyEnabled={granted.has(cap)}
                                          labels={switchLabels}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Section 2 : Journal d'audit en cartes ───────────────────────────── */}
        <section aria-labelledby="section-audit">
          <h2
            id="section-audit"
            className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint"
          >
            {t('sectionAudit')}
          </h2>

          {auditCards.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-12 text-center">
              <p className="text-sm font-medium text-foreground">{t('emptyAudit')}</p>
              <p className="mt-1 text-xs text-faint">{t('emptyAuditDesc')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {auditCards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Badge action — grant (vert) / revoke (rouge) */}
                    <span
                      className={`mt-0.5 shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        card.action === 'grant'
                          ? 'bg-success-soft text-success-fg'
                          : 'bg-danger-soft text-danger-fg'
                      }`}
                    >
                      {card.action === 'grant' ? t('auditGranted') : t('auditRevoked')}
                    </span>
                    {/* Phrase complète résolue côté serveur */}
                    <p className="text-xs text-foreground leading-relaxed">{card.sentence}</p>
                  </div>
                  {/* Date en numéraux latins, whitespace-nowrap */}
                  <p className="shrink-0 text-xs text-faint tabular-nums whitespace-nowrap">
                    {card.formattedDate}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
