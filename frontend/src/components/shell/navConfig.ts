import {
  Bell,
  Briefcase,
  Cpu,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  ScrollText,
  Send,
  Settings,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type Role = 'worker' | 'business' | 'admin';

export interface NavItem {
  /** i18n key under "nav." */
  key: string;
  path: string;
  icon: LucideIcon;
  /** Shows the unread alerts count. */
  showsUnread?: boolean;
}

export interface RoleNav {
  basePath: string;
  userName: string;
  /** Every page, in order (sidebar on tablets/desktops). */
  items: NavItem[];
  /** Phones: at most 4 items in the bottom bar (PRD 6.6). Extra pages go behind "More". */
  bottomBar: string[];
}

// Names are the fake sample users (see backend/prisma/seed.ts); real users come in Phase 2.
export const NAV: Record<Role, RoleNav> = {
  worker: {
    basePath: '/worker',
    userName: 'Wanjiru Kamau',
    items: [
      { key: 'alerts', path: 'alerts', icon: Bell, showsUnread: true },
      { key: 'jobs', path: 'jobs', icon: Briefcase },
      { key: 'messages', path: 'messages', icon: MessageCircle },
      { key: 'settings', path: 'settings', icon: Settings },
    ],
    bottomBar: ['alerts', 'jobs', 'messages', 'settings'],
  },
  business: {
    basePath: '/employer',
    userName: 'Peter Mwangi',
    items: [
      { key: 'alerts', path: 'alerts', icon: Bell, showsUnread: true },
      { key: 'myJobs', path: 'jobs', icon: Briefcase },
      { key: 'messages', path: 'messages', icon: MessageCircle },
      { key: 'settings', path: 'settings', icon: Settings },
    ],
    bottomBar: ['alerts', 'myJobs', 'messages', 'settings'],
  },
  admin: {
    basePath: '/admin',
    userName: 'Grace Admin',
    items: [
      { key: 'overview', path: 'overview', icon: LayoutDashboard },
      { key: 'users', path: 'users', icon: Users },
      { key: 'adminJobs', path: 'jobs', icon: Briefcase },
      { key: 'spam', path: 'spam', icon: ShieldAlert },
      { key: 'deliveryLogs', path: 'delivery-logs', icon: Send },
      { key: 'announcements', path: 'announcements', icon: Megaphone },
      { key: 'models', path: 'models', icon: Cpu },
      { key: 'auditLog', path: 'audit-log', icon: ScrollText },
      { key: 'settings', path: 'settings', icon: Settings },
    ],
    // Three pages + "More" = 4 items.
    bottomBar: ['overview', 'users', 'spam'],
  },
};
