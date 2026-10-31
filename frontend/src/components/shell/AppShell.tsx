import { Menu, Plus } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router';
import { useAuth } from '../../stores/auth';
import { Logo } from '../Logo';
import { ThemeToggle } from '../brand/ThemeToggle';
import { buttonClasses } from '../ui/buttonStyles';
import { initialsOf } from './initials';
import { LogOutButton } from './LogOutButton';
import type { NavItem, Role, RoleNav } from './navConfig';
import { PageContent, ShellFrame, UnreadBubble } from './shellParts';
import { useNavLinks } from './useNavLinks';

// Only the admin side has a "More" menu; its dialog code downloads when it is first opened.
const MoreMenu = lazy(() => import('./MoreMenu'));

interface AppShellProps {
  role: Role;
  /** The menu of this side (navConfig.ts; the admin's in adminNav.ts). */
  nav: RoleNav;
  unreadCount: number;
  children: ReactNode;
}

/**
 * The frame around every logged-in page for employers and admins ("side" layout): phones
 * (< 768px) get a top bar and a bottom menu with at most 4 items; tablets and up a left sidebar
 * with every page. Workers have their own frame with the menu across the top (WorkerShell.tsx).
 */
export function AppShell({ role, nav, unreadCount, children }: AppShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const { href, accessibleLabel } = useNavLinks(nav, unreadCount);

  const bottomItems = nav.items.filter((item) => nav.bottomBar.includes(item.key));
  const moreItems = nav.items.filter((item) => !nav.bottomBar.includes(item.key));
  const moreActive = moreItems.some((item) => location.pathname.startsWith(href(item)));

  return (
    <ShellFrame className="min-h-dvh md:flex">
      {/* ---------- Sidebar (tablet and desktop) ---------- */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface p-5 md:sticky md:top-0 md:flex md:h-dvh">
        <Link to={nav.basePath} className="self-start rounded-lg px-2">
          <Logo />
        </Link>
        {/* Employers (design refresh): an amber "Employer" pill and "Post a job" always at hand. */}
        {role === 'business' ? (
          <>
            <span className="mt-3 mb-6 self-start rounded-full bg-kf-medium-bg px-3 py-0.5 font-bold text-kf-medium-fg">
              {t('roles.business')}
            </span>
            <Link
              to="/employer/jobs/new"
              className={buttonClasses('primary', 'md', 'kf-press mb-6 w-full')}
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
              {t('nav.postJob')}
            </Link>
          </>
        ) : (
          <span className="mb-8" />
        )}
        <nav aria-label={t('nav.label')} className="-mx-1 overflow-y-auto px-1">
          <ul className="flex flex-col gap-1">
            {nav.items.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={href(item)}
                  aria-label={accessibleLabel(item)}
                  className={({ isActive }) =>
                    `flex min-h-12 items-center gap-3 rounded-lg px-3 text-lg transition-colors duration-150 ${
                      isActive
                        ? 'bg-primary-soft font-bold text-ink'
                        : 'font-medium text-ink-muted hover:bg-canvas hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        aria-hidden="true"
                        className={`size-6 shrink-0 ${isActive ? 'text-kf-primary-text' : ''}`}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      <span className="flex-1">{t(`nav.${item.key}`)}</span>
                      {item.showsUnread && <UnreadBubble count={unreadCount} />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-3 pt-6">
          {user && (
            <div className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-3">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-kf-primary-soft font-bold text-kf-on-primary-soft"
              >
                {initialsOf(user.companyName ?? user.name)}
              </span>
              <span className="min-w-0">
                <span className="block font-bold break-words">{user.name}</span>
                <span className="block text-ink-muted">
                  {user.companyName
                    ? `${t('roles.business')} · ${user.companyName}`
                    : t(`roles.${role}`)}
                </span>
              </span>
            </div>
          )}
          <ThemeToggle />
          <LogOutButton wide />
        </div>
      </aside>

      {/* ---------- Main content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phones: logo, the light/dark toggle and Log out. It scrolls away with the page so
                it never covers what the person is reading; the menu stays at the bottom.
                Settings keeps the full choice (light, dark, same as device). */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
          <span className="flex items-center gap-2">
            <Link to={nav.basePath} className="kf-logo-link rounded-lg">
              <Logo markClassName="h-8" />
            </Link>
            {role === 'business' && (
              <span className="rounded-full bg-kf-medium-bg px-2.5 py-0.5 text-sm font-bold text-kf-medium-fg">
                {t('roles.business')}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <ThemeToggle />
            <LogOutButton />
          </span>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 md:px-8 md:pt-10 md:pb-10"
        >
          <PageContent>{children}</PageContent>
        </main>
      </div>

      {/* ---------- Bottom navigation (phones) ---------- */}
      <nav
        aria-label={t('nav.label')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {bottomItems.map((item) => (
            <li key={item.key}>
              <NavLink
                to={href(item)}
                aria-label={accessibleLabel(item)}
                className={({ isActive }) =>
                  `relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-sm ${
                    isActive ? 'font-bold text-ink' : 'font-medium text-ink-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <BottomItemContent
                    item={item}
                    active={isActive}
                    unreadCount={item.showsUnread ? unreadCount : 0}
                  />
                )}
              </NavLink>
            </li>
          ))}
          {moreItems.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={`relative flex min-h-16 w-full flex-col items-center justify-center gap-0.5 px-1 text-sm ${
                  moreActive ? 'font-bold text-ink' : 'font-medium text-ink-muted'
                }`}
              >
                <BottomItemContent
                  item={{ key: 'more', path: '', icon: Menu }}
                  active={moreActive}
                  unreadCount={0}
                />
              </button>
            </li>
          )}
        </ul>
      </nav>

      {moreItems.length > 0 && moreOpen && (
        <Suspense fallback={null}>
          <MoreMenu items={moreItems} hrefFor={href} open={moreOpen} onOpenChange={setMoreOpen} />
        </Suspense>
      )}
    </ShellFrame>
  );
}

function BottomItemContent({
  item,
  active,
  unreadCount,
}: {
  item: NavItem;
  active: boolean;
  unreadCount: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-primary"
        />
      )}
      <span className="relative">
        <item.icon
          aria-hidden="true"
          className={`size-6 ${active ? 'text-kf-primary-text' : ''}`}
          strokeWidth={active ? 2.5 : 2}
        />
      </span>
      <span>{t(`nav.${item.key}`)}</span>
      {/* After the word in reading order ("Alerts 5", matching the spoken "Alerts 5 unread":
          WCAG 2.5.3), but drawn at the icon's top right as before. */}
      {unreadCount > 0 && (
        <span className="absolute top-0.5 left-1/2">
          <UnreadBubble count={unreadCount} />
        </span>
      )}
    </>
  );
}
