import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import {
  SampleStatusButton,
  FileApprovalButton,
} from '../AdminSampleActions'
import type {
  Profile,
  SampleRequest,
  SampleRequestStatus,
  SampleRequestFile,
  SupplierProduct,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.sampleDetail')
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

const NEUTRAL_BTN = 'bg-surface-2 text-muted border border-line hover:bg-surface'
const APPROVE_BTN = 'bg-success-soft text-success-fg border border-success hover:opacity-80'
const REJECT_BTN  = 'bg-danger-soft text-danger-fg border border-danger hover:opacity-80'

type SampleRow = SampleRequest & {
  product: Pick<SupplierProduct, 'id' | 'product_name'> | null
  wholesaler: Pick<Profile, 'id' | 'full_name' | 'phone' | 'company_name'> | null
}

type FileWithUrl = SampleRequestFile & { signedUrl: string | null }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSampleDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/login')

  const t  = await getTranslations('admin.sampleDetail')
  const ts = await getTranslations('admin.samples')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const isRtl = locale === 'ar'
  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-FR'
  const typeLabel = (type: string) => (TYPE_KEYS.includes(type) ? ts(`type.${type}`) : type)

  const { data } = await supabase
    .from('sample_requests')
    .select('*, product:supplier_products!supplier_product_id(id,product_name), wholesaler:profiles!wholesaler_id(id,full_name,phone,company_name)')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const r = data as unknown as SampleRow

  const { data: filesData } = await supabase
    .from('sample_request_files')
    .select('*')
    .eq('sample_request_id', id)
    .order('created_at', { ascending: false })

  const rawFiles = (filesData ?? []) as SampleRequestFile[]

  const files: FileWithUrl[] = await Promise.all(
    rawFiles.map(async (f) => {
      const { data: signed } = await supabase.storage
        .from('sample-files')
        .createSignedUrl(f.storage_path, 3600)
      return { ...f, signedUrl: signed?.signedUrl ?? null }
    })
  )

  const cls = STATUS_CLS[r.status]

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={typeLabel(r.request_type)}
        backHref="/admin/samples"
        backLabel={ts('pageTitle')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Status + date */}
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>
            {ts(`status.${r.status}`)}
          </span>
          <span className="text-xs text-faint">
            {t('receivedOn', { date: new Date(r.created_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Request details */}
          <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">{t('requestDetails')}</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('typeLabel')}</dt>
                <dd className="font-medium text-foreground text-right">{typeLabel(r.request_type)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{tc('product')}</dt>
                <dd className="font-medium text-foreground text-right">
                  {r.product ? (
                    <Link
                      href={`/wholesale/marketplace/${r.product.id}`}
                      className="text-gold-500 hover:text-gold-600 transition-colors"
                    >
                      {r.product.product_name}
                    </Link>
                  ) : '—'}
                </dd>
              </div>
            </dl>
            {r.message && (
              <div className="pt-3 border-t border-line">
                <p className="text-xs text-muted mb-1">{t('wholesalerMessage')}</p>
                <p className="text-sm text-foreground italic">&ldquo;{r.message}&rdquo;</p>
              </div>
            )}
            {r.admin_notes && (
              <div className="pt-3 border-t border-line">
                <p className="text-xs text-muted mb-1">{t('adminNotes')}</p>
                <p className="text-sm text-foreground">{r.admin_notes}</p>
              </div>
            )}
          </div>

          {/* Wholesaler contact */}
          <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">{t('wholesalerContact')}</h2>
            {r.wholesaler ? (
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{tc('name')}</dt>
                  <dd className="font-medium text-foreground text-right">{r.wholesaler.full_name}</dd>
                </div>
                {r.wholesaler.company_name && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t('company')}</dt>
                    <dd className="font-medium text-foreground text-right">{r.wholesaler.company_name}</dd>
                  </div>
                )}
                {r.wholesaler.phone && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{tc('phone')}</dt>
                    <dd className="text-right">
                      <a href={`tel:${r.wholesaler.phone}`} className="font-medium text-gold-500 hover:text-gold-600 transition-colors">
                        {r.wholesaler.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-faint">{t('wholesalerUnavailable')}</p>
            )}
          </div>
        </div>

        {/* Status actions */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('actions')}</h2>
          <div className="flex flex-wrap gap-2">
            {r.status !== 'approved'  && <SampleStatusButton requestId={r.id} newStatus="approved"  label={ts('approve')}       cls={APPROVE_BTN} />}
            {r.status !== 'rejected'  && <SampleStatusButton requestId={r.id} newStatus="rejected"  label={ts('reject')}        cls={REJECT_BTN} />}
            {r.status === 'approved'  && <SampleStatusButton requestId={r.id} newStatus="shipped"   label={ts('markShipped')}   cls={NEUTRAL_BTN} />}
            {r.status === 'shipped'   && <SampleStatusButton requestId={r.id} newStatus="delivered" label={ts('markDelivered')} cls={NEUTRAL_BTN} />}
          </div>
        </div>

        {/* Files */}
        {files.length > 0 && (
          <div className="bg-surface rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('supplierFiles')}</h2>
            <div className="space-y-3">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}</span>
                    <div>
                      <p className="text-xs font-medium text-foreground">{f.filename}</p>
                      <p className="text-xs text-faint">
                        {f.admin_approved ? t('fileApproved') : t('filePending')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {f.signedUrl && (
                      <a
                        href={f.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${NEUTRAL_BTN}`}
                      >
                        {ts('open')} {isRtl ? '←' : '→'}
                      </a>
                    )}
                    {!f.admin_approved && <FileApprovalButton fileId={f.id} approved={true} />}
                    {f.admin_approved  && <FileApprovalButton fileId={f.id} approved={false} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {files.length === 0 && (
          <div className="bg-surface rounded-xl border border-line p-5 text-center">
            <p className="text-sm text-faint">{t('noFiles')}</p>
          </div>
        )}

      </main>
    </div>
  )
}
