import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Affiliate Platform',
  description: 'COD affiliate and wholesale marketplace — Morocco / MENA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  )
}
