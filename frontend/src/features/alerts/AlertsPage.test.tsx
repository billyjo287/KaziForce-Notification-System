import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../../components/ui/Toaster';
import i18n from '../../i18n';
import { renderWithRouter } from '../../test/renderWithRouter';
import { api } from '../../lib/api';
import { createNotifications } from '../../test/fixtures/notifications';
import { AlertsPage } from './AlertsPage';
import type { AlertRole } from './types';

function renderAlerts(role: AlertRole = 'worker') {
  return renderWithRouter(
    <>
      <AlertsPage role={role} />
      <Toaster />
    </>,
  );
}

// The API client is replaced by a stand-in that returns sample alerts.
vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
  apiErrorCode: () => 'generic',
}));

describe('Alerts dashboard', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: createNotifications() } });
    vi.mocked(api.patch).mockResolvedValue({ data: { items: [] } });
  });
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a loading placeholder, then one tab per category, opening on Urgent', async () => {
    renderAlerts();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Urgent2 new',
      'Important1 new',
      'For later1 new',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('shows priority as a word, not only a colour', async () => {
    renderAlerts();
    const panel = await screen.findByRole('tabpanel', { name: /Urgent/ });
    expect(within(panel).getAllByRole('button', { name: /Warehouse/ })[0]).toHaveTextContent(
      'Urgent',
    );
  });

  it('each category has the same filters; Unread hides read alerts', async () => {
    renderAlerts();
    await userEvent.click(await screen.findByRole('tab', { name: /For later/ }));
    expect(screen.getByText('Tips for a strong profile')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Tips for a strong profile')).not.toBeInTheDocument();
    expect(screen.getByText('New job near you: Shop assistant')).toBeInTheDocument();
  });

  it('opens the details, moves focus there and marks the alert as read', async () => {
    renderAlerts();
    expect(await screen.findByText('You have 4 unread alerts.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Warehouse packers needed today/ }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Warehouse packers needed today' }),
    ).toHaveFocus();
    expect(screen.getByRole('link', { name: 'View job' })).toHaveAttribute(
      'href',
      '/worker/jobs/job-a1',
    );
    expect(screen.getByText('You have 3 unread alerts.')).toBeInTheDocument();
    // The change is saved on the server too.
    expect(api.patch).toHaveBeenCalledWith('/notifications', { ids: ['a1'], read: true });
  });

  it('"Not important to me" hides the alert, and Undo brings it back', async () => {
    renderAlerts();
    await userEvent.click(await screen.findByRole('tab', { name: /Important/ }));
    await userEvent.click(screen.getByRole('button', { name: /New message from Pwani Events/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Not important to me' }));

    expect(await screen.findByText(/Marked as not important/)).toBeInTheDocument();
    // The card fades out (200 ms) before it leaves the page.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /New message from Pwani Events/ }),
      ).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByRole('button', { name: /New message from Pwani Events/ }),
    ).toBeInTheDocument();
  });

  it('"Mark all as read" marks the whole category, and Undo reverses it', async () => {
    renderAlerts();
    expect(await screen.findByText('You have 4 unread alerts.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(screen.getByText('You have 2 unread alerts.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Urgent/ })).toHaveTextContent('0 new');

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(screen.getByText('You have 4 unread alerts.')).toBeInTheDocument();
  });

  it('gives employers the right main action', async () => {
    renderAlerts('business');
    await userEvent.click(await screen.findByRole('button', { name: /You got the job/ }));
    expect(await screen.findByRole('link', { name: 'View applicants' })).toBeInTheDocument();
  });

  it('shows Kiswahili text when the language is sw', async () => {
    await i18n.changeLanguage('sw');
    renderAlerts();
    await screen.findByRole('button', { name: 'Zote' }); // wait until loaded
    expect(screen.getByRole('heading', { level: 1, name: 'Arifa' })).toBeInTheDocument();
    expect(screen.getAllByText('Dharura').length).toBeGreaterThan(0);
  });
});
