import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

const STEPS = ['s1', 's2', 's3'] as const
const STEP_NUMS: Record<string, string> = { s1: '01', s2: '02', s3: '03' }

const COUNTRIES = [
  { flag: '🇲🇦', name: 'maroc', tag: 'marocTag' },
  { flag: '🇨🇳', name: 'chine', tag: 'chineTag' },
  { flag: '🇹🇷', name: 'turquie', tag: 'turquieTag' },
  { flag: '🇪🇬', name: 'egypte', tag: 'egypteTag' },
  { flag: '🇦🇪', name: 'emirats', tag: 'emiratsTag' },
] as const

const TRUST = [
  { icon: '🔒', key: 'trust1' },
  { icon: '🚢', key: 'trust2' },
  { icon: '✓', key: 'trust3' },
] as const

export default async function HomePage() {
  const t = await getTranslations('home')
  const tc = await getTranslations('common')

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
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link
                href="/login"
                className="text-sm font-medium text-gold-400 hover:text-gold-300 transition-colors"
              >
                {tc('login')}
              </Link>
            </div>
          </div>
        </header>

        {/* Contenu central — hero épuré */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mx-auto mb-6 h-0.5 w-16 rounded-full bg-gold-400" aria-hidden />

          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
            Abdou Baba
          </h1>

          <p className="mt-5 text-lg font-semibold text-gold-400 drop-shadow-md sm:text-2xl">
            {t('hero.slogan')}
          </p>
          <p className="mt-1.5 text-base text-foreground drop-shadow sm:text-lg">
            {t('hero.subtitle')}
          </p>

          {/* Boutons or */}
          <div className="mt-9 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup?type=affiliate"
              className="rounded-xl bg-primary px-6 py-3.5 text-center font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
            >
              {t('hero.ctaAffiliate')}
            </Link>
            <Link
              href="/signup?type=wholesale"
              className="rounded-xl border border-gold-400 px-6 py-3.5 text-center font-semibold text-gold-300 transition-colors hover:bg-gold-500/10"
            >
              {t('hero.ctaWholesale')}
            </Link>
            <Link
              href="/signup?type=supplier"
              className="rounded-xl border border-gold-400 px-6 py-3.5 text-center font-semibold text-gold-300 transition-colors hover:bg-gold-500/10"
            >
              {t('hero.ctaSupplier')}
            </Link>
          </div>

          <p className="mt-6 text-xs font-medium text-muted">{t('hero.note')}</p>
        </div>
      </section>

      {/* ════════ Comment ça marche ════════ */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-500">
            {t('steps.eyebrow')}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            {t('steps.heading')}
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s}
              className="rounded-2xl border border-line bg-surface p-6 shadow-premium"
            >
              <span className="text-2xl font-extrabold text-gold-500 tabular-nums">
                {STEP_NUMS[s]}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{t(`steps.${s}Title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t(`steps.${s}Text`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════ Nos pays ════════ */}
      <section className="border-t border-line bg-surface-2/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-500">
              {t('countries.eyebrow')}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              {t('countries.heading')}
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">{t('countries.intro')}</p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {COUNTRIES.map((c) => (
              <div
                key={c.name}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 py-7 text-center transition-colors hover:border-gold-400/60"
              >
                <span className="text-5xl leading-none">{c.flag}</span>
                <p className="mt-2 text-base font-bold text-foreground">{t(`countries.${c.name}`)}</p>
                <p className="text-xs leading-snug text-muted">{t(`countries.${c.tag}`)}</p>
              </div>
            ))}
          </div>

          {/* Bandeau confiance */}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {TRUST.map((tr) => (
              <span
                key={tr.key}
                className="inline-flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300"
              >
                <span aria-hidden>{tr.icon}</span>
                {t(`countries.${tr.key}`)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ Appel à l'action ════════ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-20">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">{t('finalCta.heading')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">{t('finalCta.text')}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-primary px-7 py-3.5 font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
            >
              {tc('createAccount')}
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-line px-7 py-3.5 font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              {tc('login')}
            </Link>
          </div>
        </div>
      </section>

      {/* ════════ Footer ════════ */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:flex-row sm:items-center">
          <div>
            <MozounaLogo size="md" />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">{t('footer.about')}</p>
          </div>
          <div className="flex flex-col items-start gap-2 text-sm sm:items-end">
            <a
              href={`https://wa.me/${whatsappPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-medium text-gold-400 transition-colors hover:text-gold-300"
            >
              🟢 {t('footer.whatsapp')}
            </a>
            <Link href="/login" className="text-muted transition-colors hover:text-foreground">
              {t('footer.clientSpace')}
            </Link>
            <span className="text-xs text-faint">{t('footer.location')}</span>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-faint">
            {t('footer.rights')}
          </p>
        </div>
      </footer>
    </main>
  )
}
