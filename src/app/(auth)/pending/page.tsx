import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { Profile } from '@/types/database'

export const metadata = {
  title: 'Compte en attente — Affiliate Platform',
}

const ROLE_REDIRECTS: Record<string, string> = {
  affiliate: '/dashboard',
  wholesaler: '/wholesale/dashboard',
  admin: '/admin/dashboard',
  agent: '/admin/dashboard',
}

export default async function PendingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null; error: unknown }

  if (!profile) redirect('/login')

  // Already approved — route them to their dashboard
  if (profile.status === 'approved') {
    redirect(ROLE_REDIRECTS[profile.role] ?? '/login')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md text-center">
        {/* Clock icon */}
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

        <h1 className="text-xl font-semibold text-gray-900">Compte en cours de validation</h1>

        <p className="mt-2 text-sm text-gray-500 max-w-xs mx-auto">
          Bonjour <span className="font-medium text-gray-700">{profile.full_name}</span>,
          votre demande a bien été reçue. Notre équipe la traitera sous{' '}
          <strong>24 à 48 heures</strong>.
        </p>

        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 text-left">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Prochaines étapes
          </p>
          <ol className="space-y-2 text-sm text-gray-600">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium">
                1
              </span>
              Vérification de votre dossier par notre équipe
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium">
                2
              </span>
              Notification par email à l'adresse fournie
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium">
                3
              </span>
              Accès à votre espace une fois approuvé
            </li>
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
