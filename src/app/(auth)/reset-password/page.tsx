import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { MozounaLogo } from '@/components/shared/branding'

export async function generateMetadata() {
  const t = await getTranslations('auth.resetPassword')
  return { title: t('metaTitle') }
}

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth.resetPassword')

  // Vérifie côté serveur l'existence d'une session recovery active.
  // Si l'utilisateur arrive sans avoir échangé le code (lien expiré, navigation directe),
  // getUser() retourne null → on affiche le message "lien expiré".
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const hasSession = user !== null

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / wordmark */}
        <div className="flex justify-center mb-8">
          <Link href="/" aria-label="Mozouna Group — accueil">
            <MozounaLogo size="lg" />
          </Link>
        </div>

        <div className="bg-surface rounded-2xl border border-line shadow-premium p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
          </div>

          {/* Strings résolus côté serveur, passés en props sérialisables au Client Component */}
          <ResetPasswordForm
            hasSession={hasSession}
            expiredLabel={t('expired')}
            requestNewLabel={t('requestNew')}
          />
        </div>
      </div>
    </div>
  )
}
