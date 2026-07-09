import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'
import { InstallPrompt } from '@/components/pwa/install-prompt'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Abdou Baba — COD & Sourcing Maroc',
  description: 'COD affiliate and wholesale marketplace — Morocco / MENA',
  // PWA (AM-10) — le manifest est auto-injecté via src/app/manifest.ts.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Abdou Baba',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  const dir = locale.startsWith('ar') ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={dir} className={inter.variable}>
      <body className="bg-white text-gray-900 antialiased font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <InstallPrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
