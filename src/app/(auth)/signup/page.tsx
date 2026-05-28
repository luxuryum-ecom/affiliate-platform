import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'
import { cn } from '@/lib/utils'

interface SignupPageProps {
  searchParams: Promise<{ type?: string }>
}

export const metadata = {
  title: 'Inscription — AffiPartner',
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const role: 'affiliate' | 'wholesaler' =
    params.type === 'wholesale' ? 'wholesaler' : 'affiliate'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-xl font-bold text-gray-900 tracking-tight">
            AffiPartner Morocco
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900">Créer un compte</h1>
            <p className="mt-1 text-sm text-gray-500">
              Choisissez votre type de compte. Votre demande sera examinée sous 24–48h.
            </p>
          </div>

          <div className="flex rounded-lg border border-gray-200 p-0.5 mb-6">
            <Link
              href="/signup?type=affiliate"
              className={cn(
                'flex-1 text-center py-2 text-sm font-medium rounded-md transition-colors',
                role === 'affiliate'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Devenir affilié
            </Link>
            <Link
              href="/signup?type=wholesale"
              className={cn(
                'flex-1 text-center py-2 text-sm font-medium rounded-md transition-colors',
                role === 'wholesaler'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Acheter en gros
            </Link>
          </div>

          <SignupForm defaultRole={role} />
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Vous êtes admin ?{' '}
          <Link href="/login" className="underline underline-offset-2">
            Connexion directe
          </Link>
        </p>
      </div>
    </div>
  )
}
