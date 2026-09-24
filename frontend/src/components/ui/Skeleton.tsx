import { useTranslation } from 'react-i18next';

/** Grey placeholder shaped like the content that is loading (better than a spinner on 3G). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-line ${className}`} />;
}

/** Placeholder for a list of cards, with a screen-reader "Loading…" message. */
export function CardListSkeleton({ count = 3 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{t('common.loading')}</span>
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
