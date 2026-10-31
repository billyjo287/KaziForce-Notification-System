import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter } from '../../test/renderWithRouter';
import { ADMIN_NAV } from './adminNav';
import { AppShell } from './AppShell';
import { WorkerShell } from './WorkerShell';
import { NAV } from './navConfig';

describe('AppShell', () => {
  it('worker menu: big buttons across the top, unread count spoken, the bell wiggles for "Act now"', () => {
    renderWithRouter(
      <WorkerShell unreadCount={3} urgentCount={1}>
        <p>page</p>
      </WorkerShell>,
      '/worker/alerts',
    );
    // One menu on every screen size (no sidebar, no bottom bar).
    const menus = screen.getAllByRole('navigation', { name: 'Main menu' });
    expect(menus).toHaveLength(1);
    const links = within(menus[0]!).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Home',
      'Find jobs',
      'Alerts 3 unread',
      'Messages',
      'Daily summary',
      'Alert settings',
    ]);
    expect(links[2]).toHaveAttribute('aria-current', 'page');
    // The bell in the top bar goes to Alerts too, and wiggles while something needs acting on.
    const bell = screen.getAllByRole('link', { name: 'Alerts 3 unread' })[0]!;
    expect(bell.querySelector('svg')).toHaveClass('kf-wiggle');
  });

  it('the bell stays still when nothing needs acting on now', () => {
    renderWithRouter(
      <WorkerShell unreadCount={2} urgentCount={0}>
        <p>page</p>
      </WorkerShell>,
      '/worker/home',
    );
    const bell = screen.getAllByRole('link', { name: 'Alerts 2 unread' })[0]!;
    expect(bell.querySelector('svg')).not.toHaveClass('kf-wiggle');
  });

  it('employer menu: Home first, "My jobs", the Employer pill and "Post a job" at hand', () => {
    renderWithRouter(
      <AppShell role="business" nav={NAV.business} unreadCount={0}>
        <p>page</p>
      </AppShell>,
      '/employer/home',
    );
    const [sidebar, bottomBar] = screen.getAllByRole('navigation', { name: 'Main menu' });
    expect(
      within(sidebar!)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Alerts', 'My jobs', 'Messages', 'Settings']);
    // Phones: 3 pages and "More" (Messages, Settings).
    expect(within(bottomBar!).getAllByRole('listitem')).toHaveLength(4);
    expect(within(bottomBar!).getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Post a job' })).toHaveAttribute(
      'href',
      '/employer/jobs/new',
    );
    expect(screen.getAllByText('Employer').length).toBeGreaterThan(0);
  });

  it('admin phone menu keeps 4 items and puts the rest behind "More"', async () => {
    renderWithRouter(
      <AppShell role="admin" nav={ADMIN_NAV} unreadCount={0}>
        <p>page</p>
      </AppShell>,
      '/admin/overview',
    );
    const bottomBar = screen.getAllByRole('navigation', { name: 'Main menu' })[1]!;
    expect(within(bottomBar).getAllByRole('listitem')).toHaveLength(4);

    await userEvent.click(within(bottomBar).getByRole('button', { name: 'More' }));
    // The menu's code downloads on first open, which can take a moment.
    const dialog = await screen.findByRole('dialog', { name: 'More pages' }, { timeout: 25_000 });
    expect(within(dialog).getByRole('link', { name: 'Delivery logs' })).toBeInTheDocument();
    // The lazy download can be slow when the whole test suite runs at once (12 s seen).
  }, 30_000);
});
