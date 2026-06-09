import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type {
  Profile,
  SampleRequest,
  SampleRequestStatus,
  SampleRequestFile,
  SupplierProduct,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.samples')
  return { title: t('metaTitle') }
}

type RequestRow = SampleRequest & {
  product: Pick<SupplierProduct, 'id' | 'product_name'> | null
  files: SampleRequestFile[]
}

export default async function WholesaleSamplesPage() {
  const [t, tc, locale] = await Promise.all([
    getTranslations('wholesale.samples'),
    getTranslations('wholesale.common'),
    getLocale(),
  ])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data } = await supabase
    .from('sample_requests')
    .select('*, product:supplier_products!supplier_product_id(id,product_name)')
    .eq('wholesaler_id', user.id)
    .order('created_at', { ascending: false })

  const rawRequests = (data ?? []) as unknown as RequestRow[]
  const requestIds = rawRequests.map((r) => r.id)

  let allFiles: SampleRequestFile[] = []
  if (requestIds.length > 0) {
    const { data: filesData } = await supabase
      .from('sample_request_files')
      .select('*')
      .in('sample_request_id', requestIds)
      .eq('admin_approved', true)
      .order('created_at', { ascending: false })
    allFiles = (filesData ?? []) as SampleRequestFile[]
  }

  const requests: RequestRow[] = rawRequests.map((r) => ({
    ...r,
    files: allFiles.filter((f) => f.sample_request_id === r.id),
  }))

  // Generate signed URLs for approved files
  type FileWithUrl = SampleRequestFile & { signedUrl: string | null }
  const requestsWithUrls = await Promise.all(
    requests.map(async (r) => ({
      ...r,
      files: await Promise.all(
        r.files.map(async (f): Promise<FileWithUrl> => {
          const { data: signed } = await supabase.storage
            .from('sample-files')
            .createSignedUrl(f.storage_path, 3600)
          return { ...f, signedUrl: signed?.signedUrl ?? null }
        })
      ),
    }))
  )

  const pendingCount  = requests.filter((r) => r.status === 'pending').length
  const receivedCount = requests.filter((r) => ['supplier_reply', 'approved', 'shipped', 'delivered'].includes(r.status)).length

  // Map DB status → i18n key
  const statusKey: Record<SampleRequestStatus, string> = {
    pending:        'statusPending',
    supplier_reply: 'statusSupplierReply',
    approved:       'statusApproved',
    rejected:       'statusRejected',
    shipped:        'statusShipped',
    delivered:      'statusDelivered',
  }

  const statusCls: Record<SampleRequestStatus, string> = {
    pending:        'bg-amber-100 text-amber-700',
    supplier_reply: 'bg-blue-100 text-blue-700',
    approved:       'bg-green-100 text-green-700',
    rejected:       'bg-red-100 text-red-600',
    shipped:        'bg-indigo-100 text-indigo-700',
    delivered:      'bg-gray-100 text-gray-500',
  }

  // Map request_type → i18n key
  const typeKey: Record<string, string> = {
    sample:          'typeSample',
    photos:          'typePhotos',
    video:           'typeVideo',
    technical_sheet: 'typeTechnicalSheet',
  }

  type TKey = Parameters<typeof t>[0]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              {tc('backToDashboard')}
            </Link>
            <span className="text-gray-300">{tc('breadcrumbSep')}</span>
            <span className="font-semibold text-gray-900 text-sm">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('pageSubtitle')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { labelKey: 'statTotal',   value: requests.length,  cls: 'bg-white border-gray-200 text-gray-900' },
            { labelKey: 'statPending', value: pendingCount,     cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { labelKey: 'statReceived', value: receivedCount,   cls: 'bg-green-50 border-green-200 text-green-700' },
          ].map((s) => (
            <div key={s.labelKey} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-gray-500">{t(s.labelKey as TKey)}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400 mb-4">{t('emptyState')}</p>
            <Link
              href="/wholesale/marketplace"
              className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              {t('emptyCta')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {requestsWithUrls.map((r) => {
              const sKey = statusKey[r.status] ?? 'statusPending'
              const sCls = statusCls[r.status] ?? statusCls.pending
              const tKey = typeKey[r.request_type] ?? r.request_type
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {t(tKey as TKey)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t('productLabel', { name: r.product?.product_name ?? '—' })}
                        </p>
                        {r.message && (
                          <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{r.message}&rdquo;</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(r.created_at).toLocaleDateString(locale)}
                        </p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${sCls}`}>
                        {t(sKey as TKey)}
                      </span>
                    </div>
                  </div>

                  {/* Approved files */}
                  {r.files.length > 0 ? (
                    <div className="p-4 bg-green-50">
                      <p className="text-xs font-medium text-green-800 mb-2">{t('filesTitle')}</p>
                      <div className="space-y-2">
                        {r.files.map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}
                              </span>
                              <span className="text-xs text-gray-700 truncate max-w-[200px]">{f.filename}</span>
                            </div>
                            {f.signedUrl && (
                              <a
                                href={f.signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
                              >
                                {t('fileDownload')}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    ['pending', 'supplier_reply'].includes(r.status) && (
                      <div className="px-4 py-3 bg-gray-50">
                        <p className="text-xs text-gray-400">{t('awaitingReply')}</p>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
