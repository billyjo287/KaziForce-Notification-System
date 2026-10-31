// The admin side's frame (guard + app shell with the admin menu). Its own download, so workers and
// employers never download the admin menu.
import { Outlet } from 'react-router';
import { AppShell } from '../components/shell/AppShell';
import { ADMIN_NAV } from '../components/shell/adminNav';
import { RequireAuth } from './RequireAuth';

export const AdminLayout = () => (
  <RequireAuth role="admin">
    <AppShell role="admin" nav={ADMIN_NAV} unreadCount={0}>
      <Outlet />
    </AppShell>
  </RequireAuth>
);
