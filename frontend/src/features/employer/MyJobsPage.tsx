import { Briefcase, CloudOff, Plus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useEmployerJobs } from '../../api/hooks';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { usePageTitle } from '../../lib/usePageTitle';
import { JobCard } from '../jobs/JobCard';

/** Employer "My jobs" with a large "Post a job" button (PRD section 8). */
export default function MyJobsPage() {
  const { t } = useTranslation();
  usePageTitle(t('employer.myJobs.title'));
  const { data, isPending, isError, refetch } = useEmployerJobs();

  const postButton = (
    <Link to="/employer/jobs/new" className={buttonClasses('primary', 'lg')}>
      <Plus aria-hidden="true" className="size-6" strokeWidth={2.5} />
      {t('employer.myJobs.post')}
    </Link>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">{t('employer.myJobs.title')}</h1>
        {data && data.length > 0 && postButton}
      </div>

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
      {data?.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={t('employer.myJobs.emptyTitle')}
          body={t('employer.myJobs.emptyBody')}
          action={postButton}
        />
      )}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.map((job) => (
            <li key={job.id}>
              <JobCard
                job={job}
                to={`/employer/jobs/${job.id}`}
                footer={
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 font-bold">
                      <Users aria-hidden="true" className="size-5" />
                      {t('employer.myJobs.applicants', { count: job.applicantCount ?? 0 })}
                    </span>
                    {(job.newApplicantCount ?? 0) > 0 && (
                      <Badge tone="success">
                        {t('employer.myJobs.newApplicants', { count: job.newApplicantCount })}
                      </Badge>
                    )}
                    {job.status === 'removed' && job.removedReason && (
                      <span className="text-ink-muted">
                        {t('admin.jobs.removedReason', { reason: job.removedReason })}
                      </span>
                    )}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
