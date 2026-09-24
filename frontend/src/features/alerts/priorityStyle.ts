import { Bell, Clock, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { BadgeTone } from '../../components/ui/Badge';
import type { Priority } from './types';

// Priority is never shown by colour alone: every badge has colour + icon + word (PRD 6.3).
export const PRIORITY_STYLE: Record<
  Priority,
  { icon: LucideIcon; tone: BadgeTone; bar: string; text: string }
> = {
  urgent: {
    icon: TriangleAlert,
    tone: 'urgent',
    bar: 'bg-urgent-bar',
    text: 'text-urgent',
  },
  medium: {
    icon: Bell,
    tone: 'important',
    bar: 'bg-important-bar',
    text: 'text-important',
  },
  low: {
    icon: Clock,
    tone: 'later',
    bar: 'bg-later-bar',
    text: 'text-later',
  },
};
