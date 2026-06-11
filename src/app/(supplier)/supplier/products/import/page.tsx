import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import BulkImportClient from './BulkImportClient'
import type { Profile, SupplierBulkImport } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplier.import')
  return { title: t('metaTitle') }
}

export default async function SupplierBulkImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data: importsData } = await supabase
    .from('supplier_bulk_imports')
    .select('id, filename, rows_total, rows_valid, rows_invalid, rows_imported, status, created_at')
    .eq('supplier_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const imports = (importsData ?? []) as SupplierBulkImport[]

  const t = await getTranslations('supplier.import')
  const tc = await getTranslations('supplier.common')
  const tp = await getTranslations('supplier.products')
  const locale = await getLocale()

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    pending:   { label: t('statusPending'),   cls: 'bg-surface-2 text-muted' },
    validated: { label: t('statusValidated'), cls: 'bg-surface-2 text-muted' },
    imported:  { label: t('statusImported'),  cls: 'bg-success-soft text-success-fg' },
    failed:    { label: t('statusFailed'),    cls: 'bg-danger-soft text-danger-fg' },
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/supplier/products"
        backLabel={tp('breadcrumb')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t('pageSubtitle')}
          </p>
        </div>

        <BulkImportClient />

        {imports.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('historyTitle')}</h2>
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {imports.map((imp) => {
                const badge = STATUS_LABEL[imp.status] ?? STATUS_LABEL.pending
                return (
                  <div key={imp.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{imp.filename}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {t('historyRows', {
                          total: imp.rows_total,
                          valid: imp.rows_valid,
                          imported: imp.rows_imported,
                        })}
                      </p>
                      <p className="text-xs text-faint">{new Date(imp.created_at).toLocaleDateString(locale)}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
