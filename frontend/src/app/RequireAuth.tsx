import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useRestoreSession } from '../lib/useRestoreSession';
import { PageSkeleton } from '../pages/StatusPages';
import { homePath, useAuth } from '../stores/auth';
import type { Role } from '../types/api';

/**
 * Guards a whole side of the app: must be logged in, must be the right role, and (workers and
 * employers) must have finished onboarding.
 */
export function RequireAuth({ role, children }: { role: Role; children: ReactNode }) {
  const status = useRestoreSession();
  const user = useAuth((s) => s.user);
  const location = useLocation();

  if (status === 'unknown') return <PageSkeleton />;
  if (status === 'guest' || !user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (user.role !== role) return <Navigate to={homePath(user.role)} replace />;
  if (user.role !== 'admin' && !user.onboardingCompleted)
    return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** For log-in / register pages: people who are already logged in go straight to their side. */
export function RedirectIfLoggedIn({ children }: { children: ReactNode }) {
  const status = useRestoreSession();
  const user = useAuth((s) => s.user);
  if (status === 'unknown') return <PageSkeleton />;
  if (user)
    return <Navigate to={user.onboardingCompleted ? homePath(user.role) : '/onboarding'} replace />;
  return <>{children}</>;
}
