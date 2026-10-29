import {
  Accessibility,
  Ban,
  Bell,
  Check,
  Clock,
  Languages,
  ListOrdered,
  LockKeyhole,
  Mail,
  MessageCircle,
  MessageSquareText,
  MoonStar,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageToggle } from '../../components/LanguageToggle';
import { ThemeToggle } from '../../components/brand/ThemeToggle';
import { Logo } from '../../components/Logo';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { usePageTitle } from '../../lib/usePageTitle';
import { AlertSortHero } from './AlertSortHero';
import { useScrollReveal } from './useScrollReveal';
import { addPageStrings } from '../../i18n/addPageStrings';
import landingEn from '../../i18n/locales/landing.en.json';
import landingSw from '../../i18n/locales/landing.sw.json';

// The landing page's words arrive with it: logged-in pages never download them.
addPageStrings(landingEn, landingSw);

const NAV_LINKS = [
  { key: 'how', href: '#how' },
  { key: 'alerts', href: '#levels' },
  { key: 'workers', href: '#workers' },
  { key: 'employers', href: '#employers' },
] as const;

const TICKS = ['phone', 'language', 'sms'] as const;

const CHANNELS: { key: 'inApp' | 'sms' | 'whatsapp' | 'email'; icon: LucideIcon }[] = [
  { key: 'inApp', icon: Bell },
  { key: 'sms', icon: MessageSquareText },
  { key: 'whatsapp', icon: MessageCircle },
  { key: 'email', icon: Mail },
];

const STEPS: { key: 'check' | 'sort' | 'send'; icon: LucideIcon }[] = [
  { key: 'check', icon: ShieldCheck },
  { key: 'sort', icon: ListOrdered },
  { key: 'send', icon: Smartphone },
];

const LEVELS: { key: 'urgent' | 'medium' | 'low'; icon: LucideIcon; tone: BadgeTone }[] = [
  { key: 'urgent', icon: TriangleAlert, tone: 'urgent' },
  { key: 'medium', icon: Bell, tone: 'important' },
  { key: 'low', icon: Clock, tone: 'later' },
];

const CONTROLS = ['channels', 'quiet', 'notImportant', 'language'] as const;

const EVERYONE: { key: 'text' | 'language' | 'slow' | 'calm'; icon: LucideIcon }[] = [
  { key: 'text', icon: Accessibility },
  { key: 'language', icon: Languages },
  { key: 'slow', icon: Wifi },
  { key: 'calm', icon: MoonStar },
];

/** Footer links: only to sections of this page and pages that exist. */
const FOOTER_COLUMNS = [
  {
    key: 'product',
    links: [
      { key: 'how', to: '#how' },
      { key: 'levels', to: '#levels' },
      { key: 'employers', to: '#employers' },
    ],
  },
  {
    key: 'account',
    links: [
      { key: 'login', to: '/login' },
      { key: 'register', to: '/register' },
      { key: 'forgot', to: '/forgot-password' },
    ],
  },
] as const;

const FOOTER_LINK =
  'inline-flex min-h-11 items-center rounded-md text-kf-on-inverse-2 underline-offset-4 hover:text-kf-on-inverse hover:underline';

/** The mint "I'm hiring" button: dark text on mint in both themes. */
const MINT_BUTTON =
  'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-kf-accent px-7 text-lg font-bold text-kf-on-accent transition-opacity duration-150 hover:opacity-90';

/**
 * Public landing page (design refresh, handover section 6): what KaziForce alerts do, in plain
 * words. Sections below the hero fade up as they scroll into view (useScrollReveal, which never
 * hides what is already on screen).
 */
