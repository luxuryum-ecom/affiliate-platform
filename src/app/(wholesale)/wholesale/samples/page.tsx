import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
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
    pending:        'bg-warning-soft text-warning-fg',
    supplier_reply: 'bg-surface-2 text-muted border border-line',
    approved:       'bg-success-soft text-success-fg',
    rejected:       'bg-danger-soft text-danger-fg',
    shipped:        'bg-surface-2 text-muted border border-line',
    delivered:      'bg-surface-2 text-faint',
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
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/wholesale/dashboard"
        backLabel={tc('backToDashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('pageSubtitle')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { labelKey: 'statTotal',    value: requests.length,  cls: 'bg-surface border-line text-foreground' },
            { labelKey: 'statPending',  value: pendingCount,     cls: 'bg-warning-soft border-warning text-warning-fg' },
            { labelKey: 'statReceived', value: receivedCount,    cls: 'bg-success-soft border-success text-success-fg' },
          ].map((s) => (
            <div key={s.labelKey} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-muted">{t(s.labelKey as TKey)}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {requests.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint mb-4">{t('emptyState')}</p>
            <Link
              href="/wholesale/marketplace"
              className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
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
                <div key={r.id} className="bg-surface rounded-xl border border-line overflow-hidden">
                  <div className="p-4 border-b border-line">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {t(tKey as TKey)}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {t('productLabel', { name: r.product?.product_name ?? '—' })}
                        </p>
                        {r.message && (
                          <p className="text-xs text-muted mt-1 italic">&ldquo;{r.message}&rdquo;</p>
                        )}
                        <p className="text-xs text-faint mt-1">
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
                    <div className="p-4 bg-success-soft">
                      <p className="text-xs font-medium text-success-fg mb-2">{t('filesTitle')}</p>
                      <div className="space-y-2">
                        {r.files.map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}
                              </span>
                              <span className="text-xs text-foreground truncate max-w-[200px]">{f.filename}</span>
                            </div>
                            {f.signedUrl && (
                              <a
                                href={f.signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-3 py-1.5 bg-success-fg text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
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
                      <div className="px-4 py-3 bg-bg">
                        <p className="text-xs text-faint">{t('awaitingReply')}</p>
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
