import { lazy, Suspense } from 'react';
import { useAuth } from '../../stores/auth';

// Only for people who signed up by SMS and have not confirmed their email yet (ADR 0015), so its
// code (and the code box) is a separate download.
const ConfirmEmailBanner = lazy(() => import('./ConfirmEmailBanner'));

/** "Confirm your email address" on the Home pages and in Settings, until it is done. */
export function ConfirmEmailReminder() {
  const unconfirmed = useAuth((s) => s.user?.emailConfirmed === false);
  if (!unconfirmed) return null;
  return (
    <Suspense fallback={null}>
      <ConfirmEmailBanner />
    </Suspense>
  );
}