export default function LandingPage() {
  const { t } = useTranslation();
  usePageTitle(t('landing.title'));
  const page = useRef<HTMLDivElement>(null);
  useScrollReveal(page);

  return (
    <div ref={page} className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-3 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('app.skipToContent')}
      </a>

      {/* ---------- Top bar: logo, sections (larger screens), theme, language, log in ---------- */}
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8 xl:flex-nowrap">
        <Link to="/" className="rounded-lg">
          <Logo />
        </Link>
        <nav aria-label={t('landing.nav.label')} className="hidden xl:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.key}>
                <a
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-lg px-2.5 font-bold whitespace-nowrap text-ink-muted hover:bg-kf-surface-2 hover:text-ink"
                >
                  {t(`landing.nav.${link.key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          <ThemeToggle />
          <LanguageToggle />
          <Link
            to="/login"
            className={buttonClasses('secondary', 'md', 'min-h-11 px-4 whitespace-nowrap')}
          >
            {t('landing.nav.login')}
          </Link>
          <Link
            to="/register"
            className={buttonClasses(
              'primary',
              'md',
              'hidden min-h-11 px-4 whitespace-nowrap sm:inline-flex',
            )}
          >
            {t('landing.nav.register')}
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        {/* ---------- Hero ---------- */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-6 pb-14 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pt-12 md:pb-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 font-bold text-ink-muted">
              <span aria-hidden="true" className="kf-live size-2.5 rounded-full bg-kf-accent" />
              {t('landing.hero.pill')}
            </p>
            <h1 className="mt-5 text-5xl leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-6xl">
              <span className="block">{t('landing.hero.line1')}</span>{' '}
              <span className="block">{t('landing.hero.line2')}</span>{' '}
              <span className="block">
                {t('landing.hero.line3')}{' '}
                <span className="relative inline-block">
                  {t('landing.hero.highlight')}
                  {/* A hand-drawn mint underline that draws itself in. */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 300 20"
                    preserveAspectRatio="none"
                    className="absolute -bottom-2 left-0 h-3 w-full"
                  >
                    <path
                      className="kf-underline"
                      d="M4 14 C 70 4, 150 4, 296 11"
                      fill="none"
                      stroke="var(--kf-accent)"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-xl text-ink-muted">{t('landing.hero.body')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/register" className={buttonClasses('primary', 'lg', 'kf-press')}>
                {t('landing.hero.worker')}
              </Link>
              <Link to="/register" className={`${MINT_BUTTON} kf-press`}>
                {t('landing.hero.business')}
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-ink-muted">
              {TICKS.map((key) => (
                <li key={key} className="flex items-center gap-1.5 font-bold">
                  <Check
                    aria-hidden="true"
                    className="size-5 text-kf-success-solid"
                    strokeWidth={3}
                  />
                  {t(`landing.hero.ticks.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <AlertSortHero />
        </section>

        {/* ---------- Channels ---------- */}
        <section aria-labelledby="channels-title" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-8 md:flex-row md:items-center md:justify-between">
            <h2 id="channels-title" className="text-xl font-bold">
              {t('landing.channels.title')}
            </h2>
            <ul className="flex flex-wrap gap-3">
              {CHANNELS.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-kf-surface-2 px-4 font-bold"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5 text-kf-primary-text transition-transform duration-200 group-hover:-translate-y-0.5"
                  />
                  {t(`landing.channels.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-4 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <h2 id="how-title" data-reveal className="text-4xl font-extrabold">
              {t('landing.how.title')}
            </h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map(({ key, icon: Icon }, index) => (
                <li
                  key={key}
                  data-reveal
                  className="kf-lift group rounded-kf-lg border border-line bg-surface p-6"
                >
                  <span className="flex items-center gap-3">
                    <span className="kf-display grid size-12 shrink-0 place-items-center rounded-kf bg-primary text-xl font-extrabold text-on-primary transition-transform duration-200 group-hover:-rotate-6">
                      {index + 1}
                    </span>
                    <Icon aria-hidden="true" className="size-6 text-kf-primary-text" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold">{t(`landing.how.${key}Title`)}</h3>
                  <p className="mt-2 text-ink-muted">{t(`landing.how.${key}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Smart alerts (dark section) ---------- */}
        <section
          id="levels"
          aria-labelledby="levels-title"
          className="scroll-mt-4 bg-kf-inverse py-16 text-kf-on-inverse md:py-20"
          // A mint focus ring: the usual indigo ring would not show on the dark band.
          style={{ '--kf-focus': 'var(--kf-accent)' } as React.CSSProperties}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <h2 id="levels-title" data-reveal className="text-4xl font-extrabold">
              {t('landing.levels.title')}
            </h2>
            <p data-reveal className="mt-3 max-w-2xl text-lg text-kf-on-inverse-2">
              {t('landing.levels.body')}
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {LEVELS.map(({ key, icon, tone }) => (
                <li key={key} data-reveal className="rounded-kf-lg bg-kf-surface p-6 text-kf-text">
                  <Badge tone={tone} icon={icon}>
                    {t(`priority.${key}`)}
                  </Badge>
                  <p className="mt-4 text-lg">{t(`landing.levels.${key}`)}</p>
                </li>
              ))}
              <li data-reveal className="rounded-kf-lg bg-kf-surface p-6 text-kf-text">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-kf-spam-bg px-2.5 py-0.5 font-bold text-kf-spam-fg">
                  <Ban aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  {t('priority.spam')}
                </span>
                <p className="mt-4 text-lg">{t('landing.levels.spam')}</p>
              </li>
            </ul>
          </div>
        </section>

        {/* ---------- For workers / for employers ---------- */}
        <section className="py-16 md:py-20">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-8 lg:grid-cols-2">
            <div
              id="workers"
              data-reveal
              className="scroll-mt-4 rounded-kf-xl bg-kf-primary-soft p-8 text-kf-on-primary-soft sm:p-10"
            >
              <h2 className="text-3xl font-extrabold">{t('landing.workers.title')}</h2>
              <p className="mt-3 text-lg">{t('landing.workers.body')}</p>
              <ul className="mt-6 flex flex-col gap-3">
                {CONTROLS.map((key) => (
                  <li key={key} className="flex items-start gap-3 text-lg">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                      <Check aria-hidden="true" className="size-4" strokeWidth={3} />
                    </span>
                    {t(`landing.control.${key}`)}
                  </li>
                ))}
              </ul>
              <Link to="/register" className={buttonClasses('primary', 'lg', 'kf-press mt-8')}>
                {t('landing.workers.cta')}
              </Link>
            </div>
            <div
              id="employers"
              data-reveal
              className="scroll-mt-4 rounded-kf-xl bg-kf-medium-bg p-8 text-kf-medium-fg sm:p-10"
            >
              <h2 className="text-3xl font-extrabold">{t('landing.employers.title')}</h2>
              <p className="mt-3 text-lg">{t('landing.employers.body')}</p>
              <Link to="/login" className={`${MINT_BUTTON} kf-press mt-8`}>
                {t('landing.employers.cta')}
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- Built for everyone ---------- */}
        <section aria-labelledby="everyone-title" className="bg-surface py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <h2 id="everyone-title" data-reveal className="text-4xl font-extrabold">
              {t('landing.everyone.title')}
            </h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {EVERYONE.map(({ key, icon: Icon }) => (
                <li key={key} data-reveal className="flex flex-col gap-3">
                  <span className="grid size-12 place-items-center rounded-kf bg-kf-primary-soft text-kf-primary-text">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <p className="text-lg">{t(`landing.everyone.${key}`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Call to action (indigo band) ---------- */}
        <section aria-labelledby="cta-title" className="bg-primary text-on-primary">
          <div
            data-reveal
            className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-8 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <h2 id="cta-title" className="text-3xl font-extrabold sm:text-4xl">
                {t('landing.cta.title')}
              </h2>
              <p className="mt-2 text-lg opacity-90">{t('landing.cta.sub')}</p>
            </div>
            <Link to="/register" className={`${MINT_BUTTON} kf-press shrink-0`}>
              {t('landing.cta.button')}
            </Link>
          </div>
        </section>
      </main>

      {/* ---------- Footer: always dark (Night Ink), with the white-letter logo ---------- */}
      <footer
        className="bg-kf-inverse text-kf-on-inverse"
        // A mint focus ring: the usual indigo ring would not show on the dark band.
        style={{ '--kf-focus': 'var(--kf-accent)' } as React.CSSProperties}
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-[2fr_1fr_1fr] md:py-16">
          <div className="flex flex-col gap-4">
            <Link to="/" className="self-start rounded-lg">
              <img
                src="/brand/kaziforce-logo-dark.svg"
                alt={t('app.name')}
                width={463}
                height={100}
                className="h-9 w-auto"
              />
            </Link>
            <p className="max-w-sm text-lg text-kf-on-inverse-2">{t('landing.footer.tagline')}</p>
            <p className="flex max-w-sm items-start gap-2 text-kf-on-inverse-2">
              <LockKeyhole aria-hidden="true" className="mt-1 size-4 shrink-0" />
              {t('landing.footer.privacy')}
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.key} aria-labelledby={`footer-${column.key}`}>
              <h2
                id={`footer-${column.key}`}
                className="text-sm font-bold tracking-wider text-kf-on-inverse uppercase"
              >
                {t(`landing.footer.columns.${column.key}`)}
              </h2>
              <ul className="mt-4 flex flex-col gap-1">
                {column.links.map((link) => (
                  <li key={link.key}>
                    {link.to.startsWith('#') ? (
                      <a href={link.to} className={FOOTER_LINK}>
                        {t(`landing.footer.links.${link.key}`)}
                      </a>
                    ) : (
                      <Link to={link.to} className={FOOTER_LINK}>
                        {t(`landing.footer.links.${link.key}`)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-kf-inverse-2">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-kf-on-inverse-2 sm:px-8 md:flex-row md:items-center md:justify-between">
            <p>{t('landing.footer.copyright', { year: new Date().getFullYear() })}</p>
            <p>{t('landing.footer.project')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
