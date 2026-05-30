import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { SubmitProductForm } from '@/components/supplier/submit-product-form'
import { getProductLimitStatus } from '@/app/actions/premium'
import type { Profile } from '@/types/database'

export const metadata = { title: 'Soumettre un produit — Espace Fournisseur' }

export default async function SupplierProductNewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, limitStatus] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    getProductLimitStatus(user.id),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null

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

        {/* Product limit warning */}
        {limitStatus.isAtLimit ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-2">
            <p className="text-sm font-semibold text-red-700">Limite de produits atteinte</p>
            <p className="text-sm text-red-600">
              Votre plan <strong>{limitStatus.planName}</strong> autorise jusqu&apos;à {limitStatus.maxAllowed} produit{limitStatus.maxAllowed !== 1 ? 's' : ''}.
              Vous en avez actuellement {limitStatus.currentCount}.
            </p>
            <Link
              href="/supplier/premium"
              className="inline-block mt-2 text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Passer à un plan supérieur →
            </Link>
          </div>
        ) : (
          <>
            {/* Soft warning when near limit */}
            {!limitStatus.isUnlimited && limitStatus.currentCount >= limitStatus.maxAllowed - 1 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-center justify-between gap-3">
                <p className="text-sm text-amber-700">
                  Il vous reste {limitStatus.maxAllowed - limitStatus.currentCount} soumission{limitStatus.maxAllowed - limitStatus.currentCount !== 1 ? 's' : ''} sur votre plan {limitStatus.planName}.
                </p>
                <Link href="/supplier/premium" className="text-xs text-amber-700 underline shrink-0">
                  Changer de plan
                </Link>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <SubmitProductForm />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
