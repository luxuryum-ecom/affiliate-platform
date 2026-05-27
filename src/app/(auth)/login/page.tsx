import Link from 'next/link'
import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Connexion — Affiliate Platform',
}

export default function LoginPage() {
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
            <h1 className="text-xl font-semibold text-gray-900">Connexion</h1>
            <p className="mt-1 text-sm text-gray-500">
              Accédez à votre espace de travail.
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}
