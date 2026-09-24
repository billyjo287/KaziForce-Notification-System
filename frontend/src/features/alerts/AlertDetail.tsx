import { ArrowLeft, CalendarClock, EyeOff, MapPin } from 'lucide-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { relativeTime } from '../../lib/relativeTime';
import { PriorityBadge } from './PriorityBadge';
import type { Alert, AlertRole, AlertType } from './types';

// The one main action for each kind of alert (announcements have none).
const MAIN_ACTION: Record<AlertRole, Partial<Record<AlertType, string>>> = {
  worker: {
    job_alert: 'alerts.detail.viewJob',
    status_update: 'alerts.detail.viewApplication',
    message: 'alerts.detail.openMessage',
  },
  business: {
    status_update: 'alerts.detail.viewApplicants',
    message: 'alerts.detail.openMessage',
  },
};

interface AlertDetailProps {
  role: AlertRole;
  alert: Alert;
  onBack: () => void;
  onNotImportant: () => void;
  /** The main action was used (recorded as "clicked"). */
  onMainAction: () => void;
}

/** Full alert with its one main action. Phones show it as its own page, desktops beside the list. */
export const AlertDetail = forwardRef<HTMLHeadingElement, AlertDetailProps>(function AlertDetail(
  { role, alert, onBack, onNotImportant, onMainAction },
  headingRef,
) {
  const { t, i18n } = useTranslation();
  const mainAction = MAIN_ACTION[role][alert.type];
  const deadlineText = alert.deadlineAt?.toLocaleString(i18n.language, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <article className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-2 font-bold text-primary lg:hidden"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
        {t('alerts.detail.back')}
      </button>

      <div className="flex flex-col gap-3">
        <div>
          <PriorityBadge priority={alert.priority} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl leading-tight font-bold">
          {alert.title}
        </h2>
        <p className="text-ink-muted">
          {t('alerts.detail.from', { name: alert.sender })} ·{' '}
          {t('alerts.detail.received', { when: relativeTime(alert.createdAt, i18n.language) })}
        </p>
      </div>

      <p className="text-lg">{alert.body}</p>

      {(alert.location || alert.deadlineAt) && (
        <dl className="grid gap-3 rounded-xl bg-canvas p-4">
          {alert.location && (
            <div>
              <dt className="flex items-center gap-3 font-bold">
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                {t('alerts.detail.location')}
              </dt>
              <dd className="pl-8">{alert.location}</dd>
            </div>
          )}
          {alert.deadlineAt && (
            <div>
              <dt className="flex items-center gap-3 font-bold">
                <CalendarClock aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                {t('alerts.detail.deadline')}
              </dt>
              <dd className="pl-8">
                {deadlineText} ({relativeTime(alert.deadlineAt, i18n.language)})
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        {mainAction && alert.link && (
          <Link to={alert.link} onClick={onMainAction} className={buttonClasses('primary', 'lg')}>
            {t(mainAction)}
          </Link>
        )}
        <div className="flex flex-col">
          <button
            type="button"
            onClick={onNotImportant}
            aria-describedby={`not-important-help-${alert.id}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-line-strong px-5 font-bold transition-colors duration-150 hover:bg-canvas"
          >
            <EyeOff aria-hidden="true" className="size-5" />
            {t('alerts.detail.notImportant')}
          </button>
          <p id={`not-important-help-${alert.id}`} className="mt-1.5 text-ink-muted">
            {t('alerts.detail.notImportantHelp')}
          </p>
        </div>
      </div>
    </article>
  );
});
