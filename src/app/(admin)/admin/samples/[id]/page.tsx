import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
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

export const metadata = { title: 'Détail demande échantillon — Administration' }

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

  const badge = STATUS_BADGE[r.status]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/samples" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Médiation échantillons
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
              {TYPE_LABEL[r.request_type] ?? r.request_type}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Status + date */}
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="text-xs text-gray-400">
            Reçue le {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Request details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Détails de la demande</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Type</dt>
                <dd className="font-medium text-gray-900 text-right">{TYPE_LABEL[r.request_type] ?? r.request_type}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Produit</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {r.product ? (
                    <Link
                      href={`/wholesale/marketplace/${r.product.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {r.product.product_name}
                    </Link>
                  ) : '—'}
                </dd>
              </div>
            </dl>
            {r.message && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Message grossiste</p>
                <p className="text-sm text-gray-700 italic">&ldquo;{r.message}&rdquo;</p>
              </div>
            )}
            {r.admin_notes && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes internes (admin)</p>
                <p className="text-sm text-gray-700">{r.admin_notes}</p>
              </div>
            )}
          </div>

          {/* Wholesaler contact */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Contact grossiste</h2>
            {r.wholesaler ? (
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Nom</dt>
                  <dd className="font-medium text-gray-900 text-right">{r.wholesaler.full_name}</dd>
                </div>
                {r.wholesaler.company_name && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Société</dt>
                    <dd className="font-medium text-gray-900 text-right">{r.wholesaler.company_name}</dd>
                  </div>
                )}
                {r.wholesaler.phone && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Téléphone</dt>
                    <dd className="text-right">
                      <a href={`tel:${r.wholesaler.phone}`} className="font-medium text-blue-600 hover:underline">
                        {r.wholesaler.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">Identité grossiste non disponible.</p>
            )}
          </div>
        </div>

        {/* Status actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {r.status !== 'approved'  && <SampleStatusButton requestId={r.id} newStatus="approved"  label="Approuver"       cls="bg-green-600 text-white hover:bg-green-700" />}
            {r.status !== 'rejected'  && <SampleStatusButton requestId={r.id} newStatus="rejected"  label="Rejeter"         cls="bg-red-500 text-white hover:bg-red-600" />}
            {r.status === 'approved'  && <SampleStatusButton requestId={r.id} newStatus="shipped"   label="Marquer expédié" cls="bg-indigo-600 text-white hover:bg-indigo-700" />}
            {r.status === 'shipped'   && <SampleStatusButton requestId={r.id} newStatus="delivered" label="Marquer livré"   cls="bg-gray-700 text-white hover:bg-gray-800" />}
          </div>
        </div>

        {/* Files */}
        {files.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Fichiers fournisseur</h2>
            <div className="space-y-3">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}</span>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{f.filename}</p>
                      <p className="text-xs text-gray-400">
                        {f.admin_approved ? 'Approuvé' : 'En attente d\'approbation'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {f.signedUrl && (
                      <a
                        href={f.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                      >
                        Ouvrir →
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
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
            <p className="text-sm text-gray-400">Aucun fichier fournisseur pour le moment.</p>
          </div>
        )}

      </main>
    </div>
  )
}
