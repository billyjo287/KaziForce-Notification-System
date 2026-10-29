import { BellRing, LockKeyhole, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageToggle } from '../../components/LanguageToggle';
import { Logo } from '../../components/Logo';
import { ThemeSelect } from '../../components/ThemeSelect';
import { Toaster } from '../../components/ui/Toaster';
import './strings';

/**
 * Frame for log-in, sign-up and onboarding: one narrow column with the logo, theme and language.
 * On large screens a green panel beside it says what KaziForce does (on phones it would only
 * push the form down, so phones get one reassuring line under the form instead).
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const points = [
    { icon: BellRing, text: t('auth.side.points.fast') },
    { icon: ShieldCheck, text: t('auth.side.points.safe') },
    { icon: SlidersHorizontal, text: t('auth.side.points.control') },
  ];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-on-primary lg:flex lg:flex-col lg:justify-center">
        {/* Soft rings, like the clock in the logo (decoration only). */}
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 size-96 rounded-full border-[3rem] border-current opacity-10"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-16 size-80 rounded-full border-[2rem] border-current opacity-10"
        />
        <div className="relative mx-auto flex max-w-md flex-col gap-8">
          <div>
            <p className="text-4xl leading-tight font-bold">{t('auth.side.title')}</p>
            <p className="mt-4 text-xl">{t('auth.side.body')}</p>
          </div>
          <ul className="flex flex-col gap-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-lg">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-on-primary/15">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 border-t border-current/30 pt-6">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t('auth.side.secure')}
          </p>
        </div>
      </aside>

      <div className="px-4 py-5 sm:py-8 lg:px-10 lg:py-12">
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/" className="kf-logo-link rounded-lg">
              <Logo />
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeSelect />
              <LanguageToggle />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="flex flex-col gap-6 outline-none lg:pt-8">
            {children}
          </main>
          <p className="flex items-start gap-2 text-ink-muted lg:hidden">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t('auth.side.secure')}
          </p>
        </div>
      </div>
      <Toaster />
    </div>
  );
}

/**
 * The top of each step: "Step 2 of 4" with a bar, the question as the page heading, and one line
 * of explanation. The heading takes the focus when the step changes, so screen readers announce
 * the new question (and keyboard users start from the top). Not on the first step: there the
 * person may already be typing (also in the ready-made copy of the page).
 */
export function StepHeading({
  step,
  total,
  title,
  intro,
  focusOnShow = false,
}: {
  step?: number;
  total?: number;
  title: string;
  intro?: ReactNode;
  focusOnShow?: boolean;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnShow) heading.current?.focus();
  }, [title, focusOnShow]);
  return (
    <div className="kf-enter">
      {step && total && (
        <div className="mb-3">
          <p className="font-bold text-ink-muted">{t('auth.step', { step, total })}</p>
          <div aria-hidden="true" className="mt-2 flex gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-line'}`}
              />
            ))}
          </div>
        </div>
      )}
      <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">
        {title}
      </h1>
      {intro && <p className="mt-2 text-lg text-ink-muted">{intro}</p>}
    </div>
  );
}
