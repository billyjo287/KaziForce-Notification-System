import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'urgent' | 'important' | 'later';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-ink border border-line',
  success: 'bg-primary-soft text-ink',
  urgent: 'bg-urgent-soft text-urgent',
  important: 'bg-important-soft text-important',
  later: 'bg-later-soft text-later',
};

interface BadgeProps {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
}

/** Small label. Always has words; the icon and colour are extra cues. */
export function Badge({ tone = 'neutral', icon: Icon, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-bold ${tones[tone]}`}
    >
      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />}
      {children}
    </span>
  );
}
