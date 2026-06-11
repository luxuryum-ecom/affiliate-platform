import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

// ─── Header de dashboard partagé (thème CLAIR, tokens sémantiques) ───────────
// Remplace le header dupliqué ~40× (bg-white border-gray-200…). Utilise les
// tokens bi-contexte (bg-surface, border-line, text-foreground/muted/faint) →
// cohérence garantie + prêt pour le thème. Les libellés (traduits) sont passés
// en props pour rester découplé des namespaces i18n de chaque groupe.

export function DashboardHeader({
  breadcrumb,
  backHref,
  backLabel,
  userName,
  signOutLabel,
  maxWidth = 'max-w-4xl',
}: {
  breadcrumb: string
  backHref?: string
  backLabel?: string
  userName?: string | null
  signOutLabel: string
  maxWidth?: string
}) {
  return (
    <header className="bg-surface border-b border-line">
      <div className={`${maxWidth} mx-auto px-4 h-14 flex items-center justify-between`}>
        <div className="flex items-center gap-3 min-w-0">
          {backHref && (
            <>
              <Link href={backHref} className="text-faint hover:text-muted text-sm shrink-0 transition-colors">
                ← {backLabel}
              </Link>
              <span className="text-line">/</span>
            </>
          )}
          <span className="font-semibold text-foreground text-sm truncate">{breadcrumb}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <LanguageSwitcher variant="light" />
          {userName && <span className="text-sm text-muted hidden sm:block">{userName}</span>}
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              {signOutLabel}
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
