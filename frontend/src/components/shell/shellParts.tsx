// Pieces shared by both app frames: the worker's top menu (WorkerShell.tsx) and the
// employer/admin sidebar (AppShell.tsx). Each side downloads only its own frame.
import { LazyMotion, MotionConfig } from 'motion/react';
import * as m from 'motion/react-m';
import { lazy, Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useAuth } from '../../stores/auth';
import { useSettings } from '../../stores/settings';
import { OfflineBanner } from '../ui/OfflineBanner';
import { LazyToaster } from '../ui/LazyToaster';

// Only needed right after logging in, so it is a separate small download.
const WelcomeBanner = lazy(() => import('./WelcomeBanner'));

const loadMotionFeatures = () => import('../../lib/motionFeatures').then((mod) => mod.default);

export function UnreadBubble({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="grid h-6 min-w-6 place-items-center rounded-full bg-urgent-bar px-1.5 text-sm font-bold text-on-urgent"
    >
      {count}
    </span>
  );
}

/**
 * Motion for the app ("user" = follow the device setting; "always" = the in-app Reduce motion
 * switch is on), the skip link, and the toasts and welcome message after the page.
 */
export function ShellFrame({ className, children }: { className: string; children: ReactNode }) {
  const { t } = useTranslation();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const justLoggedIn = useAuth((s) => s.justLoggedIn);
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        <div className={className}>
          <a
            href="#main"
            className="sr-only z-50 rounded-lg bg-surface px-4 py-3 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            {t('app.skipToContent')}
          </a>
          {children}
          <LazyToaster />
          {justLoggedIn && (
            <Suspense fallback={null}>
              <WelcomeBanner />
            </Suspense>
          )}
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

/** The page itself: the offline notice, then a short fade between pages (instant with reduced motion). */
export function PageContent({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <>
      <OfflineBanner />
      <m.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {children}
      </m.div>
    </>
  );
}
