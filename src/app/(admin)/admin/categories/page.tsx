import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getCategoriesAdmin, getCategoryChannelAudit } from '@/app/actions/categories'
import { getPendingSuggestions } from '@/app/actions/category-suggestions'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import {
  CategoryRowActions,
  AddCategoryForm,
  ChannelToggle,
  AddSubFormInline,
} from '@/components/admin/category-actions'
import type { AdminCategory, CategoryChannelAudit } from '@/app/actions/categories'

export async function generateMetadata() {
  const t = await getTranslations('admin.categories')
  return { title: t('metaTitle') }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ChannelBadge({ allowed, labelAffiliate, labelWholesaleOnly }: {
  allowed: boolean
  labelAffiliate: string
  labelWholesaleOnly: string
}) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
        allowed
          ? 'bg-success-soft text-success-fg border-success'
          : 'bg-surface-2 text-faint border-line'
      }`}
    >
      {allowed ? labelAffiliate : labelWholesaleOnly}
    </span>
  )
}

function ActiveBadge({ active, labelActive, labelInactive }: {
  active: boolean
  labelActive: string
  labelInactive: string
}) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
        active
          ? 'bg-success-soft text-success-fg border-success'
          : 'bg-surface-2 text-faint border-line opacity-60'
      }`}
    >
      {active ? labelActive : labelInactive}
    </span>
  )
}

// ─── Channel section per category (fetches audit inline) ─────────────────────

async function CategoryChannelSection({
  category,
  t,
  ta,
}: {
  category: AdminCategory
  t: Awaited<ReturnType<typeof getTranslations<'admin.categories'>>>
  ta: Awaited<ReturnType<typeof getTranslations<'admin.categoryActions'>>>
}) {
  const auditRecords: CategoryChannelAudit[] = await getCategoryChannelAudit(category.id)

  // All strings resolved server-side — only serializable data flows to the client
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-xs font-semibold text-muted mb-2">{t('channelSectionTitle')}</p>
      <ChannelToggle
        category={category}
        labelEnable={t('channelToggleEnable')}
        labelDisable={t('channelToggleDisable')}
        confirmEnableMsg={t('channelConfirmEnable', { name: category.label_fr })}
        confirmDisableMsg={t('channelConfirmDisable', { name: category.label_fr })}
        impactWarning={t('channelImpactWarning')}
        errorFallback={ta('error')}
        channelUpdatedMsg={ta('channelUpdated')}
        auditTitle={t('auditTitle')}
        auditEmpty={t('auditEmpty')}
        auditRecords={auditRecords}
        auditByLabel={t('auditBy', { user: '' })}
        auditChannelOn={t('auditChannelOn')}
        auditChannelOff={t('auditChannelOff')}
        auditSystemLabel={t('auditSystem')}
      />
    </div>
  )
}

// ─── Sub-category row ─────────────────────────────────────────────────────────

