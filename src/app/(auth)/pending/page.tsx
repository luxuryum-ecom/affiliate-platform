import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { Profile } from '@/types/database'

export const metadata = {
  title: 'Compte en attente — AffiPartner',
}

const ROLE_REDIRECTS: Record<string, string> = {
  affiliate: '/affiliate/dashboard',
  wholesaler: '/wholesale/dashboard',
  admin: '/admin/dashboard',
  agent: '/admin/dashboard',
}

const PENDING_COPY: Record<
  string,
  { title: string; intro: string; steps: string[] }
> = {
  affiliate: {
    title: 'Votre compte affiliation est en cours de validation',
    intro:
      "Votre demande pour faire de l'affiliation (dropshipping COD) a bien été reçue. Notre équipe la traitera sous 24 à 48 heures.",
    steps: [
      'Vérification de votre profil',
      'Notification par email une fois approuvé',
      'Accès au catalogue, liens de parrainage et suivi des commissions',
    ],
  },
  wholesaler: {
    title: 'Votre compte achat en gros est en cours de validation',
    intro:
      "Votre demande pour acheter en gros (B2B) a bien été reçue. Notre équipe la traitera sous 24 à 48 heures.",
    steps: [
      'Vérification de votre profil',
      'Notification par email une fois approuvé',
      'Accès au catalogue gros, paliers de prix et commandes B2B',
    ],
  },
  supplier: {
    title: 'Votre compte fournisseur est en cours de validation',
    intro:
      "Votre demande pour vendre vos produits sur la marketplace a bien été reçue. Notre équipe la traitera sous 24 à 48 heures.",
    steps: [
      'Vérification de votre profil fournisseur',
      'Notification par email une fois approuvé',
      'Accès à la gestion de vos produits et aux demandes de devis',
    ],
  },
}

export default async function PendingPage() {
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

  if (!profile) redirect('/login')

  if (profile.status === 'approved') {
    redirect(ROLE_REDIRECTS[profile.role] ?? '/login')
  }

  if (profile.status === 'rejected') {
    await supabase.auth.signOut()
    redirect('/login?rejected=1')
  }

  const copy =
    PENDING_COPY[profile.role] ??
    PENDING_COPY.affiliate

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-5">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-gray-900">{copy.title}</h1>

        <p className="mt-2 text-sm text-gray-500 max-w-xs mx-auto">
          Bonjour <span className="font-medium text-gray-700">{profile.full_name}</span>,{' '}
          {copy.intro}
        </p>

        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Prochaines étapes
          </p>
          <ol className="space-y-2 text-sm text-gray-600">
            {copy.steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  )
}
