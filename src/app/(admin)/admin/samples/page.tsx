import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import {
  SampleStatusButton,
  FileApprovalButton,
  CatalogStatusButton,
  AttachmentStatusButton,
} from './AdminSampleActions'
import type {
  Profile,
  SampleRequest,
  SampleRequestStatus,
  SampleRequestFile,
  SupplierProduct,
  SupplierCatalog,
  SupplierProductAttachment,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.samples')
  return { title: t('metaTitle') }
}

const TYPE_KEYS = ['sample', 'photos', 'video', 'technical_sheet']

// CSS only — labels via t()
const STATUS_CLS: Record<SampleRequestStatus, string> = {
  pending:        'bg-warning-soft text-warning-fg border-warning',
  supplier_reply: 'bg-surface-2 text-muted border-line',
  approved:       'bg-success-soft text-success-fg border-success',
  rejected:       'bg-danger-soft text-danger-fg border-danger',
  shipped:        'bg-surface-2 text-muted border-line',
  delivered:      'bg-surface-2 text-faint border-line',
}

// Action button tokens
const NEUTRAL_BTN = 'bg-surface-2 text-muted border border-line hover:bg-surface'
const APPROVE_BTN = 'bg-success-soft text-success-fg border border-success hover:opacity-80'
const REJECT_BTN  = 'bg-danger-soft text-danger-fg border border-danger hover:opacity-80'

type SampleRow = SampleRequest & {
  product: Pick<SupplierProduct, 'id' | 'product_name'> | null
  files: SampleRequestFile[]
}

type FileWithUrl = SampleRequestFile & { signedUrl: string | null }

