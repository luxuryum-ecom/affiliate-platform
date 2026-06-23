import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/app/actions/_guards'
import { getAgentCountryAssignments } from '@/app/actions/agent-countries'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { CapabilitySwitch } from '../../_components/capability-switch'
import type { SwitchLabels } from '../../_components/capability-switch'
import { CountryCheckboxes } from './country-checkboxes'

export async function generateMetadata() {
  const t = await getTranslations('admin.agentSourcing')
  return { title: t('metaTitle') }
}

export default async function AgentSourcingPage() {
  const { userId } = await requireAdmin()
  if (!userId) redirect('/admin')

  const [agents, t, tc] = await Promise.all([
    getAgentCountryAssignments(),
    getTranslations('admin.agentSourcing'),
    getTranslations('admin.common'),
  ])

  // Labels toggle résolus côté serveur — strings uniquement vers Client Component
  const switchLabels: SwitchLabels = {
    grantLabel: t('grant'),
    revokeLabel: t('revoke'),
    pendingLabel: t('pending'),
    errorFallback: t('errorFallback'),
    statusActive: t('statusActive'),
    statusInactive: t('statusInactive'),
  }

  const countryLabels = {
    cn: t('countryChina'),
    tr: t('countryTurkey'),
    eg: t('countryEgypt'),
    ae: t('countryDubai'),
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>

          <div className="mt-4 rounded-lg border border-gold-400/40 bg-gold-400/5 px-4 py-3">
            <p className="text-xs font-semibold text-gold-500">{t('noteTitle')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('noteBody')}</p>
          </div>
        </div>

        <section aria-labelledby="section-agents">
          <h2
            id="section-agents"
            className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint"
          >
            {t('sectionAgents')}
          </h2>

          {agents.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-12 text-center">
              <p className="text-sm font-medium text-foreground">{t('emptyAgents')}</p>
              <p className="mt-1 text-xs text-faint">{t('emptyAgentsDesc')}</p>
            </div>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 shrink-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {agent.full_name}
                    </p>
                    <p className="mt-0.5 text-xs text-faint capitalize">{agent.role}</p>
                  </div>

                  <div className="flex flex-col gap-4 sm:items-end">
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted">
                        {t('capabilityLabel')}
                      </p>
                      {/* Toggle factorisé — kind='capability', manage_country_sourcing */}
                      <CapabilitySwitch
                        kind="capability"
                        userId={agent.id}
                        capabilityOrVolet="manage_country_sourcing"
                        currentlyEnabled={agent.has_capability}
                        labels={switchLabels}
                      />
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted">
                        {t('countriesLabel')}
                      </p>
                      <CountryCheckboxes
                        agentId={agent.id}
                        linkedCodes={agent.country_codes}
                        countryLabels={countryLabels}
                        pendingLabel={t('checkboxPending')}
                        errorFallback={t('checkboxError')}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
