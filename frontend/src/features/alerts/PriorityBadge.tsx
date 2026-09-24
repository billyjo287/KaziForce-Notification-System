import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { PRIORITY_STYLE } from './priorityStyle';
import type { Priority } from './types';

/** Priority shown as colour + icon + word: "Urgent", "Important", "For later". */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  const { icon, tone } = PRIORITY_STYLE[priority];
  return (
    <Badge tone={tone} icon={icon}>
      {t(`priority.${priority}`)}
    </Badge>
  );
}
