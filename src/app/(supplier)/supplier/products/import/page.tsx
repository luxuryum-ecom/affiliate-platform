import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import BulkImportClient from './BulkImportClient'
import type { Profile, SupplierBulkImport } from '@/types/database'

export const metadata = { title: 'Import en masse — Espace Fournisseur' }

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

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'En attente',  cls: 'bg-gray-100 text-gray-500' },
    validated: { label: 'Validé',      cls: 'bg-blue-100 text-blue-700' },
    imported:  { label: 'Importé',     cls: 'bg-green-100 text-green-700' },
    failed:    { label: 'Échoué',      cls: 'bg-red-100 text-red-600' },
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/products" className="text-gray-400 hover:text-gray-600 text-sm">← Mes produits</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Import en masse</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Import en masse</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Importez votre catalogue complet via un fichier CSV. Les produits seront soumis en attente d&apos;approbation admin.
          </p>
        </div>

        <BulkImportClient />

        {imports.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Historique des imports</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {imports.map((imp) => {
                const badge = STATUS_LABEL[imp.status] ?? STATUS_LABEL.pending
                return (
                  <div key={imp.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{imp.filename}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {imp.rows_total} lignes · {imp.rows_valid} valides · {imp.rows_imported} importées
                      </p>
                      <p className="text-xs text-gray-400">{new Date(imp.created_at).toLocaleDateString('fr-FR')}</p>
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
