import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { prefersReducedMotion } from '../../stores/settings';

// The hopping logo and its lines are a separate small download (the app shell stays within its
// size budget, ADR 0014); the grey placeholders below show straight away.
const KaziLoader = lazy(() => import('../brand/KaziLoader'));

/** Grey placeholder shaped like the content that is loading (better than a spinner on 3G). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-line ${className}`} />;
}

/** The hopping logo above a loading page. Its space is kept, so nothing jumps when it arrives. */
export function LoaderHead() {
  const { i18n } = useTranslation();
  return (
    <div aria-hidden="true" className="mb-4 h-[8.75rem]">
      <Suspense fallback={null}>
        <KaziLoader language={i18n.language} still={prefersReducedMotion()} />
      </Suspense>
    </div>
  );
}

/**
 * Placeholder for a list of cards under the hopping logo, with a screen-reader "Loading…"
 * message. Pages show one at a time, so there is one hopping logo per screen.
 */
export function CardListSkeleton({ count = 3 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{t('common.loading')}</span>
      <LoaderHead />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="mt-3 h-6 w-3/4" />
          <Skeleton className="mt-2 h-5 w-full" />
          <Skeleton className="mt-1.5 h-5 w-2/3" />
        </div>
      ))}
    </div>
  );
}
