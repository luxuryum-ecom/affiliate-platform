import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WholesaleAccessToggle } from '@/components/admin/wholesale-access-toggle'
import { AgentPromoteControl } from '@/components/admin/agent-promote-control'
import { SupplierCountrySelect } from '@/components/admin/supplier-country-select'
import { SupplierTelegramLink } from '@/components/admin/supplier-telegram-link'
import { SUPPLIER_COUNTRIES } from '@/lib/supplier-countries'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Profile } from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
}

// CSS-only maps — labels via t()
const ROLE_BADGE_CLS: Record<string, string> = {
  affiliate:  'bg-surface-2 text-muted border border-line',
  wholesaler: 'bg-surface-2 text-foreground border border-line',
  admin:      'bg-surface-2 text-muted border border-line',
  agent:      'bg-surface-2 text-muted border border-line',
}

const STATUS_BADGE_CLS: Record<string, string> = {
  pending:  'bg-warning-soft text-warning-fg border border-warning',
  approved: 'bg-success-soft text-success-fg border border-success',
  rejected: 'bg-danger-soft text-danger-fg border border-danger',
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const t = await getTranslations('admin.userDetail')
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .single() as { data: { full_name: string } | null; error: unknown }
  return {
    title: data
      ? t('metaTitle', { name: data.full_name })
      : t('metaTitleFallback'),
  }
}

