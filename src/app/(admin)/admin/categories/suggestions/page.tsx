import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { requireCapability } from '@/app/actions/_guards'
import {
  getPendingSuggestions,
  getActiveCategoriesForFiling,
} from '@/app/actions/category-suggestions'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { CreateCategoryForm, FileIntoExistingForm, RejectForm } from './suggestion-actions'
import type { PendingSuggestion, FilingCategory } from '@/app/actions/category-suggestions'
import type { ParentOption, CategoryOption } from './suggestion-actions'

export async function generateMetadata() {
  const t = await getTranslations('admin.categorySuggestions')
  return { title: t('metaTitle') }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = String(d.getFullYear())
  return `${day}/${month}/${year}`
}

function getCategoryLabel(cat: FilingCategory, locale: string): string {
  if (locale === 'ar') return cat.label_ar
  if (locale === 'en') return cat.label_en
  return cat.label_fr
}

// ─── Carte suggestion (Server Component) ─────────────────────────────────────

type CardLabels = {
  proposedLabel: string
  currentCategory: string
  since: (date: string) => string
  actionCreateTitle: string
  actionCreateDesc: string
  actionFileTitle: string
  actionFileDesc: string
  actionRejectTitle: string
  actionRejectDesc: string
  createLabels: {
    labelFr: string
    labelAr: string
    labelEn: string
    parentOptional: string
    parentNone: string
    btnCreate: string
    creating: string
    successCreate: string
    errorFallback: string
  }
  fileLabels: {
    selectCategory: string
    btnFile: string
    filing: string
    successFile: string
    errorFallback: string
  }
  rejectLabels: {
    btnReject: string
    rejecting: string
    successReject: string
    errorFallback: string
  }
}

function SuggestionCard({
  suggestion,
  parentOptions,
  categoryOptions,
  t,
}: {
  suggestion: PendingSuggestion
  parentOptions: ParentOption[]
  categoryOptions: CategoryOption[]
  t: CardLabels
}) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
      {/* Header produit */}
      <div className="flex items-start gap-4 p-5 border-b border-line">
        <ProductThumbnail
          src={suggestion.product_photo}
          name={suggestion.product_name}
          className="w-16 h-16 rounded-lg shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">{suggestion.product_name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {t.currentCategory} :{' '}
            <span className="text-foreground">
              {suggestion.current_category} / {suggestion.current_subcategory}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-faint">{t.since(formatDate(suggestion.created_at))}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold-400 bg-gold-400/10 px-3 py-0.5">
            <span className="text-xs font-semibold text-gold-400">{t.proposedLabel} :</span>
            <span className="text-xs font-bold text-foreground">{suggestion.proposed_label}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="divide-y divide-line">
        {/* A — Créer */}
        <div className="p-5">
          <p className="text-xs font-semibold text-foreground mb-0.5">{t.actionCreateTitle}</p>
          <p className="text-xs text-faint mb-3">{t.actionCreateDesc}</p>
          <CreateCategoryForm
            suggestionId={suggestion.suggestion_id}
            proposedLabel={suggestion.proposed_label}
            parentOptions={parentOptions}
            labels={t.createLabels}
          />
        </div>

        {/* B — Ranger */}
        <div className="p-5">
          <p className="text-xs font-semibold text-foreground mb-0.5">{t.actionFileTitle}</p>
          <p className="text-xs text-faint mb-3">{t.actionFileDesc}</p>
          <FileIntoExistingForm
            suggestionId={suggestion.suggestion_id}
            categoryOptions={categoryOptions}
            labels={t.fileLabels}
          />
        </div>

        {/* C — Rejeter */}
        <div className="p-5">
          <p className="text-xs font-semibold text-foreground mb-0.5">{t.actionRejectTitle}</p>
          <p className="text-xs text-faint mb-3">{t.actionRejectDesc}</p>
          <RejectForm
            suggestionId={suggestion.suggestion_id}
            labels={t.rejectLabels}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CategorySuggestionsPage() {
  const { userId } = await requireCapability('validate_categories')
  if (!userId) redirect('/admin')

  const [suggestions, categories, locale, t, tc] = await Promise.all([
    getPendingSuggestions(),
    getActiveCategoriesForFiling(),
    getLocale(),
    getTranslations('admin.categorySuggestions'),
    getTranslations('admin.common'),
  ])

  // Libellés résolus côté serveur — seules des strings sérialisables descendent aux Client Components
  const parentOptions: ParentOption[] = categories
    .filter((c) => c.parent_id === null)
    .map((c) => ({ value: c.id, label: getCategoryLabel(c, locale) }))

  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    value: c.id,
    label: getCategoryLabel(c, locale),
  }))

  const createLabels = {
    labelFr:       t('labelFr'),
    labelAr:       t('labelAr'),
    labelEn:       t('labelEn'),
    parentOptional: t('parentOptional'),
    parentNone:    t('parentNone'),
    btnCreate:     t('btnCreate'),
    creating:      t('creating'),
    successCreate: t('successCreate'),
    errorFallback: t('errorFallback'),
  }

  const fileLabels = {
    selectCategory: t('selectCategory'),
    btnFile:        t('btnFile'),
    filing:         t('filing'),
    successFile:    t('successFile'),
    errorFallback:  t('errorFallback'),
  }

  const rejectLabels = {
    btnReject:     t('btnReject'),
    rejecting:     t('rejecting'),
    successReject: t('successReject'),
    errorFallback: t('errorFallback'),
  }

  // `since` est une fonction utilisée dans SuggestionCard (Server Component) — légal
  const cardT: CardLabels = {
    proposedLabel:    t('proposedLabel'),
    currentCategory:  t('currentCategory'),
    since:            (date: string) => t('since', { date }),
    actionCreateTitle: t('actionCreateTitle'),
    actionCreateDesc:  t('actionCreateDesc'),
    actionFileTitle:   t('actionFileTitle'),
    actionFileDesc:    t('actionFileDesc'),
    actionRejectTitle: t('actionRejectTitle'),
    actionRejectDesc:  t('actionRejectDesc'),
    createLabels,
    fileLabels,
    rejectLabels,
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/categories"
        backLabel={t('backLabel')}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        {/* En-tête */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
          <p className="mt-2 text-xs font-medium text-gold-400 tabular-nums">
            {t('pendingCount', { count: suggestions.length })}
          </p>
        </div>

        {/* Liste ou état vide */}
        {suggestions.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-14 text-center">
            <p className="text-sm font-medium text-foreground">{t('empty')}</p>
            <p className="mt-1 text-xs text-faint">{t('emptyDesc')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.suggestion_id}
                suggestion={s}
                parentOptions={parentOptions}
                categoryOptions={categoryOptions}
                t={cardT}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