export default async function AdminSamplesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name, role').eq('id', user.id).single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }
  if (profile?.role !== 'admin') redirect('/login')

  const t  = await getTranslations('admin.samples')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const isRtl = locale === 'ar'
  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-FR'
  const typeLabel = (type: string) => (TYPE_KEYS.includes(type) ? t(`type.${type}`) : type)

  const [requestsRes, catalogsRes, attachmentsRes] = await Promise.all([
    supabase
      .from('sample_requests')
      .select('*, product:supplier_products!supplier_product_id(id,product_name)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('supplier_catalogs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('supplier_product_attachments')
      .select('*, product:supplier_products!supplier_product_id(id,product_name)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const rawRequests = (requestsRes.data ?? []) as unknown as SampleRow[]
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

  const requests = rawRequests.map((r) => ({
    ...r,
    files: allFiles.filter((f) => f.sample_request_id === r.id),
  }))

  // Generate signed URLs for sample files
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

  const catalogs = (catalogsRes.data ?? []) as SupplierCatalog[]
  type AttachmentRow = SupplierProductAttachment & { product: Pick<SupplierProduct, 'id' | 'product_name'> | null }
  const attachments = (attachmentsRes.data ?? []) as unknown as AttachmentRow[]

  // Analytics
  const totalRequests   = requests.length
  const pendingRequests = requests.filter((r) => r.status === 'pending').length
  const pendingFiles    = allFiles.filter((f) => !f.admin_approved).length
  const pendingCatalogs = catalogs.filter((c) => c.admin_status === 'pending').length

  // Generate signed URLs for catalogs
  type CatalogWithUrl = SupplierCatalog & { signedUrl: string | null }
  const catalogsWithUrls: CatalogWithUrl[] = await Promise.all(
    catalogs.map(async (c) => {
      const { data: signed } = await supabase.storage
        .from('supplier-catalogs')
        .createSignedUrl(c.storage_path, 3600)
      return { ...c, signedUrl: signed?.signedUrl ?? null }
    })
  )

  const stats = [
    { label: t('statTotal'),           value: totalRequests,   box: 'bg-surface border-line',         text: 'text-foreground' },
    { label: t('statPending'),         value: pendingRequests, box: 'bg-warning-soft border-warning', text: 'text-warning-fg' },
    { label: t('statPendingFiles'),    value: pendingFiles,    box: 'bg-surface-2 border-line',       text: 'text-foreground' },
    { label: t('statPendingCatalogs'), value: pendingCatalogs, box: 'bg-accent-soft border-accent',   text: 'text-accent-fg' },
  ]

  const catalogStatusLabel = (s: string) => (s === 'approved' ? tc('approved') : s === 'rejected' ? tc('rejected') : t('statPending'))
  const catalogStatusCls = (s: string) =>
    s === 'approved' ? 'bg-success-soft text-success-fg border-success'
      : s === 'rejected' ? 'bg-danger-soft text-danger-fg border-danger'
      : 'bg-warning-soft text-warning-fg border-warning'

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={t('backLabel')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('heading')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t('subtitle')}
          </p>
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.box}`}>
              <p className="text-xs text-muted leading-tight">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.text}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Sample requests ── */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('requestsHeading')} ({requests.length})</h2>
          {requests.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line p-8 text-center">
              <p className="text-sm text-faint">{t('empty')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requestsWithUrls.map((r) => {
                const cls = STATUS_CLS[r.status]
                return (
                  <div key={r.id} className="bg-surface rounded-xl border border-line overflow-hidden">
                    <div className="p-4 border-b border-line flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{typeLabel(r.request_type)}</p>
                        <p className="text-xs text-muted mt-0.5">{tc('product')}&nbsp;: {r.product?.product_name ?? '—'}</p>
                        {r.message && <p className="text-xs text-muted mt-1 italic">&ldquo;{r.message}&rdquo;</p>}
                        {r.admin_notes && <p className="text-xs text-faint mt-1">{t('adminNote')}&nbsp;: {r.admin_notes}</p>}
                        <p className="text-xs text-faint mt-1">{new Date(r.created_at).toLocaleDateString(dateLocale)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>{t(`status.${r.status}`)}</span>
                        <Link
                          href={`/admin/samples/${r.id}`}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${NEUTRAL_BTN}`}
                        >
                          {t('detail')} {isRtl ? '←' : '→'}
                        </Link>
                      </div>
                    </div>

                    {/* Files */}
                    {r.files.length > 0 && (
                      <div className="p-4 border-b border-line">
                        <p className="text-xs font-medium text-foreground mb-2">{t('supplierFiles')}</p>
                        <div className="space-y-2">
                          {r.files.map((f) => (
                            <div key={f.id} className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span>{f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}</span>
                                <span className="text-xs text-foreground">{f.filename}</span>
                                {f.signedUrl && (
                                  <a href={f.signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gold-500 hover:text-gold-600 transition-colors">
                                    {t('open')}
                                  </a>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {!f.admin_approved && <FileApprovalButton fileId={f.id} approved={true} />}
                                {f.admin_approved  && <FileApprovalButton fileId={f.id} approved={false} />}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status actions */}
                    <div className="p-4 bg-surface-2 flex flex-wrap gap-2">
                      {r.status !== 'approved'  && <SampleStatusButton requestId={r.id} newStatus="approved"  label={t('approve')}        cls={APPROVE_BTN} />}
                      {r.status !== 'rejected'  && <SampleStatusButton requestId={r.id} newStatus="rejected"  label={t('reject')}         cls={REJECT_BTN} />}
                      {r.status === 'approved'  && <SampleStatusButton requestId={r.id} newStatus="shipped"   label={t('markShipped')}    cls={NEUTRAL_BTN} />}
                      {r.status === 'shipped'   && <SampleStatusButton requestId={r.id} newStatus="delivered" label={t('markDelivered')}  cls={NEUTRAL_BTN} />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Supplier catalogs ── */}
        {catalogsWithUrls.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('catalogsHeading')} ({catalogs.length})</h2>
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {catalogsWithUrls.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.file_type === 'pdf' ? '📄' : c.file_type === 'xlsx' ? '📊' : '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.filename}</p>
                      <p className="text-xs text-faint">{c.file_type.toUpperCase()} · {new Date(c.created_at).toLocaleDateString(dateLocale)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.signedUrl && (
                      <a href={c.signedUrl} target="_blank" rel="noopener noreferrer" className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${NEUTRAL_BTN}`}>
                        {t('open')} {isRtl ? '←' : '→'}
                      </a>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${catalogStatusCls(c.admin_status)}`}>
                      {catalogStatusLabel(c.admin_status)}
                    </span>
                    {c.admin_status !== 'approved' && <CatalogStatusButton catalogId={c.id} newStatus="approved" />}
                    {c.admin_status !== 'rejected' && <CatalogStatusButton catalogId={c.id} newStatus="rejected" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Product attachments ── */}
        {attachments.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('attachmentsHeading')} ({attachments.length})</h2>
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {attachments.map((a) => (
                <div key={a.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.filename}</p>
                    <p className="text-xs text-muted">
                      {a.attachment_type} · {a.product?.product_name ?? '—'} · {new Date(a.created_at).toLocaleDateString(dateLocale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${catalogStatusCls(a.admin_status)}`}>
                      {catalogStatusLabel(a.admin_status)}
                    </span>
                    {a.admin_status !== 'approved' && <AttachmentStatusButton attachmentId={a.id} newStatus="approved" />}
                    {a.admin_status !== 'rejected' && <AttachmentStatusButton attachmentId={a.id} newStatus="rejected" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
