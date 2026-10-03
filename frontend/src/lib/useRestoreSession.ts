import { useEffect } from 'react';
import { hasSignedInHint, useAuth } from '../stores/auth';
import { refreshSession } from './api';

/**
 * Restores the login after a page reload (using the refresh cookie). Pages for visitors (log in,
 * sign up) pass `guestPage`: a browser that has never been logged in is known to be a guest
 * without asking the server.
 */
export function useRestoreSession({ guestPage = false }: { guestPage?: boolean } = {}) {
  const status = useAuth((s) => s.status);
  const skip = guestPage && status === 'unknown' && !hasSignedInHint();
  useEffect(() => {
    if (status !== 'unknown') return;
    if (skip) useAuth.getState().clear();
    else void refreshSession();
  }, [status, skip]);
  return skip ? 'guest' : status;
}
