import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { DepotPickupPanel } from '@/components/admin/depot-pickup-panel'
import { listActiveCouriersForDepot } from '@/app/actions/courier-tours'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.depotPickup')
  return { title: t('metaTitle') }
}

/**
 * Scan ramassage (sortie dépôt) — transfert de garde dépôt→livreur.
 * Le layout admin ((admin)/layout.tsx) garantit déjà role admin/agent ; la
 * VRAIE autorisation (capacité `depot_supervision`) est vérifiée côté action
 * (`listActiveCouriersForDepot` / `recordPickupScan`, cf. `_guards.ts`). Un
 * agent sans cette capacité reste sur cette page mais voit un message d'accès
 * réservé, jamais un redirect brutal.
 */
export default async function AdminCouriersPickupPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()) as { data: Profile | null; error: unknown }

  const t = await getTranslations('admin.depotPickup')
  const tc = await getTranslations('admin.common')

  const { error, couriers } = await listActiveCouriersForDepot()

  return (
    <div className="min-h-screen bg-bg text-foreground">
      {/* Navbar — identique aux autres pages admin/couriers */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MozounaLogo size="md" />
            <span className="hidden sm:flex items-center gap-2 text-line">|</span>
            <Link
              href="/admin/couriers"
              className="hidden sm:block text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              {tc('dashboard')}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <NotificationBell />
            <span className="text-sm text-muted hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        <p className="text-sm text-foreground bg-warning-soft border border-warning rounded-xl px-3 py-2.5">
          {t('custodyNote')}
        </p>

        {error ? (
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('accessDenied')}
          </p>
        ) : (
          <DepotPickupPanel couriers={couriers} />
        )}
      </main>
    </div>
  )
}
