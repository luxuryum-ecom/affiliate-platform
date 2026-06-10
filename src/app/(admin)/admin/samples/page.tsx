import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
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

export const metadata = { title: 'Médiation échantillons — Administration' }

const STATUS_BADGE: Record<SampleRequestStatus, { label: string; cls: string }> = {
  pending:        { label: 'En attente',    cls: 'bg-amber-100 text-amber-700' },
  supplier_reply: { label: 'Répondu',       cls: 'bg-blue-100 text-blue-700' },
  approved:       { label: 'Approuvé',      cls: 'bg-green-100 text-green-700' },
  rejected:       { label: 'Refusé',        cls: 'bg-red-100 text-red-600' },
  shipped:        { label: 'Expédié',       cls: 'bg-indigo-100 text-indigo-700' },
  delivered:      { label: 'Livré',         cls: 'bg-gray-100 text-gray-500' },
}

const TYPE_LABEL: Record<string, string> = {
  sample:          'Échantillon physique',
  photos:          'Photos produit',
  video:           'Vidéo produit',
  technical_sheet: 'Fiche technique',
}

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Médiation échantillons</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}><button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button></form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Médiation échantillons & catalogues</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Identité fournisseur et identité acheteur masquées mutuellement.
          </p>
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Demandes totales',   value: totalRequests,   cls: 'bg-white border-gray-200 text-gray-900' },
            { label: 'En attente',         value: pendingRequests, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Fichiers à valider', value: pendingFiles,    cls: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'Catalogues à valider', value: pendingCatalogs, cls: 'bg-purple-50 border-purple-200 text-purple-700' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0,2).join(' ')}`}>
              <p className="text-xs text-gray-500 leading-tight">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Sample requests ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Demandes d&apos;échantillons ({requests.length})</h2>
          {requests.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">Aucune demande.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requestsWithUrls.map((r) => {
                const badge = STATUS_BADGE[r.status]
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{TYPE_LABEL[r.request_type] ?? r.request_type}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Produit : {r.product?.product_name ?? '—'}</p>
                        {r.message && <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{r.message}&rdquo;</p>}
                        {r.admin_notes && <p className="text-xs text-gray-400 mt-1">Note admin : {r.admin_notes}</p>}
                        <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                        <Link
                          href={`/admin/samples/${r.id}`}
                          className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                        >
                          Détail →
                        </Link>
                      </div>
                    </div>

                    {/* Files */}
                    {r.files.length > 0 && (
                      <div className="p-4 border-b border-gray-100">
                        <p className="text-xs font-medium text-gray-700 mb-2">Fichiers fournisseur</p>
                        <div className="space-y-2">
                          {r.files.map((f) => (
                            <div key={f.id} className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span>{f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}</span>
                                <span className="text-xs text-gray-700">{f.filename}</span>
                                {f.signedUrl && (
                                  <a href={f.signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                                    Ouvrir
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
                    <div className="p-4 bg-gray-50 flex flex-wrap gap-2">
                      {r.status !== 'approved'  && <SampleStatusButton requestId={r.id} newStatus="approved"  label="Approuver" cls="bg-green-600 text-white hover:bg-green-700" />}
                      {r.status !== 'rejected'  && <SampleStatusButton requestId={r.id} newStatus="rejected"  label="Rejeter"   cls="bg-red-500 text-white hover:bg-red-600" />}
                      {r.status === 'approved'  && <SampleStatusButton requestId={r.id} newStatus="shipped"   label="Marquer expédié" cls="bg-indigo-600 text-white hover:bg-indigo-700" />}
                      {r.status === 'shipped'   && <SampleStatusButton requestId={r.id} newStatus="delivered" label="Marquer livré"    cls="bg-gray-700 text-white hover:bg-gray-800" />}
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
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Catalogues fournisseurs ({catalogs.length})</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {catalogsWithUrls.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.file_type === 'pdf' ? '📄' : c.file_type === 'xlsx' ? '📊' : '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.filename}</p>
                      <p className="text-xs text-gray-400">{c.file_type.toUpperCase()} · {new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.signedUrl && (
                      <a href={c.signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                        Ouvrir →
                      </a>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.admin_status === 'approved' ? 'bg-green-100 text-green-700' : c.admin_status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                      {c.admin_status === 'approved' ? 'Approuvé' : c.admin_status === 'rejected' ? 'Rejeté' : 'En attente'}
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
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Pièces jointes produit ({attachments.length})</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {attachments.map((a) => (
                <div key={a.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.filename}</p>
                    <p className="text-xs text-gray-500">
                      {a.attachment_type} · {a.product?.product_name ?? '—'} · {new Date(a.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${a.admin_status === 'approved' ? 'bg-green-100 text-green-700' : a.admin_status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                      {a.admin_status === 'approved' ? 'Approuvé' : a.admin_status === 'rejected' ? 'Rejeté' : 'En attente'}
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
