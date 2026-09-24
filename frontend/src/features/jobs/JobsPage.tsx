import { Briefcase, CloudOff, SearchX } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useJobs, useMyApplications } from '../../api/hooks';
import { ApplicationStatusBadge } from '../../components/ApplicationStatusBadge';
import { LocationSelect, SkillSelect } from '../../components/LookupSelects';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { relativeTime } from '../../lib/relativeTime';
import { usePageTitle } from '../../lib/usePageTitle';
import { JobCard } from './JobCard';

type Tab = 'find' | 'applications';

/** Worker "Jobs": two tabs, Find jobs (with place + skill filters) and My applications. */
export default function JobsPage() {
  const { t } = useTranslation();
  usePageTitle(t('jobs.title'));
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'applications' ? 'applications' : 'find';

  return (
    <div className="max-w-3xl">
      <h1 className="mb-5 text-3xl font-bold">{t('jobs.title')}</h1>
      <Tabs.Root
        value={tab}
        onValueChange={(value) =>
          setParams(value === 'applications' ? { tab: 'applications' } : {})
        }
      >
        <Tabs.List aria-label={t('jobs.title')} className="mb-6 grid grid-cols-2 gap-2">
          {(['find', 'applications'] as const).map((value) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="relative min-h-12 overflow-hidden rounded-xl border-2 border-line bg-surface px-2 font-bold text-ink-muted hover:border-line-strong data-[state=active]:border-primary data-[state=active]:bg-primary-soft data-[state=active]:text-ink"
            >
              {t(value === 'find' ? 'jobs.findTab' : 'jobs.mineTab')}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="find" className="outline-none">
          <FindJobs />
        </Tabs.Content>
        <Tabs.Content value="applications" className="outline-none">
          <MyApplications />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function FindJobs() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const locationId = params.get('location') ?? undefined;
  const skillId = params.get('skill') ?? undefined;
  const page = Number(params.get('page') ?? 1) || 1;
  const { data, isPending, isError, refetch } = useJobs({ locationId, skillId, page });

  const setFilter = (key: 'location' | 'skill' | 'page', value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <>
      <section aria-label={t('jobs.filters')} className="mb-6 grid gap-4 sm:grid-cols-2">
        <LocationSelect
          label={t('jobs.location')}
          anyLabel={t('jobs.anyLocation')}
          value={locationId}
          onChange={(v) => setFilter('location', v)}
        />
        <SkillSelect
          label={t('jobs.skill')}
          anyLabel={t('jobs.anySkill')}
          value={skillId}
          onChange={(v) => setFilter('skill', v)}
        />
      </section>

      {isPending && <CardListSkeleton count={4} />}
      {isError && (
        <EmptyState
          role="alert"
          icon={CloudOff}
          title={t('jobs.errorTitle')}
          body={t('apiErrors.network')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          }
        />
      )}
      {data && (
        <>
          <p className="mb-3 font-bold" aria-live="polite">
            {t('jobs.results', { count: data.total })}
          </p>
          {data.items.length === 0 ? (
            <EmptyState icon={SearchX} title={t('jobs.emptyTitle')} body={t('jobs.emptyBody')} />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.items.map((job) => (
                <li key={job.id}>
                  <JobCard job={job} to={`/worker/jobs/${job.id}`} />
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onPageChange={(p) => setFilter('page', String(p))}
          />
        </>
      )}
    </>
  );
}

function MyApplications() {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError, refetch } = useMyApplications();

  if (isPending) return <CardListSkeleton count={3} />;
  if (isError) {
    return (
      <EmptyState
        role="alert"
        icon={CloudOff}
        title={t('jobs.errorTitle')}
        body={t('apiErrors.network')}
        action={
          <Button variant="secondary" onClick={() => void refetch()}>
            {t('common.tryAgain')}
          </Button>
        }
      />
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title={t('jobs.mine.emptyTitle')}
        body={t('jobs.mine.emptyBody')}
        action={
          <Link to="/worker/jobs" className={buttonClasses('primary')}>
            {t('jobs.mine.findJobs')}
          </Link>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.map((application) => (
        <li key={application.id}>
          <JobCard
            job={{ ...application.job, myApplication: null }}
            to={`/worker/jobs/${application.job.id}`}
            footer={
              <div className="flex flex-wrap items-center gap-3">
                <ApplicationStatusBadge status={application.status} viewer="worker" />
                <span className="text-ink-muted">
                  {t('jobs.mine.appliedOn', {
                    when: relativeTime(new Date(application.appliedAt), i18n.language),
                  })}
                </span>
              </div>
            }
          />
        </li>
      ))}
    </ul>
  );
}
