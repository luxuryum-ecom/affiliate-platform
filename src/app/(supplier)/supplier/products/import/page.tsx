import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
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
    pending:   { label: t('statusPending'),   cls: 'bg-gray-100 text-gray-500' },
    validated: { label: t('statusValidated'), cls: 'bg-blue-100 text-blue-700' },
    imported:  { label: t('statusImported'),  cls: 'bg-green-100 text-green-700' },
    failed:    { label: t('statusFailed'),    cls: 'bg-red-100 text-red-600' },
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/products" className="text-gray-400 hover:text-gray-600 text-sm">← {tp('breadcrumb')}</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">{tc('signOut')}</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('pageSubtitle')}
          </p>
        </div>

        <BulkImportClient />

        {imports.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('historyTitle')}</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {imports.map((imp) => {
                const badge = STATUS_LABEL[imp.status] ?? STATUS_LABEL.pending
                return (
                  <div key={imp.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{imp.filename}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t('historyRows', {
                          total: imp.rows_total,
                          valid: imp.rows_valid,
                          imported: imp.rows_imported,
                        })}
                      </p>
                      <p className="text-xs text-gray-400">{new Date(imp.created_at).toLocaleDateString(locale)}</p>
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
