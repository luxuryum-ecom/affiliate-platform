import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { promoteToAdmin } from './actions'

export const metadata = { title: 'Bootstrap — Admin Setup', robots: 'noindex,nofollow' }

/**
 * One-time admin bootstrap page.
 *
 * Security:
 *  - Accessible only when host = localhost (blocked in production / any remote host).
 *  - Becomes a permanent no-op after the first promotion (redirects to admin dashboard).
 *  - Uses service-role key server-side — never exposed to the browser.
 *
 * After use: this page silently redirects any admin to /admin/dashboard,
 * so it is self-disabling once the goal is achieved.
 */
export default async function BootstrapPage() {
  const headersList = await headers()
  const host = headersList.get('host') ?? ''

  // Hard-block: only localhost is allowed
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role, full_name, status')
    .eq('id', user.id)
    .single()) as {
    data: { role: string; full_name: string; status: string } | null
    error: unknown
  }

  // Already admin — bootstrap consumed, nothing left to do
  if (profile?.role === 'admin') redirect('/admin/dashboard')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-md p-8 space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
              localhost uniquement
            </span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
              usage unique
            </span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mt-2">
            Bootstrap administrateur
          </h1>
          <p className="text-sm text-gray-500">
            Promouvoir le compte actuel au rôle admin.
            Cette page se désactivera automatiquement après la promotion.
          </p>
        </div>

        {/* Account info */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Compte</span>
            <span className="font-medium text-gray-900">{profile?.full_name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Rôle actuel</span>
            <span className="font-medium text-gray-700 capitalize">{profile?.role ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Statut</span>
            <span className="font-medium text-gray-700 capitalize">{profile?.status ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">ID</span>
            <span className="font-mono text-xs text-gray-400 truncate max-w-[180px]">{user.id}</span>
          </div>
        </div>

        {/* Action */}
        <form action={promoteToAdmin}>
          <button
            type="submit"
            className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors"
          >
            Promouvoir en administrateur →
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center">
          Après la promotion vous serez redirigé vers <code className="bg-gray-100 px-1 rounded">/admin/dashboard</code>.
          Cette page ne sera plus accessible.
        </p>
      </div>
    </div>
  )
}
