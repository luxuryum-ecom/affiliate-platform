/**
 * Layout du portail livreur cloisonné `/courier/*` (module Livreurs, Lot B).
 *
 * PAS de garde `profiles` ici : le livreur n'a jamais de compte Supabase.
 * L'accès est borné par le `?code=` résolu PAGE PAR PAGE via
 * `resolveCourierSession` (server action, rate-limitée + TTL, mig 127) — pas
 * de session à vérifier au niveau layout. Ce fichier ne fait qu'imposer le
 * shell mobile sobre : PAS de header admin (ni MozounaLogo admin, ni
 * NotificationBell). Le provider i18n (NextIntlClientProvider) vient déjà du
 * root layout — rien à réinjecter ici.
 */
export default function CourierLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg text-foreground">{children}</div>
}
