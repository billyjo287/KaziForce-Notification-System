import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonClasses } from '../components/ui/buttonStyles';
import { EmptyState } from '../components/ui/EmptyState';
import { LoaderHead, Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/usePageTitle';

/** The "0" of "404": a smiling mint dot with a ping ring (decoration). */
function SmileZero() {
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true" className="size-[0.9em]">
      <circle
        className="kf-ring"
        cx="30"
        cy="30"
        r="9"
        fill="none"
        stroke="var(--kf-accent)"
        strokeWidth="2"
      />
      <circle cx="30" cy="30" r="17" fill="var(--kf-accent)" />
      <circle cx="24.5" cy="27" r="2.2" fill="var(--kf-on-accent)" />
      <circle cx="35.5" cy="27" r="2.2" fill="var(--kf-on-accent)" />
      <path
        d="M23 33q7 6.5 14 0"
        fill="none"
        stroke="var(--kf-on-accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Any address the app does not know: a big "4 ☺ 4" and one way home. */
export function NotFoundPage() {
  const { t } = useTranslation();
  usePageTitle(t('errors.notFoundTitle'));
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <p
        aria-hidden="true"
        className="kf-display flex items-center gap-2 text-8xl leading-none font-bold text-kf-primary-text"
      >
        4<SmileZero />4
      </p>
      <h1 className="mt-6 text-2xl font-bold">{t('errors.notFoundTitle')}</h1>
      <p className="mt-2 text-lg text-ink-muted">{t('errors.notFoundBody')}</p>
      <Link to="/" className={`${buttonClasses('primary')} mt-6`}>
        {t('errors.notFoundCta')}
      </Link>
    </main>
  );
}

/** Shown if a page crashes. Plain words and one clear way out; the warning tile shakes once. */
export function ErrorPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        role="alert"
        headingLevel="h1"
        icon={TriangleAlert}
        title={t('errors.genericTitle')}
        body={t('errors.genericBody')}
        action={
          <button
            type="button"
            className={buttonClasses('primary')}
            onClick={() => window.location.reload()}
          >
            {t('errors.reload')}
          </button>
        }
      />
    </main>
  );
}

/** Shown while the first page's code downloads or the log-in is being checked. */
export function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="mx-auto max-w-xl px-4 py-10">
      <span className="sr-only">{t('common.loading')}</span>
      <LoaderHead />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-6 h-24 w-full" />
      <Skeleton className="mt-3 h-24 w-full" />
    </div>
  );
}
