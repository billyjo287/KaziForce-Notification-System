import {
  ArrowRight,
  Briefcase,
  CircleCheck,
  CloudOff,
  Plus,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useEmployerJobs } from '../../api/hooks';
import { useCountUp } from '../../components/brand/hooks';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardListSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { relativeTime } from '../../lib/relativeTime';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAuth } from '../../stores/auth';
import type { Job } from '../../types/api';
import { useAlerts } from '../alerts/useAlerts';
import '../employer/strings';
import { UrgentBanner } from './UrgentBanner';
import './strings';

type JobState = 'urgent' | 'open' | 'held' | 'closed' | 'removed';

/** The word and colour of a job's state in the "Your jobs" table (always icon + word). */
const STATE: Record<JobState, { tone: BadgeTone; icon: LucideIcon }> = {
  urgent: { tone: 'urgent', icon: TriangleAlert },
  open: { tone: 'success', icon: Briefcase },
  held: { tone: 'important', icon: ShieldCheck },
  closed: { tone: 'later', icon: CircleCheck },
  removed: { tone: 'neutral', icon: CloudOff },
};

const stateOf = (job: Job): JobState =>
  job.status === 'open' && job.urgent ? 'urgent' : job.status;

/**
 * The employer's first page (design refresh): a greeting, unread "Act now" alerts, four counts
 * that count up, their latest jobs as a table, and the jobs with new applicants. Only data the
 * app already has: the employer's jobs list (with applicant counts) and their alerts.
 */
