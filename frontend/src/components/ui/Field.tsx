import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

interface FieldTextProps {
  id: string;
  children: ReactNode;
}

/** One line of help under a label (PRD 6.4: every setting has one line of help text). */
export function HelpText({ id, children }: FieldTextProps) {
  return (
    <p id={id} className="text-ink-muted">
      {children}
    </p>
  );
}

/** Error text: icon + words (never colour alone), announced by screen readers. */
export function ErrorText({ id, children }: FieldTextProps) {
  return (
    <p id={id} className="flex items-start gap-2 font-bold text-urgent">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
