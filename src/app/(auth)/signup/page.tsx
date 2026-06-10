import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'
import { cn } from '@/lib/utils'

interface SignupPageProps {
  searchParams: Promise<{ type?: string }>
}

export const metadata = {
  title: 'Inscription — Mozouna Group',
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const role: 'affiliate' | 'wholesaler' | 'supplier' =
    params.type === 'wholesale'
      ? 'wholesaler'
      : params.type === 'supplier'
      ? 'supplier'
      : 'affiliate'

  const ACCOUNT_TYPES = [
    {
      type: 'affiliate',
      href: '/signup?type=affiliate',
      icon: '🔗',
      label: "Je fais de l'affiliation",
      sub: 'Partagez des liens, encaissez des commissions COD',
    },
    {
      type: 'wholesale',
      href: '/signup?type=wholesale',
      icon: '📦',
      label: "J'achète en gros",
      sub: 'Catalogue B2B, paliers de prix, commandes groupées',
    },
    {
      type: 'supplier',
      href: '/signup?type=supplier',
      icon: '🏭',
      label: 'Je vends mes produits',
      sub: 'Référencez vos produits sur la marketplace',
    },
  ] as const

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white font-bold text-sm">M</span>
            <span className="text-lg font-bold text-gray-900 tracking-tight">Mozouna Group</span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-gray-900">Créer un compte</h1>
            <p className="mt-1 text-sm text-gray-500">
              Comment comptez-vous utiliser la plateforme ?
            </p>
          </div>

          {/* Account type selector — vertical cards */}
          <div className="space-y-2 mb-6">
            {ACCOUNT_TYPES.map(({ type, href, icon, label, sub }) => (
              <Link
                key={type}
                href={href}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all',
                  (role === type || (type === 'wholesale' && role === 'wholesaler'))
                    ? 'border-gray-900 bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                )}
              >
                <span className="text-xl flex-shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className={cn(
                    'text-sm font-semibold leading-tight',
                    (role === type || (type === 'wholesale' && role === 'wholesaler')) ? 'text-white' : 'text-gray-900'
                  )}>
                    {label}
                  </p>
                  <p className={cn(
                    'text-xs mt-0.5 leading-tight',
                    (role === type || (type === 'wholesale' && role === 'wholesaler')) ? 'text-gray-300' : 'text-gray-400'
                  )}>
                    {sub}
                  </p>
                </div>
                {(role === type || (type === 'wholesale' && role === 'wholesaler')) && (
                  <span className="ml-auto flex-shrink-0 text-white">✓</span>
                )}
              </Link>
            ))}
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