async function SubCategoryRow({
  sub,
  t,
  ta,
  tc,
}: {
  sub: AdminCategory
  t: Awaited<ReturnType<typeof getTranslations<'admin.categories'>>>
  ta: Awaited<ReturnType<typeof getTranslations<'admin.categoryActions'>>>
  tc: Awaited<ReturnType<typeof getTranslations<'admin.common'>>>
}) {
  return (
    <div className={`rounded-lg border border-line bg-surface p-4 ${sub.active ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Left: name + badges */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {sub.icon && <span className="text-base">{sub.icon}</span>}
            <span className="font-medium text-sm text-foreground">{sub.label_fr}</span>
            <span className="text-xs text-faint">/ {sub.label_ar}</span>
            <span className="text-xs text-faint">/ {sub.label_en}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ActiveBadge
              active={sub.active}
              labelActive={t('badgeActive')}
              labelInactive={t('badgeInactive')}
            />
            <ChannelBadge
              allowed={sub.affiliate_allowed}
              labelAffiliate={t('badgeAffiliate')}
              labelWholesaleOnly={t('badgeWholesaleOnly')}
            />
            <span className="text-xs text-faint">{t('sortOrderLabel')} : {sub.sort_order}</span>
            {sub.slug && (
              <code className="text-xs text-faint bg-surface-2 rounded px-1">{sub.slug}</code>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <CategoryRowActions
          category={sub}
          nameForConfirm={sub.label_fr}
          labelEdit={tc('edit')}
          labelDelete={tc('delete')}
          labelActivate={tc('activate')}
          labelDeactivate={tc('deactivate')}
          labelMoveUp={ta('moveUp')}
          labelMoveDown={ta('moveDown')}
          labelCancel={tc('cancel')}
          labelSave={tc('save')}
          confirmDeleteMsg={ta('confirmDelete', { name: sub.label_fr })}
          errorFallback={ta('error')}
          deletedMsg={ta('deleted')}
        />
      </div>

      {/* Channel toggle for sub-category */}
      <CategoryChannelSection category={sub} t={t} ta={ta} />
    </div>
  )
}

// ─── Parent category card ─────────────────────────────────────────────────────

async function ParentCategoryCard({
  parent,
  subs,
  allParents,
  t,
  ta,
  tc,
}: {
  parent: AdminCategory
  subs: AdminCategory[]
  allParents: AdminCategory[]
  t: Awaited<ReturnType<typeof getTranslations<'admin.categories'>>>
  ta: Awaited<ReturnType<typeof getTranslations<'admin.categoryActions'>>>
  tc: Awaited<ReturnType<typeof getTranslations<'admin.common'>>>
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-sm overflow-hidden ${parent.active ? '' : 'opacity-70'}`}>
      {/* Parent header */}
      <div className="border-b border-line px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {parent.icon && <span className="text-xl">{parent.icon}</span>}
              <h3 className="text-base font-semibold text-foreground">{parent.label_fr}</h3>
              <span className="text-sm text-faint">/ {parent.label_ar}</span>
              <span className="text-sm text-faint">/ {parent.label_en}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block rounded-full border border-gold-400 bg-surface-2 px-2 py-0.5 text-xs font-medium text-gold-400">
                {t('badgeParent')}
              </span>
              <ActiveBadge
                active={parent.active}
                labelActive={t('badgeActive')}
                labelInactive={t('badgeInactive')}
              />
              <ChannelBadge
                allowed={parent.affiliate_allowed}
                labelAffiliate={t('badgeAffiliate')}
                labelWholesaleOnly={t('badgeWholesaleOnly')}
              />
              <span className="text-xs text-faint">{t('sortOrderLabel')} : {parent.sort_order}</span>
              {parent.slug && (
                <code className="text-xs text-faint bg-surface-2 rounded px-1">{parent.slug}</code>
              )}
            </div>
          </div>

          <CategoryRowActions
            category={parent}
            nameForConfirm={parent.label_fr}
            labelEdit={tc('edit')}
            labelDelete={tc('delete')}
            labelActivate={tc('activate')}
            labelDeactivate={tc('deactivate')}
            labelMoveUp={ta('moveUp')}
            labelMoveDown={ta('moveDown')}
            labelCancel={tc('cancel')}
            labelSave={tc('save')}
            confirmDeleteMsg={ta('confirmDelete', { name: parent.label_fr })}
            errorFallback={ta('error')}
            deletedMsg={ta('deleted')}
          />
        </div>

        {/* Channel toggle for parent */}
        <CategoryChannelSection category={parent} t={t} ta={ta} />
      </div>

      {/* Sub-categories */}
      <div className="px-6 py-4 space-y-3">
        {subs.length === 0 ? (
          <p className="text-xs text-faint">{t('noSubcategories')}</p>
        ) : (
          subs.map((sub) => (
            <SubCategoryRow key={sub.id} sub={sub} t={t} ta={ta} tc={tc} />
          ))
        )}

        {/* Add sub-category form inline */}
        <AddSubFormInline
          parentId={parent.id}
          parents={allParents}
          labelButton={t('addSubButton')}
          labelCancel={tc('cancel')}
        />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminCategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const t   = await getTranslations('admin.categories')
  const ta  = await getTranslations('admin.categoryActions')
  const tc  = await getTranslations('admin.common')
  const tcs = await getTranslations('admin.categorySuggestions')

  const [categories, pendingSuggestions] = await Promise.all([
    getCategoriesAdmin(),
    getPendingSuggestions(),
  ])

  const parents = categories.filter((c) => c.parent_id === null)
  const subs    = categories.filter((c) => c.parent_id !== null)

  const activeCount    = categories.filter((c) => c.active).length
  const affiliateCount = categories.filter((c) => c.affiliate_allowed).length

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
          </div>
          <Link
            href="/admin/categories/suggestions"
            className="inline-flex items-center gap-2 rounded-lg border border-gold-400 bg-gold-400/10 px-4 py-2 text-sm font-medium text-gold-400 hover:bg-gold-400/20 transition-colors shrink-0"
          >
            {tcs('suggestionsLink')}
            {pendingSuggestions.length > 0 && (
              <span className="rounded-full bg-gold-400 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                {tcs('suggestionsBadgeLabel', { count: pendingSuggestions.length })}
              </span>
            )}
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">{t('statTotal')}</p>
            <p className="mt-2 text-3xl font-bold text-foreground tabular-nums">{categories.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">{t('statActive')}</p>
            <p className="mt-2 text-3xl font-bold text-foreground tabular-nums">{activeCount}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">{t('statAffiliate')}</p>
            <p className="mt-2 text-3xl font-bold text-success-fg tabular-nums">{affiliateCount}</p>
          </div>
        </div>

        {/* Add parent category */}
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t('addParentTitle')}</h2>
          <AddCategoryForm parents={parents} />
        </div>

        {/* Category list */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t('listTitle')} ({categories.length})
            </h2>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-10 text-center">
              <p className="text-sm text-faint">{t('empty')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {parents.map((parent) => (
                <ParentCategoryCard
                  key={parent.id}
                  parent={parent}
                  subs={subs.filter((s) => s.parent_id === parent.id)}
                  allParents={parents}
                  t={t}
                  ta={ta}
                  tc={tc}
                />
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
