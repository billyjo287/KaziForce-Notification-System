// The worker side's frame (guard + the top-menu shell): its own download, so a worker never
// downloads the employer/admin sidebar and the other sides never download the top menu.
import { Outlet } from 'react-router';
import { WorkerShell } from '../components/shell/WorkerShell';
import { useUnreadCount, useUrgentUnreadCount } from '../features/alerts/useAlerts';
import { useLiveAlerts } from '../features/alerts/useLiveAlerts';
import { RequireAuth } from './RequireAuth';

function WorkerFrame() {
  // The bell and menu show unread alerts on every page; new ones arrive live.
  const unreadCount = useUnreadCount();
  const urgentCount = useUrgentUnreadCount();
  useLiveAlerts('worker');
  return (
    <WorkerShell unreadCount={unreadCount} urgentCount={urgentCount}>
      <Outlet />
    </WorkerShell>
  );
}

export const WorkerLayout = () => (
  <RequireAuth role="worker">
    <WorkerFrame />
  </RequireAuth>
);
