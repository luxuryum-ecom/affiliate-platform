import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'

interface SignupPageProps {
  searchParams: Promise<{ type?: string }>
}

export const metadata = {
  title: 'Inscription — Affiliate Platform',
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const role: 'affiliate' | 'wholesaler' =
    params.type === 'wholesale' ? 'wholesaler' : 'affiliate'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <Link href="/" className="text-xl font-bold text-gray-900 tracking-tight">
            Affiliate Platform
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-900">Créer un compte</h1>
            <p className="mt-1 text-sm text-gray-500">
              Votre demande sera examinée sous 24–48h.
            </p>
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
