import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { MozounaLogo } from '@/components/shared/branding'

export async function generateMetadata() {
  const t = await getTranslations('auth.forgotPassword')
  return { title: t('metaTitle') }
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgotPassword')

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / wordmark */}
        <div className="flex justify-center mb-8">
          <Link href="/" aria-label="Abdou Baba — accueil">
            <MozounaLogo size="lg" />
          </Link>
        </div>

        <div className="bg-surface rounded-2xl border border-line shadow-premium p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('intro')}</p>
          </div>

          {/* Les labels non-interactifs sont résolus côté serveur (strings sérialisables) */}
          <ForgotPasswordForm backToLoginLabel={t('backToLogin')} />
        </div>
      </div>
    </div>
  )
}
