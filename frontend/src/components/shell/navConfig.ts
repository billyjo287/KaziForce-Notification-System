import {
  Bell,
  Briefcase,
  House,
  MessageCircle,
  Settings,
  Sunrise,
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
  /**
   * "top": a row of big buttons across the top of every page, on all screen sizes (workers,
   * design refresh). "side": a sidebar on tablets and computers, a bottom bar on phones.
   */
  layout: 'top' | 'side';
  /** Every page, in order (sidebar on tablets/desktops). */
  items: NavItem[];
  /** Phones: at most 4 items in the bottom bar (PRD 6.6). Extra pages go behind "More". */
  bottomBar: string[];
}

export const NAV: Record<'worker' | 'business', RoleNav> = {
  worker: {
    basePath: '/worker',
    layout: 'top',
    items: [
      { key: 'home', path: 'home', icon: House },
      { key: 'findJobs', path: 'jobs', icon: Briefcase },
      { key: 'alerts', path: 'alerts', icon: Bell, showsUnread: true },
      { key: 'messages', path: 'messages', icon: MessageCircle },
      { key: 'dailySummary', path: 'summary', icon: Sunrise },
      { key: 'alertSettings', path: 'settings', icon: Settings },
    ],
    bottomBar: [],
  },
  business: {
    basePath: '/employer',
    layout: 'side',
    items: [
      { key: 'home', path: 'home', icon: House },
      { key: 'alerts', path: 'alerts', icon: Bell, showsUnread: true },
      { key: 'myJobs', path: 'jobs', icon: Briefcase },
      { key: 'messages', path: 'messages', icon: MessageCircle },
      { key: 'settings', path: 'settings', icon: Settings },
    ],
    // Phones: Messages and Settings are behind "More" (4 places at most, "More" included).
    bottomBar: ['home', 'alerts', 'myJobs'],
  },
};
