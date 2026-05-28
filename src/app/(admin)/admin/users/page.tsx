import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { updateUserStatus } from '@/app/actions/users'
import type { Profile } from '@/types/database'

export const metadata = { title: 'Inscriptions — Administration' }

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  affiliate:  { label: 'Affilié',    cls: 'bg-blue-100 text-blue-700' },
  wholesaler: { label: 'Grossiste',  cls: 'bg-purple-100 text-purple-700' },
}

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: adminProfile } = (await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()) as { data: { full_name: string } | null; error: unknown }

  const { data: pendingUsers } = (await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'pending')
    .in('role', ['affiliate', 'wholesaler'])
    .order('created_at', { ascending: true })) as { data: Profile[] | null; error: unknown }

  const list = pendingUsers ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Inscriptions</span>
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Inscriptions en attente</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Approuvez les comptes affiliés et grossistes avant qu&apos;ils accèdent à la plateforme.
          </p>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune inscription en attente.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {list.map((profile) => {
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
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
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
      </main>
    </div>
  )
}
