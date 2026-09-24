// Everything behind "log in": the three sides' layouts and pages.
// Loaded as its own download, so visitors of the public landing page never pay for it.
import { useEffect } from 'react';
import { Outlet, useMatches } from 'react-router';
import { AppShell } from '../components/shell/AppShell';
import { useAlertsStore, useUnreadCount } from '../features/alerts/alertsStore';
import { AlertsPage } from '../features/alerts/AlertsPage';
import type { AlertRole } from '../features/alerts/types';
import { ComingSoonPage } from '../pages/ComingSoonPage';

function AlertsRoleLayout({ role }: { role: AlertRole }) {
  const load = useAlertsStore((s) => s.load);
  const unreadCount = useUnreadCount(role);
  // Load alerts here (not only on the Alerts page) so the menu badge is right on every page.
  useEffect(() => load(role), [load, role]);

  return (
    <AppShell role={role} unreadCount={unreadCount}>
      <Outlet />
    </AppShell>
  );
}

export const WorkerLayout = () => <AlertsRoleLayout role="worker" />;
export const EmployerLayout = () => <AlertsRoleLayout role="business" />;
export const AdminLayout = () => (
  <AppShell role="admin" unreadCount={0}>
    <Outlet />
  </AppShell>
);

export const WorkerAlerts = () => <AlertsPage role="worker" />;
export const EmployerAlerts = () => <AlertsPage role="business" />;

/** Pages that arrive in later phases (see docs/ROADMAP.md). */
export function ComingSoon() {
  const handle = useMatches().at(-1)?.handle as { titleKey?: string } | undefined;
  return <ComingSoonPage titleKey={handle?.titleKey ?? 'common.comingSoonTitle'} />;
}
