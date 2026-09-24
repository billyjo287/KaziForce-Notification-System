import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { Toaster } from '../../components/ui/Toaster';
import { startLiveConnection, useLiveStatus, type LiveHandlers } from '../../lib/liveConnection';
import { renderWithRouter } from '../../test/renderWithRouter';
import type { ApiNotification } from '../../types/api';
import { ALERTS_KEY, addLiveAlert, toAlert } from './useAlerts';
import { useLiveAlerts } from './useLiveAlerts';

// The real connection needs a server; this stand-in hands the test the event handlers.
vi.mock('../../lib/liveConnection', async (original) => ({
  ...(await original<typeof import('../../lib/liveConnection')>()),
  startLiveConnection: vi.fn(() => () => {}),
}));

const incoming: ApiNotification = {
  id: 'live-1',
  priority: 'medium',
  type: 'message',
  title: 'New message from Mwangi Logistics',
  body: 'Please come to Gate B.',
  link: '/worker/messages/app-1',
  sender: 'Mwangi Logistics',
  createdAt: new Date().toISOString(),
  readAt: null,
  deadlineAt: null,
  location: null,
  markedNotImportant: false,
};

function Live() {
  useLiveAlerts('worker');
  return (
    <>
      <OfflineBanner />
      <Toaster />
    </>
  );
}

function handlers(): LiveHandlers {
  return vi.mocked(startLiveConnection).mock.calls.at(-1)![0];
}

describe('live alerts', () => {
  beforeEach(() => {
    vi.mocked(startLiveConnection).mockClear();
    useLiveStatus.setState({ status: 'off' });
  });

  it('adds a new alert to the top of the list once, marked as live', () => {
    const existing = [toAlert({ ...incoming, id: 'old' })];
    const added = addLiveAlert(existing, toAlert(incoming))!;
    expect(added.map((a) => a.id)).toEqual(['live-1', 'old']);
    expect(added[0]!.arrivedLive).toBe(true);
    // Arriving twice (e.g. two reconnects) does not duplicate it.
    expect(addLiveAlert(added, toAlert(incoming))).toBe(added);
    // Not loaded yet: the first fetch will include it.
    expect(addLiveAlert(undefined, toAlert(incoming))).toBeUndefined();
  });

  it('puts live alerts in the list and shows a message with "Open" on other pages', async () => {
    const { queryClient, router } = renderWithRouter(<Live />, '/worker/jobs');
    queryClient.setQueryData(ALERTS_KEY, []);

    act(() => handlers().onNotification(incoming));

    expect(queryClient.getQueryData<{ id: string }[]>(ALERTS_KEY)?.[0]?.id).toBe('live-1');
    expect(
      await screen.findByText('New Important alert: New message from Mwangi Logistics', {
        exact: true,
      }),
    ).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Open' }).click());
    expect(router.state.location.pathname).toBe('/worker/alerts');
    expect(router.state.location.search).toBe('?open=live-1');
  });

  it('stays quiet for "For later" alerts', () => {
    renderWithRouter(<Live />, '/worker/jobs');
    act(() => handlers().onNotification({ ...incoming, id: 'low-1', priority: 'low' }));
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('shows no message on the Alerts page itself (the alert slides into the list)', () => {
    renderWithRouter(<Live />, '/worker/alerts');
    act(() => handlers().onNotification(incoming));
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('fetches the list again after (re)connecting, to catch up on anything missed', () => {
    const { queryClient } = renderWithRouter(<Live />, '/worker/alerts');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    act(() => handlers().onConnect());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ALERTS_KEY });
  });

  it('shows the reconnecting banner while the live connection is down', () => {
    renderWithRouter(<Live />, '/worker/alerts');
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument();
    act(() => useLiveStatus.setState({ status: 'reconnecting' }));
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });
});
