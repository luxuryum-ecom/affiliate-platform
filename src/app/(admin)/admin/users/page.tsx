import { createClient } from '@/lib/supabase/server'
import { updateUserStatus } from '@/app/actions/users'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.users')
  return { title: t('metaTitle') }
}

// CSS-only — role badges: neutre/accent, no blue/purple
const ROLE_BADGE_CLS: Record<string, string> = {
  affiliate:  'bg-surface-2 text-muted border border-line',
  wholesaler: 'bg-surface-2 text-foreground border border-line',
  supplier:   'bg-surface-2 text-muted border border-line',
}

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const t  = await getTranslations('admin.users')
  const tc = await getTranslations('admin.common')
  const td = await getTranslations('admin.userDetail')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: adminProfile } = (await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()) as { data: { full_name: string } | null; error: unknown }

  const [pendingRes, approvedRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .in('role', ['affiliate', 'wholesaler', 'supplier'])
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, phone, role, status, wholesale_access')
      .eq('status', 'approved')
      .in('role', ['affiliate', 'wholesaler', 'supplier'])
      .order('created_at', { ascending: false }),
  ])

  const pending  = (pendingRes.data ?? []) as Profile[]
  const approved = (approvedRes.data ?? []) as Pick<
    Profile,
    'id' | 'full_name' | 'phone' | 'role' | 'status' | 'wholesale_access'
  >[]

  function roleLabel(role: string) {
    if (role === 'affiliate')  return td('roleAffiliate')
    if (role === 'wholesaler') return td('roleWholesaler')
    if (role === 'supplier')   return tc('unknown')
    return role
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* ── Pending registrations ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('pendingTitle')}</h2>
            {pending.length > 0 && (
              <span className="text-xs px-2 py-0.5 bg-warning-soft text-warning-fg border border-warning rounded-full font-bold">
                {pending.length}
              </span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line px-5 py-4 text-sm text-faint">
              {t('pendingEmpty')}
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {pending.map((profile) => {
                const badgeCls = ROLE_BADGE_CLS[profile.role] ?? ROLE_BADGE_CLS.affiliate
                return (
                  <div key={profile.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{profile.full_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeCls}`}>
                          {roleLabel(profile.role)}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {t('registeredAt', {
                          date: new Date(profile.created_at).toLocaleDateString(locale, {
                            day: '2-digit', month: 'long', year: 'numeric',
                          }),
                        })}
                      </p>
                      {profile.phone && (
                        <p className="text-xs text-faint mt-0.5">{profile.phone}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <form action={updateUserStatus}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-success-soft text-success-fg border border-success text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                        >
                          {t('approve')}
                        </button>
                      </form>
                      <form action={updateUserStatus}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-surface text-danger-fg border border-danger text-xs font-medium rounded-lg hover:bg-danger-soft transition-colors"
                        >
                          {t('reject')}
                        </button>
                      </form>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Approved users ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('approvedTitle')}</h2>
            <span className="text-xs px-2 py-0.5 bg-surface-2 text-muted border border-line rounded-full">
              {approved.length}
            </span>
          </div>

          {approved.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line px-5 py-4 text-sm text-faint">
              {t('approvedEmpty')}
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {approved.map((profile) => {
                const badgeCls = ROLE_BADGE_CLS[profile.role] ?? ROLE_BADGE_CLS.affiliate
                const hasWholesale = profile.wholesale_access === true

                return (
                  <div key={profile.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{profile.full_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeCls}`}>
                          {roleLabel(profile.role)}
                        </span>
                        {hasWholesale && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-success-soft text-success-fg border border-success">
                            {t('wholesaleAccess')}
                          </span>
                        )}
                      </div>
                      {profile.phone && (
                        <p className="text-xs text-faint mt-0.5">{profile.phone}</p>
                      )}
                    </div>
                    <a
                      href={`/admin/users/${profile.id}`}
                      className="shrink-0 text-xs text-gold-500 hover:text-gold-600 transition-colors"
                    >
                      {t('manage')}
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
