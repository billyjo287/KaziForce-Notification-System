import { Check, CloudOff, MessageCircle, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useEmployerJob, useSetApplicationStatus, useUndoApplicationStatus } from '../../api/hooks';
import { ApplicationStatusBadge } from '../../components/ApplicationStatusBadge';
import { useSkillName } from '../../lib/useSkillName';
import { BackLink } from '../../components/ui/BackLink';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardListSkeleton } from '../../components/ui/Skeleton';
import { relativeTime } from '../../lib/relativeTime';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';
import type { Applicant } from '../../types/api';
import { JobCard } from '../jobs/JobCard';

/** One job's applicants: Accept / Reject in one tap each, with Undo. */
export default function ApplicantsPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data, isPending, isError, refetch } = useEmployerJob(id);
  usePageTitle(
    data ? `${t('employer.applicants.title')}: ${data.job.title}` : t('employer.applicants.title'),
  );

  return (
    <div className="max-w-3xl">
      <BackLink to="/employer/jobs">{t('employer.applicants.back')}</BackLink>
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
      {data && (
        <>
          <h1 className="sr-only">{`${t('employer.applicants.title')}: ${data.job.title}`}</h1>
          <JobCard job={data.job} />
          <h2 className="mt-8 mb-4 flex items-center gap-2 text-2xl font-bold">
            <Users aria-hidden="true" className="size-6" />
            {t('employer.applicants.title')} ({data.applicants.length})
          </h2>
          {data.applicants.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t('employer.applicants.emptyTitle')}
              body={t('employer.applicants.emptyBody')}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.applicants.map((applicant) => (
                <li key={applicant.id}>
                  <ApplicantCard jobId={id} applicant={applicant} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ApplicantCard({ jobId, applicant }: { jobId: string; applicant: Applicant }) {
  const { t, i18n } = useTranslation();
  const skillName = useSkillName();
  const setStatus = useSetApplicationStatus(jobId);
  const undo = useUndoApplicationStatus(jobId);
  const errorMessage = useApiErrorMessage();
  const name = applicant.worker.name;
  const decided = applicant.status === 'accepted' || applicant.status === 'rejected';

  async function decide(status: 'accepted' | 'rejected') {
    try {
      const result = await setStatus.mutateAsync({ applicationId: applicant.id, status });
      const undoId = result.undoId;
      showToast({
        message: t(
          status === 'accepted'
            ? 'employer.applicants.acceptedToast'
            : 'employer.applicants.rejectedToast',
          { name },
        ),
        ...(undoId && {
          actionLabel: t('common.undo'),
          onAction: () =>
            undo.mutate(
              { applicationId: applicant.id, undoId },
              {
                onSuccess: () => showToast({ message: t('employer.applicants.undone') }),
                onError: (error) => showToast({ message: errorMessage(error) }),
              },
            ),
        }),
      });
    } catch (error) {
      showToast({ message: errorMessage(error) });
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{name}</h3>
        <ApplicationStatusBadge status={applicant.status} viewer="business" />
      </div>
      <p className="text-ink-muted">
        {applicant.worker.location &&
          `${t('employer.applicants.from', { place: applicant.worker.location })} · `}
        {t('employer.applicants.appliedOn', {
          when: relativeTime(new Date(applicant.appliedAt), i18n.language),
        })}
      </p>
      {applicant.worker.skills.length > 0 && (
        <p>
          <span className="font-bold">{t('employer.applicants.skills')}: </span>
          {applicant.worker.skills.map(skillName).join(', ')}
        </p>
      )}
      {applicant.note && (
        <blockquote className="rounded-lg bg-canvas p-3">
          <span className="font-bold">{t('employer.applicants.note')}: </span>
          {applicant.note}
        </blockquote>
      )}
      <div className="flex flex-wrap gap-3">
        {!decided && (
          <>
            <Button onClick={() => decide('accepted')} disabled={setStatus.isPending}>
              <Check aria-hidden="true" className="size-5" strokeWidth={3} />
              {t('employer.applicants.accept')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => decide('rejected')}
              disabled={setStatus.isPending}
            >
              <X aria-hidden="true" className="size-5" strokeWidth={3} />
              {t('employer.applicants.reject')}
            </Button>
          </>
        )}
        <Link to={`/employer/messages/${applicant.id}`} className={buttonClasses('ghost')}>
          <MessageCircle aria-hidden="true" className="size-5" />
          {t('employer.applicants.message', { name })}
        </Link>
      </div>
    </article>
  );
}
