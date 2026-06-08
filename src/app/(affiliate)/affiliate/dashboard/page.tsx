import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { formatConversionRate, formatReturnRate } from '@/lib/order-analytics'
import { MozounaLogo } from '@/components/shared/branding'
import type { Profile, Commission } from '@/types/database'

export const metadata = {
  title: 'Tableau de bord — Espace Affilié',
}

function StatCard({
  label,
  value,
  sub,
  variant = 'default',
}: {
  label: string
  value: string
  sub?: string
  variant?: 'default' | 'success' | 'warning' | 'muted'
}) {
  const bg = {
    default: 'bg-surface border-line',
    success: 'bg-emerald-500/10 border-emerald-500/30',
    warning: 'bg-amber-500/10 border-amber-500/30',
    muted:   'bg-surface-2 border-line',
  }[variant]

  const text = {
    default: 'text-foreground',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    muted:   'text-faint',
  }[variant]

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-muted leading-tight">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${text}`}>{value}</p>
      {sub && <p className="text-xs text-faint mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function AffiliateDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const affiliateId = user!.id

  const [
    { data: profileData },
    { data: orderRows },
    { data: commissionRows },
    { count: clickCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', affiliateId).single() as unknown as Promise<{ data: Profile | null; error: unknown }>,
    supabase
      .from('orders')
      .select('status, commission_amount, affiliate_commission_mad_snapshot')
      .eq('affiliate_id', affiliateId) as unknown as Promise<{ data: { status: string; commission_amount: number; affiliate_commission_mad_snapshot: number | null }[] | null; error: unknown }>,
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', affiliateId) as unknown as Promise<{ data: Commission[] | null; error: unknown }>,
    supabase
      .from('affiliate_clicks')
      .select('*', { count: 'exact', head: true })
      .eq('affiliate_id', affiliateId),
  ])

  const profile = profileData
  const orders = orderRows ?? []
  const commissions = commissionRows ?? []
  const clicks = clickCount ?? 0

  const count = (s: string) => orders.filter((o) => o.status === s).length
  const delivered = count('delivered')
  const returned = count('returned')
  const totalOrders = orders.length

  // Reversed commissions (returned orders) are excluded from all financial totals.
  const activeCommissions = commissions.filter((c) => !c.reversed)
  const sumActive = (filter: (c: Commission) => boolean) =>
    activeCommissions.filter(filter).reduce((acc, c) => acc + Number(c.amount), 0)

  const earnedCommissions = sumActive(() => true)
  const paidCommissions   = sumActive((c) => c.status === 'paid')
  const pendingCommissions  = sumActive((c) => c.status === 'pending')
  const approvedCommissions = sumActive((c) => c.status === 'approved')
  const pendingBalance = pendingCommissions + approvedCommissions

  const conversionRate = formatConversionRate(clicks, totalOrders)
  const returnRate     = formatReturnRate(delivered, returned)

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      <header className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-line">|</span>
            <span className="hidden sm:block text-sm font-medium text-muted">Espace Affilié</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-muted hover:text-foreground transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Bonjour, {profile?.full_name}</h1>
          <p className="text-sm text-muted mt-0.5">Performance de vos liens affiliés COD.</p>
        </div>

        {/* Traffic & conversion */}
        <section>
          <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
            Trafic & conversion
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label="Clics sur vos liens" value={String(clicks)} />
            <StatCard label="Commandes" value={String(totalOrders)} />
            <StatCard
              label="Taux de conversion"
              value={conversionRate}
              sub={clicks > 0 ? `${totalOrders} / ${clicks} clics` : 'Aucun clic enregistré'}
              variant={clicks > 0 && totalOrders > 0 ? 'success' : 'muted'}
            />
            <StatCard
              label="Taux de retour"
              value={returnRate}
              sub={`${returned} retour${returned !== 1 ? 's' : ''} / ${delivered + returned} livrées+retours`}
              variant={returned > 0 ? 'warning' : 'muted'}
            />
          </div>
        </section>

        {/* Order breakdown */}
        <section>
          <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
            Commandes
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <StatCard label="À confirmer"  value={String(count('pending_confirmation'))} variant="warning" />
            <StatCard label="Confirmées"   value={String(count('confirmed'))} />
            <StatCard label="Expédiées"    value={String(count('shipped'))} />
            <StatCard label="Livrées"      value={String(delivered)} variant={delivered > 0 ? 'success' : 'default'} />
            <StatCard label="Retournées"   value={String(returned)}  variant={returned > 0 ? 'warning' : 'muted'} />
          </div>
        </section>

        {/* Commissions */}
        <section>
          <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
            Commissions
          </p>

          <div className={`rounded-xl border p-5 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            pendingBalance > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-surface border-line'
          }`}>
            <div>
              <p className="text-xs text-muted">Solde en attente de paiement</p>
              <p className={`text-3xl font-bold tabular-nums mt-1 ${
                pendingBalance > 0 ? 'text-amber-300' : 'text-faint'
              }`}>
                {formatMAD(pendingBalance)}
              </p>
              <p className="text-xs text-faint mt-1">
                Commissions gagnées uniquement sur commandes livrées
              </p>
            </div>
            <Link
              href="/affiliate/orders"
              className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap self-start sm:self-center"
            >
              Voir mes commandes →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Commissions gagnées"
              value={formatMAD(earnedCommissions)}
              sub="Créées à la livraison"
            />
            <StatCard
              label="En attente (pending)"
              value={formatMAD(pendingCommissions)}
              sub="Livrées, non encore approuvées"
              variant={pendingCommissions > 0 ? 'warning' : 'muted'}
            />
            <StatCard
              label="Payées"
              value={formatMAD(paidCommissions)}
              sub="Versées sur votre compte"
              variant={paidCommissions > 0 ? 'success' : 'muted'}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-surface rounded-xl border border-line p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Catalogue produits</h2>
              <p className="text-xs text-muted mt-0.5">Copiez vos liens et partagez-les.</p>
            </div>
            <Link
              href="/affiliate/products"
              className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Voir le catalogue →
            </Link>
          </div>

          <div className="bg-surface rounded-xl border border-line p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mes commandes</h2>
              <p className="text-xs text-muted mt-0.5">Suivi détaillé et commissions.</p>
            </div>
            <Link
              href="/affiliate/orders"
              className="text-xs px-4 py-2 border border-line text-foreground rounded-lg hover:bg-surface-2 transition-colors whitespace-nowrap"
            >
              Voir mes commandes →
            </Link>
          </div>

          <div className="bg-surface rounded-xl border border-line p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Mes commissions</h2>
              <p className="text-xs text-muted mt-0.5">Historique détaillé et virements reçus.</p>
            </div>
            <Link
              href="/affiliate/commissions"
              className="text-xs px-4 py-2 border border-line text-foreground rounded-lg hover:bg-surface-2 transition-colors whitespace-nowrap"
            >
              Voir mes commissions →
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
