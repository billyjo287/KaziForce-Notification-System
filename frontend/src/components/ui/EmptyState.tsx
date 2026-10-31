import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type EmptyStateProps = (
  | { icon: LucideIcon; art?: never }
  /** A small picture instead of the icon (decoration), e.g. the chai cup in an empty inbox. */
  | { icon?: never; art: ReactNode }
) & {
  title: string;
  body: string;
  /** Optional button or link, e.g. "Try again". */
  action?: ReactNode;
  /** Heading level to fit the page outline (default h2). */
  headingLevel?: 'h1' | 'h2';
  /** "alert" is announced straight away (use for errors); its warning tile shakes once. */
  role?: 'status' | 'alert';
};

/** Friendly message for "nothing here yet", "nothing matches" and "something went wrong". */
export function EmptyState({
  icon: Icon,
  art,
  title,
  body,
  action,
  headingLevel: Heading = 'h2',
  role,
}: EmptyStateProps) {
  return (
    <div
      role={role}
      className="flex flex-col items-center rounded-kf-lg border border-line bg-surface px-6 py-12 text-center"
    >
      {role === 'alert' && Icon ? (
        <span className="kf-shake grid size-16 place-items-center rounded-kf-lg bg-urgent-soft text-urgent">
          <Icon aria-hidden="true" className="size-8" />
        </span>
      ) : (
        (art ?? (Icon && <Icon aria-hidden="true" className="size-10 text-ink-muted" />))
      )}
      <Heading className="mt-3 text-xl font-bold">{title}</Heading>
      <p className="mt-1 max-w-md text-ink-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
