import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { QuoteRequest, QuoteRequestStatus, Profile, Product } from '@/types/database'

export const metadata = { title: 'Mes demandes de devis — Espace Grossiste' }

const STATUS_BADGE: Record<QuoteRequestStatus, { label: string; cls: string }> = {
  new:                { label: 'Nouveau',              cls: 'bg-blue-100 text-blue-700' },
  studying:           { label: 'En étude',             cls: 'bg-amber-100 text-amber-700' },
  quoted:             { label: 'Devisé',               cls: 'bg-purple-100 text-purple-700' },
  negotiating:        { label: 'En négociation',       cls: 'bg-orange-100 text-orange-700' },
  approved:           { label: 'Approuvé',             cls: 'bg-green-100 text-green-700' },
  rejected:           { label: 'Refusé',               cls: 'bg-red-100 text-red-600' },
  converted_to_order: { label: 'Converti en commande', cls: 'bg-gray-100 text-gray-500' },
}

type ReqRow = QuoteRequest & { product: Pick<Product, 'id' | 'name'> }

export default async function WholesaleQuoteRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data } = await supabase
    .from('quote_requests')
    .select('*, product:products!product_id(id,name)')
    .eq('buyer_id', user!.id)
    .order('created_at', { ascending: false })

  const requests = (data ?? []) as unknown as ReqRow[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Mes demandes de devis</span>
          </div>
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

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-sm font-semibold text-gray-900">Mes demandes de devis</h1>
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
            {requests.length}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400 mb-4">
              Aucune demande de devis pour le moment.
            </p>
            <Link
              href="/wholesale/products"
              className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Voir le catalogue →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {requests.map((req) => {
              const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE.new
              return (
                <div key={req.id} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-mono text-gray-400">
                        #{req.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{req.product?.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {req.quantity_requested} unité{req.quantity_requested > 1 ? 's' : ''} · {req.destination_country}
                      {req.destination_city ? `, ${req.destination_city}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(req.created_at).toLocaleDateString('fr-MA', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <Link
                    href={`/wholesale/quote-requests/${req.id}`}
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                  >
                    Voir →
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
