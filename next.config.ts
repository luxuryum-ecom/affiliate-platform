import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// ── GARDE-FOU ANTI-RÉCIDIVE (incident 2026-06-27) ─────────────────────────────
// Une clé secrète Supabase (`sb_secret_…`, service_role) avait été collée dans la
// variable Vercel `NEXT_PUBLIC_APP_URL`. Tout `NEXT_PUBLIC_*` est INLINÉ dans le
// bundle client au build → la clé service_role (qui bypasse la RLS) a fuité
// publiquement (liens/QR/WhatsApp) et l'URL de parrainage était cassée.
// On REFUSE désormais tout build/démarrage si une variable `NEXT_PUBLIC_*` a une
// valeur commençant par « sb_secret_ ». Échec rapide et explicite (sur Vercel,
// process.env contient les variables de la plateforme au moment du build).
// NB : « sb_publishable_ » (clé publiable, publique par nature) n'est PAS visé.
function assertNoPublicSecretLeak(): void {
  const offenders = Object.entries(process.env)
    .filter(
      ([key, value]) =>
        key.startsWith('NEXT_PUBLIC_') &&
        typeof value === 'string' &&
        value.trim().startsWith('sb_secret_'),
    )
    .map(([key]) => key)

  if (offenders.length > 0) {
    throw new Error(
      `[SÉCURITÉ] Build refusé : variable(s) NEXT_PUBLIC_* contenant une clé secrète ` +
        `Supabase (sb_secret_…) → ${offenders.join(', ')}. Ces variables sont exposées ` +
        `au client (bundle JS). Retire le secret de cette variable ET rote la clé service_role.`,
    )
  }
}

assertNoPublicSecretLeak()

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // Justificatifs de paiement (photos de téléphone) transitent par une Server
  // Action. La limite Next par défaut (1 Mo) faisait crasher l'upload d'une
  // simple photo. Les images sont compressées côté client (cf. WholesaleProofForm)
  // mais on garde une marge serveur cohérente avec le hint UI "max 10 Mo".
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
