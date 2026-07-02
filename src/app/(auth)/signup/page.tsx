import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SignupForm } from '@/components/auth/signup-form'
import { MozounaLogo } from '@/components/shared/branding'
import { cn } from '@/lib/utils'

interface SignupPageProps {
  searchParams: Promise<{ type?: string }>
}

export async function generateMetadata() {
  const t = await getTranslations('auth.signup')
  return { title: t('metaTitle') }
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const t = await getTranslations('auth.signup')
  const ta = await getTranslations('auth')
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
      label: ta('roleAffiliate'),
      sub: t('subAffiliate'),
    },
    {
      type: 'wholesale',
      href: '/signup?type=wholesale',
      icon: '📦',
      label: ta('roleWholesaler'),
      sub: t('subWholesaler'),
    },
    {
      type: 'supplier',
      href: '/signup?type=supplier',
      icon: '🏭',
      label: ta('roleSupplier'),
      sub: t('subSupplier'),
    },
  ] as const

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/" aria-label="Abdou Baba — accueil">
            <MozounaLogo size="lg" />
          </Link>
        </div>

        <div className="bg-surface rounded-2xl border border-line shadow-premium p-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted">
              {t('subtitle')}
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
                    ? 'border-gold-400 bg-primary text-primary-foreground ring-2 ring-gold-400 ring-offset-1 ring-offset-surface'
                    : 'border-line bg-surface text-muted hover:border-gold-300 hover:bg-surface-2'
                )}
              >
                <span className="text-xl flex-shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className={cn(
                    'text-sm font-semibold leading-tight',
                    (role === type || (type === 'wholesale' && role === 'wholesaler')) ? 'text-primary-foreground' : 'text-foreground'
                  )}>
                    {label}
                  </p>
                  <p className={cn(
                    'text-xs mt-0.5 leading-tight',
                    (role === type || (type === 'wholesale' && role === 'wholesaler')) ? 'text-primary-foreground/80' : 'text-faint'
                  )}>
                    {sub}
                  </p>
                </div>
                {(role === type || (type === 'wholesale' && role === 'wholesaler')) && (
                  <span className="ml-auto flex-shrink-0 text-primary-foreground">✓</span>
                )}
              </Link>
            ))}
          </div>

          <SignupForm defaultRole={role} />
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          {t('adminQuestion')}{' '}
          <Link href="/login" className="text-gold-400 underline underline-offset-2">
            {t('directLogin')}
          </Link>
        </p>
      </div>
    </div>
  )
}
