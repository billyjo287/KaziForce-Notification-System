import { Clock, CloudOff, Sunrise } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import '../../components/brand/strings';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { relativeTime } from '../../lib/relativeTime';
import { usePageTitle } from '../../lib/usePageTitle';
import type { Alert } from '../alerts/types';
import { useAlerts } from '../alerts/useAlerts';
import './strings';

const DAY_MS = 24 * 60 * 60 * 1000;
type Group = 'today' | 'yesterday' | 'earlier';

function groupOf(date: Date, now: Date): Group {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  if (date >= midnight) return 'today';
  if (date.getTime() >= midnight.getTime() - DAY_MS) return 'yesterday';
  return 'earlier';
}

/**
 * Daily summary on screen (design refresh): the "When you're free" alerts of the last 7 days,
 * grouped by day, the same things the 08:00 summary email lists. Reads the alerts the app
 * already has; opening one goes to it on the Alerts page.
 */
export default function DailySummaryPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('dailySummary.title'));
  const { status, alerts, refetch } = useAlerts();

  const heading = (
    <div>
      <h1 className="flex items-center gap-3 text-4xl font-extrabold">
        <Sunrise aria-hidden="true" className="size-9 shrink-0 text-kf-primary-text" />
        {t('dailySummary.title')}
      </h1>
      <p className="mt-2 max-w-3xl text-lg text-ink-muted">{t('dailySummary.intro')}</p>
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <CardListSkeleton count={3} />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <EmptyState
          role="alert"
          icon={CloudOff}
          title={t('alerts.error.title')}
          body={t('alerts.error.body')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          }
        />
      </div>
    );
  }

  const now = new Date();
  const recent = alerts
    .filter(
      (a) =>
        a.priority === 'low' &&
        !a.markedNotImportant &&
        now.getTime() - a.createdAt.getTime() <= 7 * DAY_MS,
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const groups = (['today', 'yesterday', 'earlier'] as Group[])
    .map((group) => ({ group, items: recent.filter((a) => groupOf(a.createdAt, now) === group) }))
    .filter(({ items }) => items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {heading}
      {groups.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t('brand.empty.low.title')}
          body={t('brand.empty.low.body')}
        />
      ) : (
        groups.map(({ group, items }) => (
          <section key={group} aria-labelledby={`summary-${group}`} className="flex flex-col gap-3">
            <h2 id={`summary-${group}`} className="text-2xl font-bold">
              {t(`dailySummary.${group}`)}
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {items.map((alert, index) => (
                <li
                  key={alert.id}
                  className="kf-rise"
                  style={{ animationDelay: `${Math.min(index, 7) * 70}ms` }}
                >
                  <SummaryItem alert={alert} language={i18n.language} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function SummaryItem({ alert, language }: { alert: Alert; language: string }) {
  const { t } = useTranslation();
  return (
    <article className="kf-lift relative flex h-full flex-col gap-2 rounded-kf-lg border border-line bg-surface p-5">
      <p className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone="later" icon={Clock}>
          {t('priority.low')}
        </Badge>
        <span className="text-kf-faint">{relativeTime(alert.createdAt, language)}</span>
      </p>
      <h3 className="text-lg font-bold">
        {/* The whole card opens the alert, through this link's stretched area. */}
        <Link
          to={`/worker/alerts?open=${alert.id}`}
          className="underline-offset-4 after:absolute after:inset-0 after:rounded-kf-lg hover:underline"
        >
          {alert.title}
        </Link>
      </h3>
      <p className="text-ink-muted">{alert.body}</p>
      {!alert.readAt && <span className="sr-only">{t('alerts.new')}</span>}
    </article>
  );
}
