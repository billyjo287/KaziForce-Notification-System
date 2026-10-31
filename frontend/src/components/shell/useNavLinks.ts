import { useTranslation } from 'react-i18next';
import type { NavItem, RoleNav } from './navConfig';

/** Links of a menu, and their spoken names ("Alerts 3 unread"). */
export function useNavLinks(nav: RoleNav, unreadCount: number) {
  const { t } = useTranslation();
  const href = (item: NavItem) => `${nav.basePath}/${item.path}`;
  const accessibleLabel = (item: NavItem) =>
    item.showsUnread && unreadCount > 0
      ? `${t(`nav.${item.key}`)} ${t('nav.unreadCount', { count: unreadCount })}`
      : t(`nav.${item.key}`);
  return { href, accessibleLabel };
}
