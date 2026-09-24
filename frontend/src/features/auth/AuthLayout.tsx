import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LanguageToggle } from '../../components/LanguageToggle';
import { Logo } from '../../components/Logo';
import { Toaster } from '../../components/ui/Toaster';

/** Simple frame for log-in, sign-up and onboarding: logo, language switch, one narrow column. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh px-4 py-5 sm:py-8">
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="kf-logo-link rounded-lg">
            <Logo />
          </Link>
          <LanguageToggle />
        </header>
        <main id="main" tabIndex={-1} className="flex flex-col gap-6 outline-none">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
