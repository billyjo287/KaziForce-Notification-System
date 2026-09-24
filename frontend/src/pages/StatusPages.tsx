import { SearchX, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonClasses } from '../components/ui/buttonStyles';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/usePageTitle';

export function NotFoundPage() {
  const { t } = useTranslation();
  usePageTitle(t('errors.notFoundTitle'));
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        headingLevel="h1"
        icon={SearchX}
        title={t('errors.notFoundTitle')}
        body={t('errors.notFoundBody')}
        action={
          <Link to="/" className={buttonClasses('primary')}>
            {t('common.backHome')}
          </Link>
        }
      />
    </main>
  );
}

/** Shown if a page crashes. Plain words and one clear way out. */
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

/** Shown for a moment while the first page's code downloads. */
export function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="mx-auto max-w-xl px-4 py-10">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-6 h-24 w-full" />
      <Skeleton className="mt-3 h-24 w-full" />
    </div>
  );
}
