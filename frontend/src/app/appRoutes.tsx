// The frame of each logged-in side (guard + app shell) and the Alerts pages.
// Loaded as its own download, so visitors of the public landing page never pay for it.
// Other pages are separate downloads too (see router.tsx).
import { Outlet, useMatches } from 'react-router';
import { AppShell } from '../components/shell/AppShell';
import { AlertsPage } from '../features/alerts/AlertsPage';
import { useUnreadCount } from '../features/alerts/useAlerts';
import { ComingSoonPage } from '../pages/ComingSoonPage';
import { RequireAuth } from './RequireAuth';

function AlertsSideShell({ role }: { role: 'worker' | 'business' }) {
  // The menu badge shows unread alerts on every page of this side.
  const unreadCount = useUnreadCount();
  return (
    <AppShell role={role} unreadCount={unreadCount}>
      <Outlet />
    </AppShell>
  );
}

export const WorkerLayout = () => (
  <RequireAuth role="worker">
    <AlertsSideShell role="worker" />
  </RequireAuth>
);

export const EmployerLayout = () => (
  <RequireAuth role="business">
    <AlertsSideShell role="business" />
  </RequireAuth>
);

export const AdminLayout = () => (
  <RequireAuth role="admin">
    <AppShell role="admin" unreadCount={0}>
      <Outlet />
    </AppShell>
  </RequireAuth>
);

export const WorkerAlerts = () => <AlertsPage role="worker" />;
export const EmployerAlerts = () => <AlertsPage role="business" />;

/** Pages that arrive in later phases (see docs/ROADMAP.md); the title comes from the route. */
export function ComingSoon() {
  const handle = useMatches().at(-1)?.handle as { titleKey?: string } | undefined;
  return <ComingSoonPage titleKey={handle?.titleKey ?? 'common.comingSoonTitle'} />;
}
