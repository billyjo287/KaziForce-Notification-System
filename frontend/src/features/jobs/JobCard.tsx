import { Banknote, CircleCheck, MapPin, Timer, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useSkillName } from '../../lib/useSkillName';
import { Badge } from '../../components/ui/Badge';
import { relativeTime } from '../../lib/relativeTime';
import type { Job } from '../../types/api';

/** One job in a list. The title is the link; the rest is plain text (one tap target). */
export function JobCard({ job, to, footer }: { job: Job; to?: string; footer?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const skillName = useSkillName();

  return (
    <article className="relative flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong">
      <div className="flex flex-wrap items-center gap-2">
        {job.urgent && job.status === 'open' && (
          <Badge tone="urgent" icon={TriangleAlert}>
            {t('jobs.urgent')}
          </Badge>
        )}
        {job.status !== 'open' && <Badge>{t(`jobs.${job.status}`)}</Badge>}
        {job.myApplication && (
          <Badge tone="success" icon={CircleCheck}>
            {t('jobs.applied')}
          </Badge>
        )}
      </div>
      <h3 className="text-lg leading-snug font-bold">
        {to ? (
          // The whole card is clickable through this link's stretched area.
          <Link
            to={to}
            className="underline-offset-4 after:absolute after:inset-0 after:rounded-xl hover:underline"
          >
            {job.title}
          </Link>
        ) : (
          job.title
        )}
      </h3>
      <p className="text-ink-muted">{job.employer.name}</p>
      <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-5">
        <li className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
          {job.location.name} · {skillName(job.skill)}
        </li>
        {job.pay && (
          <li className="flex items-center gap-2">
            <Banknote aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
            {job.pay}
          </li>
        )}
        {job.status === 'open' && (
          <li className={`flex items-center gap-2 ${job.urgent ? 'font-bold text-urgent' : ''}`}>
            <Timer aria-hidden="true" className="size-5 shrink-0" />
            {t('jobs.closes', { when: relativeTime(new Date(job.deadline), i18n.language) })}
          </li>
        )}
      </ul>
      {footer && <div className="relative z-10 mt-1">{footer}</div>}
    </article>
  );
}
