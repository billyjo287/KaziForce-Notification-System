import { useEffect } from 'react';
import { useAuth } from '../stores/auth';
import { refreshSession } from './api';

/** Restores the login after a page reload (using the refresh cookie). */
export function useRestoreSession() {
  const status = useAuth((s) => s.status);
  useEffect(() => {
    if (status === 'unknown') void refreshSession();
  }, [status]);
  return status;
}
