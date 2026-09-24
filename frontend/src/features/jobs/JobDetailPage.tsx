import { Banknote, CalendarClock, CloudOff, MapPin, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useApply, useJob } from '../../api/hooks';
import { ApplicationStatusBadge } from '../../components/ApplicationStatusBadge';
import { useSkillName } from '../../lib/useSkillName';
import { Badge } from '../../components/ui/Badge';
import { BackLink } from '../../components/ui/BackLink';
import { Button } from '../../components/ui/Button';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormAlert } from '../../components/ui/FormAlert';
import { Skeleton } from '../../components/ui/Skeleton';
import { Textarea } from '../../components/ui/Textarea';
import { relativeTime } from '../../lib/relativeTime';
import { useApiErrorMessage } from '../../lib/useApiErrorMessage';
import { usePageTitle } from '../../lib/usePageTitle';
import { showToast } from '../../stores/toasts';

/** Worker job detail with one-tap Apply (and an optional short note). */
export default function JobDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const { data: job, isPending, isError, error, refetch } = useJob(id);
  const apply = useApply(id);
  const skillName = useSkillName();
  const errorMessage = useApiErrorMessage();
  const [note, setNote] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  usePageTitle(job?.title ?? t('jobs.title'));

  if (isPending) {
    return (
      <div className="max-w-2xl" role="status">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="max-w-2xl">
        <BackLink to="/worker/jobs">{t('jobs.detail.back')}</BackLink>
        <EmptyState
          role="alert"
          headingLevel="h1"
          icon={CloudOff}
          title={errorMessage(error)}
          body=""
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('common.tryAgain')}
            </Button>
          }
        />
      </div>
    );
  }

  const deadline = new Date(job.deadline);
  const onApply = async () => {
    setApplyError(null);
    try {
      await apply.mutateAsync(note);
      showToast({ message: t('jobs.detail.appliedToast') });
    } catch (e) {
      setApplyError(errorMessage(e));
    }
  };

  return (
    <div className="max-w-2xl">
      <BackLink to="/worker/jobs">{t('jobs.detail.back')}</BackLink>
      <div className="flex flex-col gap-2">
        {job.urgent && job.status === 'open' && (
          <div>
            <Badge tone="urgent">{t('jobs.urgent')}</Badge>
          </div>
        )}
        <h1 className="text-3xl leading-tight font-bold">{job.title}</h1>
        <p className="text-lg text-ink-muted">
          {t('jobs.detail.postedBy', { name: job.employer.name })}
        </p>
      </div>

      <dl className="mt-5 grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-2 font-bold">
            <MapPin aria-hidden="true" className="size-5 text-ink-muted" />
            {t('jobs.detail.where')}
          </dt>
          <dd className="pl-7">{job.location.name}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 font-bold">
            <Wrench aria-hidden="true" className="size-5 text-ink-muted" />
            {t('jobs.detail.skill')}
          </dt>
          <dd className="pl-7">{skillName(job.skill)}</dd>
        </div>
        {job.pay && (
          <div>
            <dt className="flex items-center gap-2 font-bold">
              <Banknote aria-hidden="true" className="size-5 text-ink-muted" />
              {t('jobs.pay')}
            </dt>
            <dd className="pl-7">{job.pay}</dd>
          </div>
        )}
        <div>
          <dt className="flex items-center gap-2 font-bold">
            <CalendarClock aria-hidden="true" className="size-5 text-ink-muted" />
            {t('jobs.detail.closesAt')}
          </dt>
          <dd className={`pl-7 ${job.urgent ? 'font-bold text-urgent' : ''}`}>
            {deadline.toLocaleString(i18n.language, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            ({relativeTime(deadline, i18n.language)})
          </dd>
        </div>
      </dl>

      <h2 className="mt-6 text-xl font-bold">{t('jobs.detail.about')}</h2>
      <p className="mt-2 text-lg whitespace-pre-line">{job.description}</p>

      <Card className="mt-6">
        {job.myApplication ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">{t('jobs.detail.yourApplication')}</h2>
            <div>
              <ApplicationStatusBadge status={job.myApplication.status} viewer="worker" />
            </div>
            <Link
              to={`/worker/messages/${job.myApplication.id}`}
              className={buttonClasses('secondary', 'md', 'self-start')}
            >
              {t('jobs.detail.message')}
            </Link>
          </div>
        ) : job.status === 'removed' ? (
          <p className="text-lg">{t('jobs.detail.removed')}</p>
        ) : job.status === 'closed' ? (
          <p className="text-lg">{t('jobs.detail.closed')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">{t('jobs.detail.apply')}</h2>
            {applyError && <FormAlert>{applyError}</FormAlert>}
            <Textarea
              label={t('jobs.detail.noteLabel')}
              help={t('jobs.detail.noteHelp')}
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="lg" onClick={onApply} disabled={apply.isPending}>
              {apply.isPending ? t('jobs.detail.applying') : t('jobs.detail.applyButton')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
