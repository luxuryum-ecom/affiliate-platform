import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import SampleReplyClient from './SampleReplyClient'
import type {
  Profile,
  SampleRequest,
  SampleRequestStatus,
  SampleRequestFile,
  SupplierProduct,
} from '@/types/database'

export const metadata = { title: 'Demandes d\'échantillons — Espace Fournisseur' }

const STATUS_BADGE: Record<SampleRequestStatus, { label: string; cls: string }> = {
  pending:       { label: 'En attente',    cls: 'bg-amber-100 text-amber-700' },
  supplier_reply:{ label: 'Répondu',       cls: 'bg-blue-100 text-blue-700' },
  approved:      { label: 'Approuvé',      cls: 'bg-green-100 text-green-700' },
  rejected:      { label: 'Refusé',        cls: 'bg-red-100 text-red-600' },
  shipped:       { label: 'Expédié',       cls: 'bg-indigo-100 text-indigo-700' },
  delivered:     { label: 'Livré',         cls: 'bg-gray-100 text-gray-500' },
}

const TYPE_LABEL: Record<string, string> = {
  sample:          'Échantillon physique',
  photos:          'Photos produit',
  video:           'Vidéo produit',
  technical_sheet: 'Fiche technique',
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

  // Get supplier's approved product ids
  const { data: ownProducts } = await supabase
    .from('supplier_products')
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

  const pendingCount       = requests.filter((r) => r.status === 'pending').length
  const supplierReplyCount = requests.filter((r) => r.status === 'supplier_reply').length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Demandes d&apos;échantillons</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}><button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button></form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Demandes d&apos;échantillons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            L&apos;identité de l&apos;acheteur est masquée. Répondez uniquement via des fichiers.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total',         value: requests.length, cls: 'bg-white border-gray-200 text-gray-900' },
            { label: 'En attente',    value: pendingCount,    cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Répondu',       value: supplierReplyCount, cls: 'bg-blue-50 border-blue-200 text-blue-700' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0,2).join(' ')}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune demande d&apos;échantillon pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const badge = STATUS_BADGE[r.status]
              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {TYPE_LABEL[r.request_type] ?? r.request_type}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Produit : {r.product?.product_name ?? '—'}
                        </p>
                        {r.message && (
                          <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{r.message}&rdquo;</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${badge.cls}`}>{badge.label}</span>
                    </div>
                  </div>

                  {/* Existing files */}
                  {r.files.length > 0 && (
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-2">Fichiers envoyés</p>
                      <div className="space-y-1">
                        {r.files.map((f) => (
                          <div key={f.id} className="flex items-center gap-2 text-xs">
                            <span>{f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : '📄'}</span>
                            <span className="text-gray-700 truncate max-w-[200px]">{f.filename}</span>
                            {f.admin_approved ? (
                              <span className="text-green-600 font-medium">✓ Approuvé</span>
                            ) : (
                              <span className="text-amber-600">En attente</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reply form — only for pending/supplier_reply */}
                  {['pending', 'supplier_reply'].includes(r.status) && (
                    <div className="p-4">
                      <p className="text-xs font-medium text-gray-700 mb-2">Ajouter un fichier de réponse</p>
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
