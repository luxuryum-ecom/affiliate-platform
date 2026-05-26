import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Affiliate Platform</h1>
        <p className="mt-2 text-gray-500">
          Sell products as an affiliate or buy wholesale stock directly.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/signup?type=affiliate"
          className="px-6 py-3 bg-black text-white rounded-lg font-medium text-center hover:bg-gray-800 transition-colors"
        >
          Become an Affiliate
        </Link>
        <Link
          href="/signup?type=wholesale"
          className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-center hover:bg-gray-50 transition-colors"
        >
          Buy Wholesale
        </Link>
      </div>

      <div className="text-xs text-gray-400 text-center">
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-2">
          Sign in
        </Link>
      </div>
    </main>
  )
}
