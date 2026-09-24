import {
  Bell,
  Check,
  Clock,
  ListOrdered,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageToggle } from '../../components/LanguageToggle';
import { Logo } from '../../components/Logo';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { usePageTitle } from '../../lib/usePageTitle';
import { Hero } from './Hero';
import { useScrollReveal } from './useScrollReveal';

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

      {/* Phones: the language switch gets its own slim row so the header fits 320px screens. */}
      <div className="flex justify-end px-4 pt-3 sm:hidden">
        <LanguageToggle />
      </div>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="hidden sm:block">
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
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
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
        <section aria-labelledby="levels-title" className="py-16">
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
        <section aria-labelledby="employers-title" className="py-16">
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

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-ink-muted sm:px-8">
          <p>{t('landing.footer.privacy')}</p>
          <p>{t('landing.footer.project')}</p>
        </div>
      </footer>
    </div>
  );
}
