import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import type { Profile, Commission } from '@/types/database'

export const metadata = {
  title: 'Tableau de bord — Espace Affilié',
}

// ─── Stat card ────────────────────────────────────────────────────────────────

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
    default: 'bg-white border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-amber-50 border-amber-200',
    muted:   'bg-gray-50 border-gray-200',
  }[variant]

  const text = {
    default: 'text-gray-900',
    success: 'text-green-700',
    warning: 'text-amber-700',
    muted:   'text-gray-400',
  }[variant]

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${text}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AffiliateDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [
    { data: profileData },
    { data: orderRows },
    { data: commissionRows },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single() as unknown as Promise<{ data: Profile | null; error: unknown }>,
    supabase
      .from('orders')
      .select('status')
      .eq('affiliate_id', user!.id) as unknown as Promise<{ data: { status: string }[] | null; error: unknown }>,
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', user!.id) as unknown as Promise<{ data: Commission[] | null; error: unknown }>,
  ])

  const profile = profileData
  const orders = orderRows ?? []
  const commissions = commissionRows ?? []

  // ── Order counts by status ────────────────────────────────────────────────
  const count = (s: string) => orders.filter((o) => o.status === s).length
  const cancelledAndReturned = count('returned') + count('cancelled')

  // ── Commission breakdown ──────────────────────────────────────────────────
  const sum = (filter: (c: Commission) => boolean) =>
    commissions.filter(filter).reduce((acc, c) => acc + Number(c.amount), 0)

  const earned  = sum(() => true)                          // all commissions ever
  const paid    = sum((c) => c.status === 'paid')          // confirmed paid
  const pending = sum((c) => c.status === 'pending')       // awaiting admin approval
  const approved = sum((c) => c.status === 'approved')     // approved, not yet paid
  const pendingBalance = pending + approved                 // total owed to affiliate

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-sm">Espace Affilié</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Bonjour, {profile?.full_name}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Voici un résumé de votre activité.</p>
        </div>

        {/* ── Order status breakdown ─────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Commandes
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StatCard label="Total" value={String(orders.length)} />
            <StatCard label="Confirmées" value={String(count('confirmed'))} variant="default" />
            <StatCard label="Expédiées" value={String(count('shipped'))} variant="default" />
            <StatCard
              label="Livrées"
              value={String(count('delivered'))}
              variant={count('delivered') > 0 ? 'success' : 'default'}
            />
            <StatCard
              label="Retournées"
              value={String(count('returned'))}
              variant={count('returned') > 0 ? 'warning' : 'muted'}
            />
            <StatCard
              label="Annulées"
              value={String(count('cancelled'))}
              variant={cancelledAndReturned > 0 ? 'warning' : 'muted'}
            />
          </div>
        </section>

        {/* ── Commission balance ─────────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Commissions & solde
          </p>

          {/* Balance highlight */}
          <div className={`rounded-xl border p-5 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            pendingBalance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
          }`}>
            <div>
              <p className="text-xs text-gray-500">Solde en attente de paiement</p>
              <p className={`text-3xl font-bold tabular-nums mt-1 ${
                pendingBalance > 0 ? 'text-amber-700' : 'text-gray-400'
              }`}>
                {formatMAD(pendingBalance)}
              </p>
              {pendingBalance > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  En cours de traitement par l&apos;administration.
                </p>
              )}
            </div>
            <Link
              href="/affiliate/orders"
              className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap self-start sm:self-center"
            >
              Voir mes commandes →
            </Link>
          </div>

          {/* Commission detail grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Total gagné"
              value={formatMAD(earned)}
              sub="Toutes commissions cumulées"
              variant="default"
            />
            <StatCard
              label="Approuvées (non payées)"
              value={formatMAD(approved)}
              sub="Validées, paiement en attente"
              variant={approved > 0 ? 'warning' : 'muted'}
            />
            <StatCard
              label="Payées"
              value={formatMAD(paid)}
              sub="Versées sur votre compte"
              variant={paid > 0 ? 'success' : 'muted'}
            />
          </div>
        </section>

        {/* ── Quick links ────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Catalogue produits</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Copiez vos liens affiliés et partagez-les.
              </p>
            </div>
            <Link
              href="/affiliate/products"
              className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              Voir le catalogue →
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Mes commandes</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Suivez le statut et vos commissions.
              </p>
            </div>
            <Link
              href="/affiliate/orders"
              className="text-xs px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Voir mes commandes →
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
