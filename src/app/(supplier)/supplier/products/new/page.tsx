import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { SubmitProductForm } from '@/components/supplier/submit-product-form'
import type { Profile } from '@/types/database'

export const metadata = { title: 'Soumettre un produit — Espace Fournisseur' }

export default async function SupplierProductNewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/products" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Mes produits
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Soumettre un produit</span>
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

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Soumettre un produit</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Votre soumission sera examinée par notre équipe. Votre identité reste confidentielle.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <SubmitProductForm />
        </div>
      </main>
    </div>
  )
}
