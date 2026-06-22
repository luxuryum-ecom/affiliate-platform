import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { CategoryShowcase, type CategoryCardData } from '@/components/shared/category-showcase'
import { getCategoryDisplayList } from '@/lib/categories/display'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.products')
  return { title: t('categoriesMetaTitle') }
}

// Page d'entrée « rayons » dédiée (bonus) : mêmes grandes cartes-images, en grille
// pleine, chacune ciblant le CATALOGUE filtré par catégorie (?category=).
// Affichage PUR, zéro argent, zéro nouvelle logique de données.
export default async function WholesaleCategoriesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, tCommon, cats] = await Promise.all([
    getTranslations('wholesale.products'),
    getTranslations('wholesale.common'),
    getCategoryDisplayList(),
  ])

  const cards: CategoryCardData[] = cats.map((cat) => ({
    value: cat.value,
    label: cat.label,
    href: `/wholesale/products?category=${encodeURIComponent(cat.value)}`,
    image: cat.image ?? '',
    icon: cat.icon,
    isActive: false,
  }))

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-line">|</span>
            <Link
              href="/wholesale/dashboard"
              className="hidden sm:block text-sm text-muted hover:text-foreground transition-colors"
            >
              {tCommon('dashboard')}
            </Link>
          </div>
          <LanguageSwitcher variant="light" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-foreground">{t('categoriesPageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('categoriesSubtitle')}</p>
        </div>

        <CategoryShowcase cards={cards} layout="grid" />

        <div className="mt-6">
          <Link href="/wholesale/products" className="text-sm text-gold-400 hover:underline">
            ← {t('categoriesBack')}
          </Link>
        </div>
      </main>
    </div>
  )
}
