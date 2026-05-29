import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signOut } from '@/app/actions/auth'
import { WholesaleAccessToggle } from '@/components/admin/wholesale-access-toggle'
import type { Profile } from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
}

const ROLE_LABEL: Record<string, string> = {
  affiliate:  'Affilié',
  wholesaler: 'Grossiste',
  admin:      'Administrateur',
  agent:      'Agent',
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'En attente',  cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvé',    cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejeté',      cls: 'bg-red-100 text-red-500' },
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', id)
    .single() as { data: { full_name: string } | null; error: unknown }
  return { title: data ? `${data.full_name} — Admin` : 'Utilisateur — Admin' }
}

export default async function AdminUserDetailPage({ params }: Params) {
  const { id } = await params

  const [supabase, adminClient] = [await createClient(), createAdminClient()]

  const [adminProfileRes, profileRes, authUserRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', (await supabase.auth.getUser()).data.user!.id).single(),
    supabase.from('profiles').select('*').eq('id', id).single(),
    adminClient.auth.admin.getUserById(id),
  ])

  const adminProfile = adminProfileRes.data as { full_name: string } | null
  const profile = profileRes.data as Profile | null
  const email = authUserRes.data?.user?.email ?? null

  if (!profile) notFound()

  const statusBadge = STATUS_LABEL[profile.status] ?? STATUS_LABEL.pending
  const isAffiliate = profile.role === 'affiliate'
  const isWholesaler = profile.role === 'wholesaler'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Utilisateurs
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
              {profile.full_name}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{adminProfile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* ── Profile info ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Informations du compte</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Nom complet</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Email</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{email ?? <span className="text-gray-400">—</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Téléphone</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{profile.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Ville</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{profile.city ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Rôle</dt>
              <dd className="mt-0.5">
                <span className="font-medium text-gray-900">{ROLE_LABEL[profile.role] ?? profile.role}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Statut</dt>
              <dd className="mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Inscrit le</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {new Date(profile.created_at).toLocaleDateString('fr-MA', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">ID</dt>
              <dd className="font-mono text-xs text-gray-400 mt-0.5">{profile.id}</dd>
            </div>
          </dl>
        </div>

        {/* ── Access flags ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900">Accès et autorisations</h2>

          {/* Affiliate status — read only */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-900">Accès affilié</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Peut promouvoir des produits et générer des commissions COD.
              </p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${
              isAffiliate && profile.status === 'approved'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {isAffiliate && profile.status === 'approved' ? 'Activé' : 'Non'}
            </span>
          </div>

          {/* Wholesale access — editable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Accès grossiste (B2B)</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isWholesaler
                  ? 'Rôle grossiste — accès B2B natif.'
                  : 'Accès au catalogue B2B, panier et commandes grossiste.'}
              </p>
            </div>
            {isWholesaler ? (
              <span className="text-xs px-3 py-1 rounded-full font-medium bg-purple-100 text-purple-700">
                Natif
              </span>
            ) : (
              <WholesaleAccessToggle
                profileId={profile.id}
                initialValue={profile.wholesale_access ?? false}
              />
            )}
          </div>
        </div>

        {/* ── Billing info (if any) ── */}
        {(profile.company_name || profile.ice || profile.registre_commerce || profile.billing_address) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Facturation</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {profile.company_name && (
                <div><dt className="text-xs text-gray-400">Raison sociale</dt><dd className="font-medium text-gray-900 mt-0.5">{profile.company_name}</dd></div>
              )}
              {profile.ice && (
                <div><dt className="text-xs text-gray-400">ICE</dt><dd className="font-medium text-gray-900 mt-0.5">{profile.ice}</dd></div>
              )}
              {profile.registre_commerce && (
                <div><dt className="text-xs text-gray-400">RC</dt><dd className="font-medium text-gray-900 mt-0.5">{profile.registre_commerce}</dd></div>
              )}
              {profile.billing_address && (
                <div className="sm:col-span-2"><dt className="text-xs text-gray-400">Adresse</dt><dd className="font-medium text-gray-900 mt-0.5">{profile.billing_address}</dd></div>
              )}
            </dl>
          </div>
        )}

      </main>
    </div>
  )
}
