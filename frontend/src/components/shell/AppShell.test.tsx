import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter } from '../../test/renderWithRouter';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('worker menu has Alerts, Jobs, Messages and Settings, with the unread count spoken', () => {
    renderWithRouter(
      <AppShell role="worker" unreadCount={3}>
        <p>page</p>
      </AppShell>,
      '/worker/alerts',
    );
    // Two menus exist (sidebar and phone bottom bar); CSS shows one at a time.
    const [menu] = screen.getAllByRole('navigation', { name: 'Main menu' });
    const links = within(menu!).getAllByRole('link');

    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Alerts, 3 unread',
      'Jobs',
      'Messages',
      'Settings',
    ]);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
  });

  it('employer menu says "My jobs"', () => {
    renderWithRouter(
      <AppShell role="business" unreadCount={0}>
        <p>page</p>
      </AppShell>,
      '/employer/alerts',
    );
    expect(screen.getAllByRole('link', { name: 'My jobs' }).length).toBeGreaterThan(0);
  });

  it('admin phone menu keeps 4 items and puts the rest behind "More"', async () => {
    renderWithRouter(
      <AppShell role="admin" unreadCount={0}>
        <p>page</p>
      </AppShell>,
      '/admin/overview',
    );
    const bottomBar = screen.getAllByRole('navigation', { name: 'Main menu' })[1]!;
    expect(within(bottomBar).getAllByRole('listitem')).toHaveLength(4);

    await userEvent.click(within(bottomBar).getByRole('button', { name: 'More' }));
    const dialog = screen.getByRole('dialog', { name: 'More pages' });
    expect(within(dialog).getByRole('link', { name: 'Delivery logs' })).toBeInTheDocument();
  });
});
