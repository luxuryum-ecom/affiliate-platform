import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">AffiPartner Morocco</h1>
        <p className="mt-2 text-gray-500">
          Vendez en dropshipping COD ou achetez en gros pour votre activité B2B.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/signup?type=affiliate"
          className="px-6 py-3 bg-black text-white rounded-lg font-medium text-center hover:bg-gray-800 transition-colors"
        >
          Je fais de l&apos;affiliation
        </Link>
        <Link
          href="/signup?type=wholesale"
          className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-center hover:bg-gray-50 transition-colors"
        >
          J&apos;achète en gros
        </Link>
        <Link
          href="/signup?type=supplier"
          className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-center hover:bg-gray-50 transition-colors"
        >
          Je vends mes produits
        </Link>
      </div>

      <div className="text-xs text-gray-400 text-center">
        Déjà inscrit ?{' '}
        <Link href="/login" className="underline underline-offset-2">
          Se connecter
        </Link>
      </div>
    </main>
  )
}
