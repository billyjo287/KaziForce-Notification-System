import { Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { useAuth } from '../../stores/auth';
import { Logo } from '../Logo';
import { ThemeToggle } from '../brand/ThemeToggle';
import { initialsOf } from './initials';
import { LogOutButton } from './LogOutButton';
import { NAV } from './navConfig';
import { PageContent, ShellFrame, UnreadBubble } from './shellParts';
import { useNavLinks } from './useNavLinks';

/**
 * The worker's frame (design refresh): a top bar (logo, light/dark, the alerts bell, who is
 * logged in, Log out), then every page as a big button in a row across the top, on all screen
 * sizes (2 a row on phones, 3 on tablets, 6 on computers); the page uses the full width below.
 */
export function WorkerShell({
  unreadCount,
  urgentCount,
  children,
}: {
  unreadCount: number;
  /** Unread "Act now" alerts: the bell wiggles while there are any. */
  urgentCount: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const nav = NAV.worker;
  const { href, accessibleLabel } = useNavLinks(nav, unreadCount);
  const alertsItem = nav.items.find((item) => item.showsUnread);
  const initials = initialsOf(user?.name ?? '');
  return (
    <ShellFrame className="min-h-dvh">
      {/* ---------- Top bar: logo, light/dark, the alerts bell, who is logged in ---------- */}
      <header className="border-b border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link to={nav.basePath} className="rounded-lg">
            <Logo markClassName="h-8 sm:h-9" />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            {alertsItem && (
              <Link
                to={href(alertsItem)}
                aria-label={accessibleLabel(alertsItem)}
                className="relative grid size-11 place-items-center rounded-full border-2 border-line-strong bg-surface hover:bg-kf-surface-2"
              >
                {/* Wiggles every few seconds, only while something needs acting on now. */}
                <Bell
                  aria-hidden="true"
                  className={`size-5 ${urgentCount > 0 ? 'kf-wiggle' : ''}`}
                />
                {unreadCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="kf-pop absolute -top-1.5 -right-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-kf-danger-solid px-1.5 text-sm font-bold text-white"
                  >
                    {unreadCount}
                  </span>
                )}
              </Link>
            )}
            {user && (
              <span className="hidden items-center gap-2 md:flex">
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-full bg-kf-primary-soft font-bold text-kf-on-primary-soft"
                >
                  {initials}
                </span>
                <span className="font-bold">{user.name}</span>
              </span>
            )}
            <LogOutButton />
          </div>
        </div>
      </header>

      {/* ---------- Every page as a big button (52 px and up), on all screen sizes ---------- */}
      <nav aria-label={t('nav.label')} className="border-b border-line px-4 py-3 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {nav.items.map((item) => (
            <li key={item.key} className="flex">
              <NavLink
                to={href(item)}
                aria-label={accessibleLabel(item)}
                className={({ isActive }) =>
                  `kf-press flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-kf px-3 py-2 text-center text-lg leading-tight font-bold transition-colors duration-150 ${
                    isActive
                      ? 'bg-primary text-on-primary'
                      : 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-kf-surface-2'
                  }`
                }
              >
                <item.icon aria-hidden="true" className="size-6 shrink-0" />
                <span>{t(`nav.${item.key}`)}</span>
                {item.showsUnread && <UnreadBubble count={unreadCount} />}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main
        id="main"
        tabIndex={-1}
        className="w-full px-4 pt-6 pb-12 outline-none sm:px-6 md:pt-8 lg:px-8"
      >
        <PageContent>{children}</PageContent>
      </main>
    </ShellFrame>
  );
}
