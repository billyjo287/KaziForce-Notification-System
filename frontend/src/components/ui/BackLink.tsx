import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

/** "← Back to …" link at the top of detail pages. */
export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-bold text-primary underline-offset-4 hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-5" />
      {children}
    </Link>
  );
}
