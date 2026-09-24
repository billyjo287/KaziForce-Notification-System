import { Timer } from 'lucide-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { relativeTime } from '../../lib/relativeTime';
import { PriorityBadge } from './PriorityBadge';
import { PRIORITY_STYLE } from './priorityStyle';
import type { Alert } from './types';

interface AlertCardProps {
  alert: Alert;
  selected: boolean;
  onOpen: (id: string) => void;
}

/** One alert in the list. The whole card is a single button that opens the details. */
export const AlertCard = forwardRef<HTMLButtonElement, AlertCardProps>(function AlertCard(
  { alert, selected, onOpen },
  ref,
) {
  const { t, i18n } = useTranslation();
  const unread = alert.readAt === null;
  const showDeadline = alert.priority === 'urgent' && alert.deadlineAt;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(alert.id)}
      aria-current={selected ? 'true' : undefined}
      className={`group relative flex w-full gap-3 overflow-hidden rounded-xl border bg-surface p-4 pl-5 text-left transition-colors duration-150 ease-out-soft hover:border-line-strong ${
        alert.arrivedLive && alert.priority === 'urgent' && unread ? 'animate-kf-pulse' : ''
      } ${selected ? 'border-primary ring-2 ring-primary' : 'border-line'}`}
    >
      {/* Coloured side bar: an extra cue, the badge below carries the meaning. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1.5 ${PRIORITY_STYLE[alert.priority].bar}`}
      />

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <PriorityBadge priority={alert.priority} />
          {unread && (
            <span className="inline-flex items-center gap-1.5 font-bold text-primary">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
              {t('alerts.new')}
            </span>
          )}
        </span>

        <span className={`text-lg leading-snug ${unread ? 'font-bold' : 'font-medium'}`}>
          {alert.title}
        </span>

        <span className="line-clamp-2 text-ink-muted">{alert.body}</span>

        <span className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {showDeadline && alert.deadlineAt && (
            <span className="inline-flex items-center gap-1.5 font-bold text-urgent">
              <Timer aria-hidden="true" className="size-5 shrink-0" />
              {t('alerts.closes', { when: relativeTime(alert.deadlineAt, i18n.language) })}
            </span>
          )}
          <span className="text-ink-muted">{relativeTime(alert.createdAt, i18n.language)}</span>
        </span>
      </span>
    </button>
  );
});
