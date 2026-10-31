// The employer side's frame (guard + sidebar shell). Workers (workerLayout.tsx) and admins
// (adminLayout.tsx) have their own, so each side downloads only its own frame. Visitors of the
// public landing page never download any of them; every page, Alerts included, is a separate
// download (see router.tsx).
import { Outlet } from 'react-router';
import { AppShell } from '../components/shell/AppShell';
import { NAV } from '../components/shell/navConfig';
import { useUnreadCount } from '../features/alerts/useAlerts';
import { useLiveAlerts } from '../features/alerts/useLiveAlerts';
import { RequireAuth } from './RequireAuth';

function EmployerShell() {
  // The menu badge shows unread alerts on every page of this side; new ones arrive live.
  const unreadCount = useUnreadCount();
  useLiveAlerts('business');
  return (
    <AppShell role="business" nav={NAV.business} unreadCount={unreadCount}>
      <Outlet />
    </AppShell>
  );
}

export const EmployerLayout = () => (
  <RequireAuth role="business">
    <EmployerShell />
  </RequireAuth>
);
