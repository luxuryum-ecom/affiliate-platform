import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { updateUserStatus } from '@/app/actions/users'
import type { Profile } from '@/types/database'

export const metadata = { title: 'Utilisateurs — Administration' }

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  affiliate:  { label: 'Affilié',   cls: 'bg-blue-100 text-blue-700' },
  wholesaler: { label: 'Grossiste', cls: 'bg-purple-100 text-purple-700' },
}

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: adminProfile } = (await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()) as { data: { full_name: string } | null; error: unknown }

  const [pendingRes, approvedRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .in('role', ['affiliate', 'wholesaler'])
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, phone, role, status, wholesale_access')
      .eq('status', 'approved')
      .in('role', ['affiliate', 'wholesaler'])
      .order('created_at', { ascending: false }),
  ])

  const pending  = (pendingRes.data ?? []) as Profile[]
  const approved = (approvedRes.data ?? []) as Pick<
    Profile,
    'id' | 'full_name' | 'phone' | 'role' | 'status' | 'wholesale_access'
  >[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Utilisateurs</span>
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* ── Pending registrations (existing flow — unchanged) ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Inscriptions en attente</h2>
            {pending.length > 0 && (
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                {pending.length}
              </span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 text-sm text-gray-400">
              Aucune inscription en attente.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {pending.map((profile) => {
                const badge = ROLE_BADGE[profile.role] ?? ROLE_BADGE.affiliate
                return (
                  <div key={profile.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{profile.full_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Inscrit le{' '}
                        {new Date(profile.created_at).toLocaleDateString('fr-MA', {
                          day: '2-digit', month: 'long', year: 'numeric',
                        })}
                      </p>
                      {profile.phone && (
                        <p className="text-xs text-gray-400 mt-0.5">{profile.phone}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <form action={updateUserStatus}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Approuver
                        </button>
                      </form>
                      <form action={updateUserStatus}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button
                          type="submit"
                          className="px-4 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Rejeter
                        </button>
                      </form>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Approved users ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Utilisateurs approuvés</h2>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
              {approved.length}
            </span>
          </div>

          {approved.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 text-sm text-gray-400">
              Aucun utilisateur approuvé.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {approved.map((profile) => {
                const badge = ROLE_BADGE[profile.role] ?? ROLE_BADGE.affiliate
                const hasWholesale = profile.wholesale_access === true

                return (
                  <div key={profile.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{profile.full_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {hasWholesale && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            Accès grossiste
                          </span>
                        )}
                      </div>
                      {profile.phone && (
                        <p className="text-xs text-gray-400 mt-0.5">{profile.phone}</p>
                      )}
                    </div>
                    <Link
                      href={`/admin/users/${profile.id}`}
                      className="shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      Gérer →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
