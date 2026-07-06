import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import SampleReplyClient from './SampleReplyClient'
import type {
  Profile,
  SampleRequest,
  SampleRequestStatus,
  SampleRequestFile,
  SupplierProduct,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplier.samples')
  return { title: t('metaTitle') }
}

const STATUS_BADGE_CLS: Record<SampleRequestStatus, string> = {
  pending:        'bg-warning-soft text-warning-fg',
  supplier_reply: 'bg-surface-2 text-muted',
  approved:       'bg-success-soft text-success-fg',
  rejected:       'bg-danger-soft text-danger-fg',
  shipped:        'bg-accent-soft text-accent-fg border border-gold-300',
  delivered:      'bg-surface-2 text-muted',
}

type RequestRow = SampleRequest & {
  product: Pick<SupplierProduct, 'id' | 'product_name'> | null
  files: SampleRequestFile[]
}

export default async function SupplierSamplesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name, role').eq('id', user.id).single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }
  if (profile?.role !== 'supplier') redirect('/login')

  // Get supplier's approved product ids.
  // Fuite M1 (mig 116) : lecture via la vue redacted OWNER (plus de SELECT base).
  const { data: ownProducts } = await supabase
    .from('supplier_products_owner_read')
    .select('id')
    .eq('supplier_id', user.id)

  const productIds = (ownProducts ?? []).map((p: { id: string }) => p.id)

  let requests: RequestRow[] = []
  if (productIds.length > 0) {
    const { data } = await supabase
      .from('sample_requests')
      .select('*, product:supplier_products!supplier_product_id(id,product_name)')
      .in('supplier_product_id', productIds)
      .order('created_at', { ascending: false })
      .limit(100)

    const rawRequests = (data ?? []) as unknown as RequestRow[]

    // Fetch files per request
    const requestIds = rawRequests.map((r) => r.id)
    let allFiles: SampleRequestFile[] = []
    if (requestIds.length > 0) {
      const { data: filesData } = await supabase
        .from('sample_request_files')
        .select('*')
        .in('sample_request_id', requestIds)
        .order('created_at', { ascending: false })
      allFiles = (filesData ?? []) as SampleRequestFile[]
    }

    requests = rawRequests.map((r) => ({
      ...r,
      files: allFiles.filter((f) => f.sample_request_id === r.id),
    }))
  }

  const t = await getTranslations('supplier.samples')
  const tc = await getTranslations('supplier.common')
  const locale = await getLocale()

  const pendingCount       = requests.filter((r) => r.status === 'pending').length
  const supplierReplyCount = requests.filter((r) => r.status === 'supplier_reply').length

  const STATUS_BADGE_LABEL: Record<SampleRequestStatus, string> = {
    pending:        t('statusPending'),
    supplier_reply: t('statusReplied'),
    approved:       t('statusApproved'),
    rejected:       t('statusRejected'),
    shipped:        t('statusShipped'),
    delivered:      t('statusDelivered'),
  }

  const TYPE_LABEL: Record<string, string> = {
    sample:          t('typePhysical'),
    photos:          t('typePhotos'),
    video:           t('typeVideo'),
    technical_sheet: t('typeTechnicalSheet'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/supplier/dashboard"
        backLabel={tc('dashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('pageSubtitle')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('statTotal'),   value: requests.length,      cls: 'bg-surface border-line text-foreground' },
            { label: t('statPending'), value: pendingCount,         cls: 'bg-warning-soft border-warning text-warning-fg' },
            { label: t('statReplied'), value: supplierReplyCount,   cls: 'bg-surface-2 border-line text-foreground' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {requests.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('emptyState')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const badgeCls = STATUS_BADGE_CLS[r.status]
              const badgeLabel = STATUS_BADGE_LABEL[r.status]
              return (
                <div key={r.id} className="bg-surface rounded-xl border border-line overflow-hidden">
                  <div className="p-4 border-b border-line">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {TYPE_LABEL[r.request_type] ?? r.request_type}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {t('labelProduct', { name: r.product?.product_name ?? '—' })}
                        </p>
                        {r.message && (
                          <p className="text-xs text-muted mt-1 italic">&ldquo;{r.message}&rdquo;</p>
                        )}
                        <p className="text-xs text-faint mt-1">{new Date(r.created_at).toLocaleDateString(locale)}</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${badgeCls}`}>{badgeLabel}</span>
                    </div>
                  </div>

                  {/* Existing files */}
                  {r.files.length > 0 && (
                    <div className="px-4 py-3 bg-surface-2 border-b border-line">
                      <p className="text-xs font-medium text-muted mb-2">{t('filesTitle')}</p>
                      <div className="space-y-1">
                        {r.files.map((f) => (
                          <div key={f.id} className="flex items-center gap-2 text-xs">
                            <span>{f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}</span>
                            <span className="text-muted truncate max-w-[200px]">{f.filename}</span>
                            {f.admin_approved ? (
                              <span className="text-success-fg font-medium">✓ {t('fileApproved')}</span>
                            ) : (
                              <span className="text-warning-fg">{t('filePending')}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reply form — only for pending/supplier_reply */}
                  {['pending', 'supplier_reply'].includes(r.status) && (
                    <div className="p-4">
                      <p className="text-xs font-medium text-muted mb-2">{t('replyTitle')}</p>
                      <SampleReplyClient requestId={r.id} />
                    </div>
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