export default function EmployerHomePage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.home'));
  const user = useAuth((s) => s.user);
  const { alerts } = useAlerts();
  const { data: jobs, isPending, isError, refetch } = useEmployerJobs();

  const needsYou = alerts
    .filter((a) => !a.readAt && !a.markedNotImportant && a.priority === 'urgent')
    .slice(0, 2);
  const firstName = user?.name.split(' ')[0];
  const all = jobs ?? [];
  const newApplicants = all.reduce((sum, job) => sum + (job.newApplicantCount ?? 0), 0);
  const withNew = all.filter((job) => (job.newApplicantCount ?? 0) > 0).slice(0, 4);

  const postButton = (
    <Link to="/employer/jobs/new" className={buttonClasses('primary', 'lg', 'kf-press')}>
      <Plus aria-hidden="true" className="size-6" strokeWidth={2.5} />
      {t('employer.myJobs.post')}
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold">
            {firstName
              ? t('workerHome.greeting', { name: firstName })
              : t('workerHome.greetingNoName')}
          </h1>
          {isPending ? (
            <Skeleton className="mt-3 h-6 w-72" />
          ) : (
            <p className="mt-2 text-xl text-ink-muted">
              {t('employerHome.line', { count: newApplicants })}
            </p>
          )}
        </div>
        {postButton}
      </div>

      {needsYou.length > 0 && (
        <section aria-labelledby="needs-you" className="flex flex-col gap-3">
          <h2 id="needs-you" className="text-2xl font-bold">
            {t('workerHome.needsYou')}
          </h2>
          {needsYou.map((alert) => (
            <UrgentBanner key={alert.id} alert={alert} href={`/employer/alerts?open=${alert.id}`} />
          ))}
        </section>
      )}

      {isPending && <CardListSkeleton count={3} />}
      {isError && (
        <EmptyState
          role="alert"
          icon={CloudOff}
          title={t('employer.myJobs.errorTitle')}
          body={t('apiErrors.network')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          }
        />
      )}
      {jobs?.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={t('employer.myJobs.emptyTitle')}
          body={t('employer.myJobs.emptyBody')}
          action={postButton}
        />
      )}

      {jobs && jobs.length > 0 && (
        <>
          <section aria-labelledby="counts">
            <h2 id="counts" className="sr-only">
              {t('employerHome.countsTitle')}
            </h2>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                icon={Briefcase}
                label={t('employerHome.stats.open')}
                value={all.filter((job) => job.status === 'open').length}
              />
              <Stat icon={UserPlus} label={t('employerHome.stats.new')} value={newApplicants} />
              <Stat
                icon={Users}
                label={t('employerHome.stats.applicants')}
                value={all.reduce((sum, job) => sum + (job.applicantCount ?? 0), 0)}
              />
              <Stat
                icon={CircleCheck}
                label={t('employerHome.stats.closed')}
                value={all.filter((job) => job.status === 'closed').length}
              />
            </ul>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <JobsTable jobs={all.slice(0, 6)} />

            <section aria-labelledby="new-applicants" className="flex flex-col gap-3">
              <h2 id="new-applicants" className="text-2xl font-bold">
                {t('employerHome.newTitle')}
              </h2>
              {withNew.length === 0 ? (
                <p className="rounded-kf border border-line bg-surface p-5 text-ink-muted">
                  {t('employerHome.newEmpty')}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {withNew.map((job, index) => (
                    <li
                      key={job.id}
                      className="kf-rise"
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      <article className="kf-lift relative flex items-center gap-4 rounded-kf-lg border border-line bg-surface p-4">
                        <span
                          aria-hidden="true"
                          className="grid size-12 shrink-0 place-items-center rounded-full bg-kf-medium-bg text-kf-medium-fg"
                        >
                          <UserPlus className="size-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold break-words">
                            {/* The whole card opens the job, through this link's stretched area. */}
                            <Link
                              to={`/employer/jobs/${job.id}`}
                              className="underline-offset-4 after:absolute after:inset-0 after:rounded-kf-lg hover:underline"
                            >
                              {job.title}
                            </Link>
                          </h3>
                          <p className="text-ink-muted">
                            {t('employer.myJobs.newApplicants', {
                              count: job.newApplicantCount,
                            })}{' '}
                            · {t('employer.myJobs.applicants', { count: job.applicantCount ?? 0 })}
                          </p>
                        </div>
                        <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** One count: the number counts up once when the page opens (not with reduced motion). */
function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  const shown = Math.round(useCountUp(value));
  return (
    <li className="flex flex-col gap-2 rounded-kf-lg border border-line bg-surface p-5">
      <Icon aria-hidden="true" className="size-6 text-kf-primary-text" />
      {/* Screen readers get the real number at once, not the counting. */}
      <span aria-hidden="true" className="text-4xl font-extrabold tabular-nums">
        {shown}
      </span>
      <span className="sr-only">{value}</span>
      <span className="text-ink-muted">{label}</span>
    </li>
  );
}

function JobsTable({ jobs }: { jobs: Job[] }) {
  const { t, i18n } = useTranslation();
  return (
    <section aria-labelledby="your-jobs" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="your-jobs" className="text-2xl font-bold">
          {t('employerHome.jobsTitle')}
        </h2>
        <Link to="/employer/jobs" className={buttonClasses('ghost', 'md', 'px-2')}>
          {t('employerHome.seeAllJobs')}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      {/* Phones: the table scrolls sideways inside this box, never the whole page. It can take
          keyboard focus so it can be scrolled without a mouse. */}
      <div
        role="region"
        aria-labelledby="your-jobs"
        tabIndex={0}
        className="overflow-x-auto rounded-kf-lg border border-line bg-surface"
      >
        <table className="w-full min-w-[34rem] text-left">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">
                {t('employerHome.table.job')}
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                {t('employerHome.table.state')}
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                {t('employerHome.table.applicants')}
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                {t('employerHome.table.closes')}
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, index) => {
              const state = stateOf(job);
              const { tone, icon } = STATE[state];
              return (
                <tr
                  key={job.id}
                  className="kf-rise border-b border-kf-line-soft last:border-0 hover:bg-kf-surface-2"
                  style={{ animationDelay: `${Math.min(index, 7) * 70}ms` }}
                >
                  <th scope="row" className="px-4 py-3 font-bold">
                    <Link
                      to={`/employer/jobs/${job.id}`}
                      className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      {job.title}
                    </Link>
                  </th>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone={tone} icon={icon}>
                      {t(`employerHome.state.${state}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {job.applicantCount ?? 0}
                    {(job.newApplicantCount ?? 0) > 0 && (
                      <span className="ml-2 font-bold text-kf-primary-text">
                        {t('employer.myJobs.newApplicants', { count: job.newApplicantCount })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                    {relativeTime(new Date(job.deadline), i18n.language)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
