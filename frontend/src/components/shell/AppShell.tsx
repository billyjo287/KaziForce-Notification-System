import { Menu, Repeat } from 'lucide-react';
import { LazyMotion, MotionConfig } from 'motion/react';
import * as m from 'motion/react-m';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router';
import { useSettings } from '../../stores/settings';
import { Logo } from '../Logo';
import { Dialog } from '../ui/Dialog';
import { OfflineBanner } from '../ui/OfflineBanner';
import { Toaster } from '../ui/Toaster';
import { NAV, type NavItem, type Role } from './navConfig';

const loadMotionFeatures = () => import('../../lib/motionFeatures').then((mod) => mod.default);

interface AppShellProps {
  role: Role;
  unreadCount: number;
  children: ReactNode;
}

function UnreadBubble({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="grid h-6 min-w-6 place-items-center rounded-full bg-urgent-bar px-1.5 text-sm font-bold text-on-urgent"
    >
      {count}
    </span>
  );
}

/**
 * The frame around every logged-in page, for all three sides.
 * Phones (< 768px): top bar + bottom menu with at most 4 items (icon + label).
 * Tablets and up: left sidebar with every page.
 */
export function AppShell({ role, unreadCount, children }: AppShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const [moreOpen, setMoreOpen] = useState(false);
  const nav = NAV[role];

  const href = (item: NavItem) => `${nav.basePath}/${item.path}`;
  const accessibleLabel = (item: NavItem) =>
    item.showsUnread && unreadCount > 0
      ? `${t(`nav.${item.key}`)}, ${t('nav.unreadCount', { count: unreadCount })}`
      : t(`nav.${item.key}`);

  const bottomItems = nav.items.filter((item) => nav.bottomBar.includes(item.key));
  const moreItems = nav.items.filter((item) => !nav.bottomBar.includes(item.key));
  const moreActive = moreItems.some((item) => location.pathname.startsWith(href(item)));

  return (
    // "user" = follow the device setting; "always" = the in-app Reduce motion switch is on.
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        <div className="min-h-dvh md:flex">
          <a
            href="#main"
            className="sr-only z-50 rounded-lg bg-surface px-4 py-3 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            {t('app.skipToContent')}
          </a>

          {/* ---------- Sidebar (tablet and desktop) ---------- */}
          <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface p-5 md:sticky md:top-0 md:flex md:h-dvh">
            <Link to={nav.basePath} className="mb-8 self-start rounded-lg px-2">
              <Logo />
            </Link>
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
                            className={`size-6 shrink-0 ${isActive ? 'text-primary' : ''}`}
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
            <div className="mt-auto rounded-lg bg-canvas px-3 py-3">
              <p className="font-bold">{nav.userName}</p>
              <p className="text-ink-muted">{t(`roles.${role}`)}</p>
              <Link
                to="/login"
                className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold text-primary underline-offset-4 hover:underline"
              >
                <Repeat aria-hidden="true" className="size-5" />
                {t('nav.switchSide')}
              </Link>
            </div>
          </aside>

          {/* ---------- Main content ---------- */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
              <Link to={nav.basePath} className="rounded-lg">
                <Logo />
              </Link>
              <Link
                to="/login"
                aria-label={t('nav.switchSide')}
                className="grid size-11 place-items-center rounded-lg text-ink-muted"
              >
                <Repeat aria-hidden="true" className="size-6" />
              </Link>
            </header>
            <main
              id="main"
              tabIndex={-1}
              className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 md:px-8 md:pt-10 md:pb-10"
            >
              <OfflineBanner />
              {/* Short fade between pages (150 ms); instant when motion is reduced. */}
              <m.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                {children}
              </m.div>
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

          {moreItems.length > 0 && (
            <Dialog open={moreOpen} onOpenChange={setMoreOpen} title={t('nav.moreTitle')}>
              <ul className="flex flex-col gap-1">
                {moreItems.map((item) => (
                  <li key={item.key}>
                    <NavLink
                      to={href(item)}
                      onClick={() => setMoreOpen(false)}
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
          )}
          <Toaster />
        </div>
      </MotionConfig>
    </LazyMotion>
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
          className={`size-6 ${active ? 'text-primary' : ''}`}
          strokeWidth={active ? 2.5 : 2}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-3">
            <UnreadBubble count={unreadCount} />
          </span>
        )}
      </span>
      <span>{t(`nav.${item.key}`)}</span>
    </>
  );
}
