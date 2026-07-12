import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { DepotReceptionPanel } from '@/components/admin/guardian/depot-reception-panel'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.reception')
  return { title: t('metaTitle') }
}

/**
 * Réception guidée au dépôt — RÈGLE DU PORTEUR (module Livreurs, Lot G).
 * Le salarié NE CHOISIT JAMAIS le livreur : `recordDepotReception` déduit le
 * porteur du scan de ramassage et le renvoie pour confirmation visuelle. Le
 * layout admin ((admin)/layout.tsx) garantit déjà role admin/agent ; la VRAIE
 * autorisation (capacité `depot_supervision`) est revérifiée côté action
 * (`_guards.ts`). Ici on ne fait qu'un contrôle d'affichage doux (message
 * d'accès réservé, jamais un redirect brutal) — cf. couriers/pickup/page.tsx.
 */
export default async function AdminCouriersReceptionPage() {
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

  const t = await getTranslations('admin.reception')
  const tc = await getTranslations('admin.common')

  let hasAccess = profile?.role === 'admin'
  if (!hasAccess) {
    const { data: hasCap } = (await supabase.rpc('has_capability', {
      p_capability: 'depot_supervision',
    })) as { data: boolean | null; error: unknown }
    hasAccess = Boolean(hasCap)
  }

  return (
    <div className="min-h-screen bg-bg text-foreground">
      {/* Navbar — identique aux autres pages admin/couriers */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell />
            <form action={signOut}>
              <button type="submit" className="text-sm text-muted hover:text-foreground transition-colors">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        <div>
          <Link href="/admin/couriers" className="text-xs text-muted hover:text-foreground transition-colors">
            ← {tc('dashboard')}
          </Link>
          <h1 className="text-lg font-semibold text-foreground mt-1">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        <p className="text-sm text-foreground bg-warning-soft border border-warning rounded-xl px-3 py-2.5">
          {t('imposedBearerNote')}
        </p>

        {!hasAccess ? (
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('accessDenied')}
          </p>
        ) : (
          <DepotReceptionPanel />
        )}
      </main>
    </div>
  )
}
