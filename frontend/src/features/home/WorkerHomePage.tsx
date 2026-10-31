import { ArrowRight, Bell, Clock, CloudOff, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useJobs } from '../../api/hooks';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { CardListSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAuth } from '../../stores/auth';
import type { Alert, Priority } from '../alerts/types';
import { useAlerts } from '../alerts/useAlerts';
import { JobCard } from '../jobs/JobCard';
import { UrgentBanner } from './UrgentBanner';
import './strings';

const LEVELS: { key: Priority; tone: BadgeTone; icon: LucideIcon }[] = [
  { key: 'urgent', tone: 'urgent', icon: TriangleAlert },
  { key: 'medium', tone: 'important', icon: Bell },
  { key: 'low', tone: 'later', icon: Clock },
];

const alertHref = (alert: Alert) => `/worker/alerts?open=${alert.id}`;

/**
 * The worker's first page (design refresh): a greeting, what needs them now (unread "Act now"
 * alerts, with a live countdown to the job's closing time), what is waiting, and jobs near them.
 * Only data the app already has: the alerts list, the jobs list and the worker's own place.
 */
export default function WorkerHomePage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.home'));
  const user = useAuth((s) => s.user);
  const { status, alerts } = useAlerts();
  const place = user?.location;
  const jobs = useJobs(place ? { locationId: place.id } : {});

  const shown = alerts.filter((a) => !a.markedNotImportant);
  const unread = shown.filter((a) => !a.readAt);
  const needsYou = unread.filter((a) => a.priority === 'urgent').slice(0, 2);
  const firstName = user?.name.split(' ')[0];
  const openJobs = (jobs.data?.items ?? []).filter((job) => job.status === 'open').slice(0, 3);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-4xl font-extrabold">
          {firstName
            ? t('workerHome.greeting', { name: firstName })
            : t('workerHome.greetingNoName')}
        </h1>
        {status === 'loading' ? (
          <Skeleton className="mt-3 h-6 w-72" />
        ) : (
          <p className="mt-2 text-xl text-ink-muted">
            {t('workerHome.waiting', { count: unread.length })}
          </p>
        )}
      </div>

      {needsYou.length > 0 && (
        <section aria-labelledby="needs-you" className="flex flex-col gap-3">
          <h2 id="needs-you" className="text-2xl font-bold">
            {t('workerHome.needsYou')}
          </h2>
          {needsYou.map((alert) => (
            <UrgentBanner key={alert.id} alert={alert} href={alertHref(alert)} />
          ))}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {/* What is waiting, by level: a dark card, one row per level. */}
        <section
          aria-labelledby="waiting"
          className="self-start rounded-kf-lg bg-kf-inverse p-6 text-kf-on-inverse"
          style={{ '--kf-focus': 'var(--kf-accent)' } as React.CSSProperties}
        >
          <h2 id="waiting" className="text-2xl font-bold">
            {t('workerHome.waitingTitle')}
          </h2>
          <ul className="mt-4 flex flex-col divide-y divide-kf-inverse-2">
            {LEVELS.map(({ key, tone, icon }) => {
              const count = unread.filter((a) => a.priority === key).length;
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex flex-wrap items-center gap-3">
                    <Badge tone={tone} icon={icon}>
                      {t(`priority.${key}`)}
                    </Badge>
                    <span className="text-lg text-kf-on-inverse-2">
                      {status === 'loading' ? '…' : t('workerHome.unread', { count })}
                    </span>
                  </span>
                  <Link
                    to="/worker/alerts"
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold text-kf-on-inverse underline-offset-4 hover:underline"
                  >
                    {t('workerHome.see')}
                    <span className="sr-only">: {t(`priority.${key}`)}</span>
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="jobs-near" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="jobs-near" className="text-2xl font-bold">
                {t('workerHome.jobsTitle')}
              </h2>
              <p className="text-ink-muted">
                {place ? t('workerHome.jobsIn', { place: place.name }) : t('workerHome.jobsAll')}
              </p>
            </div>
            <Link to="/worker/jobs" className={buttonClasses('ghost', 'md', 'px-2')}>
              {t('workerHome.seeAllJobs')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          {jobs.isPending ? (
            <CardListSkeleton count={2} />
          ) : jobs.isError ? (
            <p role="alert" className="flex items-start gap-2 text-ink-muted">
              <CloudOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {t('workerHome.jobsError')}
            </p>
          ) : openJobs.length === 0 ? (
            <p className="rounded-kf border border-line bg-surface p-5 text-ink-muted">
              {t('workerHome.noJobs')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {openJobs.map((job, index) => (
                <li key={job.id} className="kf-rise" style={{ animationDelay: `${index * 70}ms` }}>
                  <JobCard job={job} to={`/worker/jobs/${job.id}`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
