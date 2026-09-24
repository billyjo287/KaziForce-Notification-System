import { CircleCheck, CircleX, Eye, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApplicationStatus } from '../types/api';
import { Badge, type BadgeTone } from './ui/Badge';

const STYLE = {
  received: { icon: Send, tone: 'neutral' },
  reviewed: { icon: Eye, tone: 'later' },
  accepted: { icon: CircleCheck, tone: 'success' },
  rejected: { icon: CircleX, tone: 'neutral' },
} as const satisfies Record<ApplicationStatus, { icon: typeof Send; tone: BadgeTone }>;

/**
 * Application status in plain words. Workers and employers see different wording
 * ("Seen by the employer" vs "Seen"), always as icon + word.
 */
export function ApplicationStatusBadge({
  status,
  viewer,
}: {
  status: ApplicationStatus;
  viewer: 'worker' | 'business';
}) {
  const { t } = useTranslation();
  const { icon, tone } = STYLE[status];
  return (
    <Badge tone={tone} icon={icon}>
      {t(
        viewer === 'worker'
          ? `applicationStatus.worker.${status}`
          : `applicationStatus.employer.${status}`,
      )}
    </Badge>
  );
}
