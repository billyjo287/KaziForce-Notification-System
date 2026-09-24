import { Briefcase, ChevronRight, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageToggle } from '../components/LanguageToggle';
import { Logo } from '../components/Logo';
import { usePageTitle } from '../lib/usePageTitle';

const SIDES: { key: 'worker' | 'business' | 'admin'; to: string; icon: LucideIcon }[] = [
  { key: 'worker', to: '/worker/alerts', icon: UserRound },
  { key: 'business', to: '/employer/alerts', icon: Briefcase },
  { key: 'admin', to: '/admin/overview', icon: ShieldCheck },
];

/** Stand-in for the log-in page until accounts exist (Phase 2). */
export default function LoginPreviewPage() {
  const { t } = useTranslation();
  usePageTitle(t('login.title'));

  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link to="/" className="rounded-lg">
            <Logo />
          </Link>
          <LanguageToggle />
        </header>
        <main className="flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold">{t('login.title')}</h1>
            <p className="mt-2 text-lg text-ink-muted">{t('login.notReady')}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {SIDES.map(({ key, to, icon: Icon }) => (
              <li key={key}>
                <Link
                  to={to}
                  className="flex min-h-20 items-center gap-4 rounded-xl border-2 border-line-strong bg-surface p-4 transition-colors duration-150 hover:border-primary hover:bg-primary-soft"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-lg font-bold">{t(`login.${key}`)}</span>
                    <span className="block text-ink-muted">{t(`login.${key}Help`)}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-6 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}
