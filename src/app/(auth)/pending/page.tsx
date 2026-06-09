import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('auth.pending')
  return { title: t('metaTitle') }
}

const ROLE_REDIRECTS: Record<string, string> = {
  affiliate: '/affiliate/dashboard',
  wholesaler: '/wholesale/dashboard',
  admin: '/admin/dashboard',
  agent: '/admin/dashboard',
}

export default async function PendingPage() {
  const supabase = await createClient()
  const t = await getTranslations('auth.pending')
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

  const roleKey = ['affiliate', 'wholesaler', 'supplier'].includes(profile.role)
    ? profile.role
    : 'affiliate'
  const copy = {
    title: t(`${roleKey}.title`),
    intro: t(`${roleKey}.intro`),
    steps: t.raw(`${roleKey}.steps`) as string[],
  }

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 mb-5">
          <svg
            className="w-8 h-8 text-amber-400"
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

        <h1 className="text-xl font-semibold text-foreground">{copy.title}</h1>

        <p className="mt-2 text-sm text-muted max-w-xs mx-auto">
          {t('hello', { name: profile.full_name ?? '' })} {copy.intro}
        </p>

        <div className="mt-6 bg-surface rounded-xl border border-line p-5 text-left">
          <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
            {t('nextSteps')}
          </p>
          <ol className="space-y-2 text-sm text-muted">
            {copy.steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surface-2 text-muted text-xs flex items-center justify-center font-medium">
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
            className="text-sm text-faint hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {t('signOut')}
          </button>
        </form>
      </div>
    </div>
  )
}
