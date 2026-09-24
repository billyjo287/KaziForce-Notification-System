import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Dialog } from '../ui/Dialog';
import type { NavItem } from './navConfig';

interface MoreMenuProps {
  items: NavItem[];
  hrefFor: (item: NavItem) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Phone "More" menu: the pages that do not fit in the 4-item bottom bar. */
export default function MoreMenu({ items, hrefFor, open, onOpenChange }: MoreMenuProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('nav.moreTitle')}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <NavLink
              to={hrefFor(item)}
              onClick={() => onOpenChange(false)}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-lg px-3 text-lg ${
                  isActive ? 'bg-primary-soft font-bold' : 'font-medium hover:bg-canvas'
                }`
              }
            >
              <item.icon aria-hidden="true" className="size-6 shrink-0" />
              {t(`nav.${item.key}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
