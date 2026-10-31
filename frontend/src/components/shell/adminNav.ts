// The admin side's menu. A separate file so its icons are downloaded only by admins.
import {
  Briefcase,
  Cpu,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Send,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type { RoleNav } from './navConfig';
// The menu's words come with the admin pages' words.
import '../../features/admin/strings';

export const ADMIN_NAV: RoleNav = {
  basePath: '/admin',
  layout: 'side',
  items: [
    { key: 'overview', path: 'overview', icon: LayoutDashboard },
    { key: 'spam', path: 'spam', icon: ShieldAlert },
    { key: 'users', path: 'users', icon: Users },
    { key: 'adminJobs', path: 'jobs', icon: Briefcase },
    { key: 'deliveryLogs', path: 'delivery-logs', icon: Send },
    { key: 'announcements', path: 'announcements', icon: Megaphone },
    { key: 'models', path: 'models', icon: Cpu },
    { key: 'auditLog', path: 'audit-log', icon: ScrollText },
    { key: 'settings', path: 'settings', icon: Settings },
  ],
  // Three pages + "More" = 4 items: the ones an admin checks every day.
  bottomBar: ['overview', 'spam', 'users'],
};
