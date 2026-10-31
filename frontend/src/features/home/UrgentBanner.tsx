import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCountdown } from '../../components/brand/hooks';
import { Badge } from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/buttonStyles';
import type { Alert } from '../alerts/types';
import './strings';

/**
 * An unread "Act now" alert on a Home page (worker and employer): red-orange border, a slow soft
 * glow, and the time left. "Open" goes to the alert on that side's Alerts page.
 */
export function UrgentBanner({ alert, href }: { alert: Alert; href: string }) {
  const { t } = useTranslation();
  return (
    <article className="kf-glow flex flex-col gap-3 rounded-kf-lg border-2 border-kf-urgent-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone="urgent" icon={TriangleAlert}>
            {t('priority.urgent')}
          </Badge>
          {alert.deadlineAt && <TimeLeft deadline={alert.deadlineAt} />}
        </p>
        <h3 className="mt-2 text-xl font-bold">{alert.title}</h3>
        <p className="text-ink-muted">{alert.body}</p>
      </div>
      <Link to={href} className={buttonClasses('primary', 'lg', 'kf-press shrink-0')}>
        {t('workerHome.open')}
        <span className="sr-only">: {alert.title}</span>
      </Link>
    </article>
  );
}

function TimeLeft({ deadline }: { deadline: Date }) {
  const { t } = useTranslation();
  const time = useCountdown(deadline);
  const closed = time === '0:00:00'; // the countdown has reached the deadline
  return (
    <span className="font-bold text-urgent">
      {closed ? t('workerHome.closed') : t('workerHome.closesIn', { time })}
    </span>
  );
}
