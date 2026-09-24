import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Toaster } from '../../components/ui/Toaster';
import i18n from '../../i18n';
import { renderWithRouter } from '../../test/renderWithRouter';
import { useAlertsStore } from './alertsStore';
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

describe('Alerts dashboard', () => {
  beforeEach(() => {
    useAlertsStore.setState({
      status: { worker: 'loading', business: 'loading' },
      alerts: { worker: [], business: [] },
    });
  });
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a loading placeholder, then alerts grouped Urgent, Important, For later', async () => {
    renderAlerts();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    const groups = await screen.findAllByRole('heading', { level: 2 });
    expect(groups.map((h) => h.textContent)).toEqual([
      expect.stringMatching(/^Urgent/),
      expect.stringMatching(/^Important/),
      expect.stringMatching(/^For later/),
    ]);
  });

  it('shows priority as a word, not only a colour', async () => {
    renderAlerts();
    const urgent = await screen.findByRole('region', { name: /Urgent/ });
    expect(within(urgent).getAllByRole('button')[0]).toHaveTextContent('Urgent');
  });

  it('filters to unread alerts', async () => {
    renderAlerts();
    await userEvent.click(await screen.findByRole('button', { name: 'Unread' }));

    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Tips for a strong profile')).not.toBeInTheDocument();
  });

  it('opens the details, moves focus there and marks the alert as read', async () => {
    renderAlerts();
    expect(await screen.findByText('You have 4 unread alerts.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Warehouse packers needed today/ }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Warehouse packers needed today' }),
    ).toHaveFocus();
    expect(screen.getByRole('button', { name: 'View job' })).toBeInTheDocument();
    expect(screen.getByText('You have 3 unread alerts.')).toBeInTheDocument();
  });

  it('"Not important to me" hides the alert, and Undo brings it back', async () => {
    renderAlerts();
    await userEvent.click(
      await screen.findByRole('button', { name: /New message from Pwani Events/ }),
    );
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

  it('keeps long "For later" lists short until the user asks for more', async () => {
    renderAlerts();
    const showMore = await screen.findByRole('button', { name: 'Show 2 more' });
    expect(showMore).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Holiday opening hours')).not.toBeInTheDocument();

    await userEvent.click(showMore);
    expect(await screen.findByText('Holiday opening hours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('gives employers the right main action', async () => {
    renderAlerts('business');
    await userEvent.click(
      await screen.findByRole('button', { name: /new applicants for "Warehouse packers"/ }),
    );
    expect(await screen.findByRole('button', { name: 'View applicants' })).toBeInTheDocument();
  });

  it('shows Kiswahili text when the language is sw', async () => {
    await i18n.changeLanguage('sw');
    renderAlerts();
    await screen.findByRole('button', { name: 'Zote' }); // wait until loaded
    expect(screen.getByRole('heading', { level: 1, name: 'Arifa' })).toBeInTheDocument();
    expect(screen.getAllByText('Dharura').length).toBeGreaterThan(0);
  });
});
