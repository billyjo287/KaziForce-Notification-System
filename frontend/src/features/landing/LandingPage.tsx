import {
  Bell,
  Check,
  Clock,
  ListOrdered,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
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
import { Hero } from './Hero';
import { useScrollReveal } from './useScrollReveal';
import { addPageStrings } from '../../i18n/addPageStrings';
import landingEn from '../../i18n/locales/landing.en.json';
import landingSw from '../../i18n/locales/landing.sw.json';

// The landing page's words arrive with it: logged-in pages never download them.
addPageStrings(landingEn, landingSw);

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

/** Public landing page: what KaziForce alerts do, in plain words. */
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

      {/* Phones: theme and language get their own slim row so the header fits 320px screens. */}
      <div className="flex flex-wrap justify-end gap-2 px-4 pt-3 sm:hidden">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 sm:flex">
            <ThemeToggle />
            <LanguageToggle />
          </span>
          <Link to="/login" className={buttonClasses('secondary', 'md', 'min-h-11 px-4')}>
            {t('landing.nav.login')}
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        {/* ---------- Hero ---------- */}
        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pt-6 pb-12 sm:px-8 md:grid-cols-2 md:pt-12 md:pb-20">
          <div>
            <h1 className="text-4xl leading-tight font-bold sm:text-5xl">
              {t('landing.hero.title')}
            </h1>
            <p className="mt-4 max-w-xl text-xl text-ink-muted">{t('landing.hero.body')}</p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link to="/login" className={buttonClasses('primary', 'lg')}>
                {t('landing.hero.cta')}
              </Link>
              <a href="#how" className={buttonClasses('ghost', 'lg')}>
                {t('landing.hero.secondary')}
              </a>
            </div>
          </div>
          <Hero />
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-4 bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <h2 id="how-title" data-reveal className="text-3xl font-bold">
              {t('landing.how.title')}
            </h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {STEPS.map(({ key, icon: Icon }, index) => (
                <li key={key} data-reveal className="rounded-xl border border-line bg-canvas p-6">
                  <span className="flex items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-kf-primary-text">
                      <Icon aria-hidden="true" className="size-6" />
                    </span>
                    <span className="text-lg font-bold text-ink-muted">{index + 1}</span>
                  </span>
                  <h3 className="mt-4 text-xl font-bold">{t(`landing.how.${key}Title`)}</h3>
                  <p className="mt-2 text-ink-muted">{t(`landing.how.${key}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Priority levels ---------- */}
        <section id="levels" aria-labelledby="levels-title" className="scroll-mt-4 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <h2 id="levels-title" data-reveal className="text-3xl font-bold">
              {t('landing.levels.title')}
            </h2>
            <p data-reveal className="mt-3 max-w-2xl text-lg text-ink-muted">
              {t('landing.levels.body')}
            </p>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {LEVELS.map(({ key, icon, tone }) => (
                <li key={key} data-reveal className="rounded-xl border border-line bg-surface p-6">
                  <Badge tone={tone} icon={icon}>
                    {t(`priority.${key}`)}
                  </Badge>
                  <p className="mt-3 text-lg">{t(`landing.levels.${key}`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- You are in control ---------- */}
        <section aria-labelledby="control-title" className="bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-8">
            <h2 id="control-title" data-reveal className="text-3xl font-bold">
              {t('landing.control.title')}
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {CONTROLS.map((key) => (
                <li key={key} data-reveal className="flex items-start gap-3 text-lg">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                    <Check aria-hidden="true" className="size-4" strokeWidth={3} />
                  </span>
                  {t(`landing.control.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Employers ---------- */}
        <section id="employers" aria-labelledby="employers-title" className="scroll-mt-4 py-16">
          <div
            data-reveal
            className="mx-auto max-w-6xl rounded-none border-y border-line bg-primary-soft px-4 py-10 sm:mx-8 sm:rounded-2xl sm:border sm:px-10 lg:mx-auto"
          >
            <h2 id="employers-title" className="text-3xl font-bold">
              {t('landing.employers.title')}
            </h2>
            <p className="mt-3 max-w-2xl text-lg">{t('landing.employers.body')}</p>
            <Link to="/login" className={buttonClasses('secondary', 'lg', 'mt-6')}>
              {t('landing.employers.cta')}
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
