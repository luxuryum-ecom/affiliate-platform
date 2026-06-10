import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { WholesalerBillingForm } from '@/components/wholesale/billing-form'
import type { Profile } from '@/types/database'

export const metadata = {
  title: 'Mon compte — Espace Grossiste',
}

export default async function WholesalerAccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Mon compte</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Profile summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Informations du compte</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Nom</dt>
              <dd className="text-gray-800 font-medium">{profile?.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Téléphone</dt>
              <dd className="text-gray-800">{profile?.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Ville</dt>
              <dd className="text-gray-800">{profile?.city ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Statut</dt>
              <dd className="text-gray-800 capitalize">{profile?.status}</dd>
            </div>
          </dl>
        </div>

        {/* Billing fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Facturation</h2>
          <p className="text-xs text-gray-400 mb-4">
            Informations optionnelles utilisées pour générer vos factures.
          </p>
          <WholesalerBillingForm profile={profile} />
        </div>
      </main>
    </div>
  )
}
