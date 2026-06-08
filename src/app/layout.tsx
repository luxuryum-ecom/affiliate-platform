import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mozouna Group — COD & Sourcing Maroc',
  description: 'COD affiliate and wholesale marketplace — Morocco / MENA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="bg-white text-gray-900 antialiased font-sans">{children}</body>
    </html>
  )
}
