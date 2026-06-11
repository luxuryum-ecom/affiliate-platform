import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import SourcingForm from './SourcingForm'
import type { Profile, SourcingRequest, SourcingRequestStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.sourcing')
  return { title: t('metaTitle') }
}

export default async function WholesaleSourcingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data } = await supabase
    .from('sourcing_requests')
    .select('id, product_name, category, quantity, target_budget_mad, target_country, delivery_deadline, status, created_at')
    .eq('wholesaler_id', user!.id)
    .order('created_at', { ascending: false })

  const requests = (data ?? []) as unknown as Pick<
    SourcingRequest,
    'id' | 'product_name' | 'category' | 'quantity' | 'target_budget_mad' | 'target_country' | 'delivery_deadline' | 'status' | 'created_at'
  >[]

  const t = await getTranslations('wholesale.sourcing')
  const tc = await getTranslations('wholesale.common')
  const locale = await getLocale()

  const STATUS_LABELS: Record<SourcingRequestStatus, { label: string; cls: string }> = {
    pending:  { label: t('statusPending'),  cls: 'bg-surface-2 text-muted' },
    matching: { label: t('statusMatching'), cls: 'bg-warning-soft text-warning-fg' },
    matched:  { label: t('statusMatched'),  cls: 'bg-warning-soft text-warning-fg' },
    quoted:   { label: t('statusQuoted'),   cls: 'bg-success-soft text-success-fg' },
    closed:   { label: t('statusClosed'),   cls: 'bg-surface-2 text-faint' },
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/wholesale/dashboard"
        backLabel={tc('backToDashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Intro */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-1">{t('subtitle')}</p>
        </div>

        {/* Submission form */}
        <div className="bg-surface rounded-xl border border-line p-6">
          <h2 className="text-sm font-semibold text-foreground mb-5">{t('formTitle')}</h2>
          <SourcingForm
            labels={{
              fieldProduct: t('fieldProduct'),
              fieldProductPlaceholder: t('fieldProductPlaceholder'),
              fieldCategory: t('fieldCategory'),
              fieldCategoryPlaceholder: t('fieldCategoryPlaceholder'),
              fieldQty: t('fieldQty'),
              fieldQtyPlaceholder: t('fieldQtyPlaceholder'),
              fieldBudget: t('fieldBudget'),
              fieldBudgetPlaceholder: t('fieldBudgetPlaceholder'),
              fieldCountry: t('fieldCountry'),
              fieldCountryNone: t('fieldCountryNone'),
              fieldDeadline: t('fieldDeadline'),
              fieldNotes: t('fieldNotes'),
              fieldNotesPlaceholder: t('fieldNotesPlaceholder'),
              submit: t('submit'),
              submitting: t('submitting'),
              successTitle: t('successTitle'),
              successSubtitle: t('successSubtitle'),
            }}
          />
        </div>

        {/* Past requests */}
        {requests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t('requestsTitle', { count: requests.length })}
            </h2>
            <div className="space-y-3">
              {requests.map((r) => {
                const badge = STATUS_LABELS[r.status]
                return (
                  <div key={r.id} className="bg-surface rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        {/* product_name is user input / DB data */}
                        <p className="text-sm font-medium text-foreground">{r.product_name}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {t('requestMeta', {
                            category: r.category,
                            quantity: r.quantity,
                            budget: Number(r.target_budget_mad).toFixed(2),
                          })}
                          {r.target_country ? ` · ${r.target_country}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {r.delivery_deadline && (
                      <p className="text-xs text-faint mt-2">
                        {t('deadlineLabel', {
                          date: new Date(r.delivery_deadline).toLocaleDateString(locale),
                        })}
                      </p>
                    )}
                    <p className="text-xs text-faint mt-1">
                      {new Date(r.created_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
