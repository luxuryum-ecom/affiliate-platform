import Link from 'next/link'
import Image from 'next/image'
import { MozounaLogo } from '@/components/shared/branding'

const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

const STEPS = [
  {
    n: '01',
    title: 'Créez votre compte',
    text: "Choisissez votre profil — affilié, acheteur en gros ou fournisseur — et inscrivez-vous gratuitement en quelques minutes.",
  },
  {
    n: '02',
    title: 'Sourcez ou vendez',
    text: "Accédez au catalogue B2B et au stock local, partagez vos liens d'affiliation, ou référencez vos produits sur la marketplace.",
  },
  {
    n: '03',
    title: 'Encaissez en sécurité',
    text: 'Paiement à la livraison (COD) au Maroc, commissions suivies, transport et douane gérés par la plateforme.',
  },
] as const

const COUNTRIES = [
  { flag: '🇲🇦', name: 'Maroc', tag: 'Stock local · COD' },
  { flag: '🇨🇳', name: 'Chine', tag: 'Prix usine · gros volume' },
  { flag: '🇹🇷', name: 'Turquie', tag: 'Textile & prêt-à-porter' },
  { flag: '🇪🇬', name: 'Égypte', tag: 'Coton & textile' },
  { flag: '🇦🇪', name: 'Émirats', tag: 'Hub logistique' },
] as const

const TRUST = [
  { icon: '🔒', label: 'Paiement sécurisé plateforme' },
  { icon: '🚢', label: 'Transport & douane inclus' },
  { icon: '✓', label: 'Fournisseurs vérifiés' },
] as const

export default function HomePage() {
  return (
    <main className="theme-dark bg-bg text-foreground">
      {/* ════════ HERO plein écran ════════ */}
      <section className="relative flex min-h-screen flex-col">
        {/* Visuel de marque en fond — cadré centre-droite pour cibler les véhicules
            dorés et repousser hors-champ le texte incrusté de la photo */}
        <Image
          src="/brand/hero-bg.jpg"
          alt=""
          fill
          priority
          quality={80}
          sizes="100vw"
          className="object-cover object-[78%_center]"
        />
        {/* Dégradé horizontal noir gauche→droite : noie le texte incrusté résiduel,
            garde les véhicules visibles à droite */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/55 to-black/30" />
        {/* Dégradé vertical : lisibilité du header (haut) et des boutons (bas) */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/85" />

        {/* Barre du haut */}
        <header className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <MozounaLogo size="md" />
            <Link
              href="/login"
              className="text-sm font-medium text-gold-400 hover:text-gold-300 transition-colors"
            >
              Se connecter
            </Link>
          </div>
        </header>

        {/* Contenu central — hero épuré */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mx-auto mb-6 h-0.5 w-16 rounded-full bg-gold-400" aria-hidden />

          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
            Mozouna Group
          </h1>

          <p className="mt-5 text-lg font-semibold text-gold-400 drop-shadow-md sm:text-2xl">
            Your Gateway to Global Trade
          </p>
          <p className="mt-1.5 text-base text-gray-100 drop-shadow sm:text-lg">
            Votre passerelle vers le commerce mondial
          </p>

          {/* Boutons or */}
          <div className="mt-9 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup?type=affiliate"
              className="rounded-xl bg-primary px-6 py-3.5 text-center font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
            >
              Je fais de l&apos;affiliation
            </Link>
            <Link
              href="/signup?type=wholesale"
              className="rounded-xl border border-gold-400 px-6 py-3.5 text-center font-semibold text-gold-300 transition-colors hover:bg-gold-500/10"
            >
              J&apos;achète en gros
            </Link>
            <Link
              href="/signup?type=supplier"
              className="rounded-xl border border-gold-400 px-6 py-3.5 text-center font-semibold text-gold-300 transition-colors hover:bg-gold-500/10"
            >
              Je vends mes produits
            </Link>
          </div>

          <p className="mt-6 text-xs font-medium text-gray-300">
            COD · Sourcing · Maroc 🇲🇦 — partout au Maroc, paiement à la livraison
          </p>
        </div>
      </section>

      {/* ════════ Comment ça marche ════════ */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-500">
            Comment ça marche
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            Démarrez en 3 étapes simples
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-line bg-surface p-6 shadow-premium"
            >
              <span className="text-2xl font-extrabold text-gold-500 tabular-nums">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════ Nos pays ════════ */}
      <section className="border-t border-line bg-surface-2/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-500">
              Nos pays
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              Présents sur 5 marchés clés
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">
              Du stock local marocain aux grands hubs d&apos;importation — transport et douane
              gérés par la plateforme.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {COUNTRIES.map((c) => (
              <div
                key={c.name}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 py-7 text-center transition-colors hover:border-gold-400/60"
              >
                <span className="text-5xl leading-none">{c.flag}</span>
                <p className="mt-2 text-base font-bold text-foreground">{c.name}</p>
                <p className="text-xs leading-snug text-muted">{c.tag}</p>
              </div>
            ))}
          </div>

          {/* Bandeau confiance */}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {TRUST.map((t) => (
              <span
                key={t.label}
                className="inline-flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300"
              >
                <span aria-hidden>{t.icon}</span>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ Appel à l'action ════════ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-20">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
            Prêt à développer votre activité ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            Rejoignez Mozouna Group et accédez dès aujourd&apos;hui à l&apos;affiliation COD, au
            catalogue grossiste et au sourcing international.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-primary px-7 py-3.5 font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
            >
              Créer mon compte
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-line px-7 py-3.5 font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* ════════ Footer ════════ */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:flex-row sm:items-center">
          <div>
            <MozounaLogo size="md" />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">
              Plateforme B2B — affiliation COD, achat en gros et sourcing international.
              Livraison partout au Maroc, paiement sécurisé.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-sm sm:items-end">
            <a
              href={`https://wa.me/${whatsappPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-medium text-gold-400 transition-colors hover:text-gold-300"
            >
              🟢 Contact WhatsApp
            </a>
            <Link href="/login" className="text-muted transition-colors hover:text-foreground">
              Espace client
            </Link>
            <span className="text-xs text-faint">🇲🇦 Maroc · COD &amp; Sourcing</span>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-faint">
            © 2026 Mozouna Group — Tous droits réservés.
          </p>
        </div>
      </footer>
    </main>
  )
}
