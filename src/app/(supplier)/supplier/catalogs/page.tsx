import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import CatalogUploadClient from './CatalogUploadClient'
import type { Profile, SupplierCatalog, AttachmentAdminStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplier.catalogs')
  return { title: t('metaTitle') }
}

const STATUS_BADGE_CLS: Record<AttachmentAdminStatus, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

const FILE_ICON: Record<string, string> = { pdf: '📄', xlsx: '📊', zip: '📦' }

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function SupplierCatalogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name, role').eq('id', user.id).single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'supplier') redirect('/login')

  const { data } = await supabase
    .from('supplier_catalogs')
    .select('*')
    .eq('supplier_id', user.id)
    .order('created_at', { ascending: false })

  const catalogs = (data ?? []) as SupplierCatalog[]

  const t = await getTranslations('supplier.catalogs')
  const tc = await getTranslations('supplier.common')
  const locale = await getLocale()

  const STATUS_BADGE_LABEL: Record<AttachmentAdminStatus, string> = {
    pending:  t('statusPending'),
    approved: t('statusApproved'),
    rejected: t('statusRejected'),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← {tc('dashboard')}</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}><button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">{tc('signOut')}</button></form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('pageSubtitle')}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('addTitle')}</h2>
          <CatalogUploadClient />
        </div>

        {catalogs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('uploadedTitle', { count: catalogs.length })}</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {catalogs.map((c) => {
                const badgeCls = STATUS_BADGE_CLS[c.admin_status]
                const badgeLabel = STATUS_BADGE_LABEL[c.admin_status]
                return (
                  <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{FILE_ICON[c.file_type] ?? '📁'}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.filename}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.file_type.toUpperCase()}
                          {c.file_size ? ` · ${formatBytes(c.file_size)}` : ''}
                          {' · '}{new Date(c.created_at).toLocaleDateString(locale)}
                        </p>
                        {c.admin_notes && c.admin_status === 'rejected' && (
                          <p className="text-xs text-red-600 mt-1">{c.admin_notes}</p>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badgeCls}`}>{badgeLabel}</span>
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