export default async function AdminUserDetailPage({ params }: Params) {
  const { id } = await params

  const t  = await getTranslations('admin.userDetail')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  const [supabase, adminClient] = [await createClient(), createAdminClient()]

  const [adminProfileRes, profileRes, authUserRes] = await Promise.all([
    supabase.from('profiles').select('full_name, role').eq('id', (await supabase.auth.getUser()).data.user!.id).single(),
    supabase.from('profiles').select('*').eq('id', id).single(),
    adminClient.auth.admin.getUserById(id),
  ])

  const adminProfile = adminProfileRes.data as { full_name: string; role: string } | null
  const visitorIsAdmin = adminProfile?.role === 'admin'
  const profile = profileRes.data as Profile | null
  const email = authUserRes.data?.user?.email ?? null

  if (!profile) notFound()

  const statusCls  = STATUS_BADGE_CLS[profile.status] ?? STATUS_BADGE_CLS.pending
  const roleCls    = ROLE_BADGE_CLS[profile.role] ?? ROLE_BADGE_CLS.affiliate
  const isAffiliate  = profile.role === 'affiliate'
  const isWholesaler = profile.role === 'wholesaler'
  const isSupplier   = profile.role === 'supplier'
  const isAdmin      = profile.role === 'admin'
  const isAgent      = profile.role === 'agent'
  const countryLabel = SUPPLIER_COUNTRIES.find((c) => c.code === profile.country_code)

  function statusLabel(s: string) {
    if (s === 'pending')  return t('statusPending')
    if (s === 'approved') return t('statusApproved')
    if (s === 'rejected') return t('statusRejected')
    return tc('unknown')
  }

  function roleLabel(r: string) {
    if (r === 'affiliate')  return t('roleAffiliate')
    if (r === 'wholesaler') return t('roleWholesaler')
    if (r === 'admin')      return t('roleAdmin')
    if (r === 'agent')      return t('roleAgent')
    return r
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={profile.full_name}
        backHref="/admin/users"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-3xl"
      />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* ── Profile info ── */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('accountTitle')}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-faint">{t('fullName')}</dt>
              <dd className="font-medium text-foreground mt-0.5">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('email')}</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {email ?? <span className="text-faint">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{tc('phone')}</dt>
              <dd className="font-medium text-foreground mt-0.5">{profile.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{tc('city')}</dt>
              <dd className="font-medium text-foreground mt-0.5">{profile.city ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('role')}</dt>
              <dd className="mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${roleCls}`}>
                  {roleLabel(profile.role)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('status')}</dt>
              <dd className="mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusCls}`}>
                  {statusLabel(profile.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('registeredAt')}</dt>
              <dd className="font-medium text-foreground mt-0.5">
                {new Date(profile.created_at).toLocaleDateString(locale, {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">{t('id')}</dt>
              <dd className="font-mono text-xs text-faint mt-0.5">{profile.id}</dd>
            </div>
          </dl>
        </div>

        {/* ── Access flags ── */}
        <div className="bg-surface rounded-xl border border-line p-5 space-y-5">
          <h2 className="text-sm font-semibold text-foreground">{t('accessTitle')}</h2>

          {/* Affiliate status — read only */}
          <div className="flex items-center justify-between py-3 border-b border-line">
            <div>
              <p className="text-sm font-medium text-foreground">{t('affiliateAccessLabel')}</p>
              <p className="text-xs text-faint mt-0.5">{t('affiliateAccessDesc')}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-medium border ${
              isAffiliate && profile.status === 'approved'
                ? 'bg-success-soft text-success-fg border-success'
                : 'bg-surface-2 text-faint border-line'
            }`}>
              {isAffiliate && profile.status === 'approved'
                ? t('affiliateAccessOn')
                : t('affiliateAccessOff')}
            </span>
          </div>

          {/* Wholesale access — editable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t('wholesaleAccessLabel')}</p>
              <p className="text-xs text-faint mt-0.5">
                {isWholesaler
                  ? t('wholesaleAccessDescNative')
                  : t('wholesaleAccessDescToggle')}
              </p>
            </div>
            {isWholesaler ? (
              <span className="text-xs px-3 py-1 rounded-full font-medium bg-surface-2 text-foreground border border-line">
                {t('wholesaleNative')}
              </span>
            ) : (
              <WholesaleAccessToggle
                profileId={profile.id}
                initialValue={profile.wholesale_access ?? false}
              />
            )}
          </div>

          {/* Supplier country — editable (débloque l'onboarding, pays figé admin-only) */}
          {isSupplier && (
            <div className="pt-3 border-t border-line">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('supplierCountryLabel')}</p>
                  <p className="text-xs text-faint mt-0.5">{t('supplierCountryDesc')}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium border shrink-0 ${
                  profile.country_code
                    ? 'bg-success-soft text-success-fg border-success'
                    : 'bg-warning-soft text-warning-fg border-warning'
                }`}>
                  {countryLabel ? `${countryLabel.flag} ${countryLabel.label}` : t('supplierCountryNone')}
                </span>
              </div>
              <SupplierCountrySelect
                profileId={profile.id}
                currentCountry={profile.country_code}
                requested={profile.country_setup_requested ?? false}
              />
            </div>
          )}
        </div>

        {/* ── Liaison Telegram fournisseur — l'admin génère le lien magique + QR
            et le partage (WhatsApp) au fournisseur non-technique. Visible admin only. ── */}
        {visitorIsAdmin && isSupplier && (
          <div className="bg-surface rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">{t('telegram.sectionTitle')}</h2>
            <SupplierTelegramLink
              supplierId={profile.id}
              phone={profile.phone}
              botUsername={process.env.TELEGRAM_BOT_USERNAME ?? null}
            />
          </div>
        )}

        {/* ── Rôle interne — promotion en agent / personnel dépôt.
            Visible UNIQUEMENT pour un visiteur admin (défense en profondeur : le
            layout (admin) autorise aussi les agents) ET si la cible n'est pas admin. ── */}
        {visitorIsAdmin && !isAdmin && (
          <div className="bg-surface rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">{t('internalRoleTitle')}</h2>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{t('promoteAgentLabel')}</p>
                <p className="text-xs text-faint mt-0.5">
                  {isAgent ? t('promoteAgentDescDone') : t('promoteAgentDesc')}
                </p>
              </div>
              <div className="shrink-0">
                <AgentPromoteControl
                  profileId={profile.id}
                  isAgent={isAgent}
                  labels={{
                    button: t('promoteAgentButton'),
                    pending: t('promoteAgentPending'),
                    already: t('promoteAgentAlready'),
                    confirm: t('promoteAgentConfirm'),
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Billing info (if any) ── */}
        {(profile.company_name || profile.ice || profile.registre_commerce || profile.billing_address) && (
          <div className="bg-surface rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('billingTitle')}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {profile.company_name && (
                <div>
                  <dt className="text-xs text-faint">{t('companyName')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">{profile.company_name}</dd>
                </div>
              )}
              {profile.ice && (
                <div>
                  <dt className="text-xs text-faint">{t('ice')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">{profile.ice}</dd>
                </div>
              )}
              {profile.registre_commerce && (
                <div>
                  <dt className="text-xs text-faint">{t('rc')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">{profile.registre_commerce}</dd>
                </div>
              )}
              {profile.billing_address && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-faint">{tc('address')}</dt>
                  <dd className="font-medium text-foreground mt-0.5">{profile.billing_address}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

      </main>
    </div>
  )
}
