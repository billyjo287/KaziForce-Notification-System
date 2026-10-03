import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../../components/ui/Toaster';
import { api } from '../../lib/api';
import { renderWithRouter } from '../../test/renderWithRouter';
import { ApplicantDelivery, JobAlertReach } from '../employer/DeliveryStatus';
import type { Overview, SpamItem } from './adminApi';
import AnnouncementsPage from './AnnouncementsPage';
import DeliveryLogsPage from './DeliveryLogsPage';
import OverviewPage from './OverviewPage';
import SpamReviewPage from './SpamReviewPage';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const rate = (channel: string, delivered: number, failed: number, pending = 0) => ({
  channel,
  delivered,
  failed,
  pending,
  rate: delivered + failed ? delivered / (delivered + failed) : null,
});

const overview: Overview = {
  generatedAt: new Date().toISOString(),
  channels: {
    last24h: [
      rate('in_app', 200, 0),
      rate('whatsapp', 45, 5),
      rate('sms', 0, 0),
      rate('email', 9, 1, 2),
    ] as Overview['channels']['last24h'],
    last7d: [
      rate('in_app', 1400, 0),
      rate('whatsapp', 300, 20),
      rate('sms', 10, 0),
      rate('email', 60, 4),
    ] as Overview['channels']['last7d'],
  },
  today: { notifications: 1234, spamBlocked: 3, failedDeliveries: 6 },
  spamWaiting: 2,
  heldNow: 4,
  queues: [
    { name: 'notifications', waiting: 1, scheduled: 0, failed: 0 },
    { name: 'escalation', waiting: 0, scheduled: 7, failed: 0 },
  ],
  recentFailures: [
    {
      id: 'f1',
      channel: 'whatsapp',
      error: 'Twilio: 63016 outside the 24-hour window',
      at: new Date().toISOString(),
      notification: { id: 'n1', title: 'Warehouse packers needed today' },
    },
  ],
};

describe('admin overview', () => {
  beforeEach(() => vi.mocked(api.get).mockReset());

  it('big numbers, one meter per channel with the value written out, queues and failures', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: overview });
    renderWithRouter(<OverviewPage />);

    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('Waiting for spam review').closest('li')).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Review them' })).toHaveAttribute(
      'href',
      '/admin/spam',
    );

    const whatsapp = screen.getByRole('meter', { name: 'WhatsApp: 90% got through' });
    expect(whatsapp).toHaveAttribute('aria-valuenow', '90');
    expect(screen.getByText('45 of 50 got through · 5 failed')).toBeInTheDocument();
    expect(screen.getByText('9 of 10 got through · 1 failed · 2 still trying')).toBeInTheDocument();
    // Nothing sent on SMS: no meter, plain words instead.
    expect(screen.getByText('Nothing sent yet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Last 7 days' }));
    expect(screen.getByRole('meter', { name: 'WhatsApp: 94% got through' })).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('rowheader', { name: 'Urgent safety-net checks' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Twilio: 63016 outside the 24-hour window')).toBeInTheDocument();
  });

  it('says so in plain words when Redis cannot be read, and still shows the rest', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...overview, queues: null } });
    renderWithRouter(<OverviewPage />);
    expect(
      await screen.findByText('We could not read the queues. Check that Redis is running.'),
    ).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });
});

const spam: SpamItem = {
  id: 's1',
  type: 'message',
  title: 'New message',
  message: 'CONGRATULATIONS!!! Send KSh 500 registration fee NOW!!!',
  sender: { id: 'e1', name: 'Quick Events' },
  recipient: { id: 'w1', name: 'Faith Njeri' },
  spamScore: 0.97,
  predictedPriority: 'low',
  modelVersion: 'rules-v0',
  predictionSource: 'rules',
  explanation: [{ feature: 'payment_request', weight: 0.6 }],
  createdAt: new Date().toISOString(),
};

describe('spam review', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockResolvedValue({
      data: { items: [spam], total: 1, page: 1, pageSize: 20 },
    });
    vi.mocked(api.post).mockResolvedValue({ data: { ok: true } });
  });

  it('shows why it was blocked; "Yes, it is spam" confirms the block', async () => {
    renderWithRouter(
      <>
        <SpamReviewPage />
        <Toaster />
      </>,
    );
    expect(await screen.findByText(spam.message)).toBeInTheDocument();
    expect(screen.getByText('Spam score: 97%')).toBeInTheDocument();
    expect(screen.getByText(/Why: payment request/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, it is spam' }));
    expect(api.post).toHaveBeenCalledWith('/admin/review/spam/s1/confirm');
    expect(await screen.findByText('Kept blocked. Thank you.')).toBeInTheDocument();
  });

  it('"Not spam" asks for the priority, then delivers it', async () => {
    renderWithRouter(
      <>
        <SpamReviewPage />
        <Toaster />
      </>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Not spam: deliver it' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Deliver “New message” to Faith Njeri?',
    });
    // Starts on what the classifier said ("For later"); each choice has one line of help.
    expect(within(dialog).getByRole('radio', { name: /For later/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: /Important/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deliver now' }));
    expect(api.post).toHaveBeenCalledWith('/admin/review/spam/s1/release', { priority: 'medium' });
    expect(await screen.findByText('Delivered to Faith Njeri.')).toBeInTheDocument();
  });
});

describe('announcements', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockImplementation(async (_url, config) => ({
      data: { people: (config?.params as { audience: string }).audience === 'worker' ? 6 : 9 },
    }));
    vi.mocked(api.post).mockResolvedValue({ data: { announcementId: 'a1' } });
  });

  it('shows the reach and a live preview, checks the fields, and asks once before sending', async () => {
    renderWithRouter(
      <>
        <AnnouncementsPage />
        <Toaster />
      </>,
    );
    expect(await screen.findByRole('button', { name: 'Send to 9 people' })).toBeEnabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Workers only' }));
    expect(await screen.findByRole('button', { name: 'Send to 6 people' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Who should get it?' })).toHaveAccessibleDescription(
      'Reaches 6 people.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Send to 6 people' }));
    expect(screen.getAllByText('Please fill this in.')).toHaveLength(2);
    expect(api.post).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Title'), 'Office closed on Friday');
    await userEvent.type(screen.getByLabelText('Message'), 'We are back on Monday.');
    // The preview is the real alert card.
    const preview = screen.getByRole('region', { name: 'Preview: how it will look' });
    expect(preview).toHaveTextContent('Office closed on Friday');
    expect(preview).toHaveTextContent('For later');
    expect(screen.getByText('978 characters left')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send to 6 people' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send this announcement?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send it' }));
    expect(api.post).toHaveBeenCalledWith('/admin/announcements', {
      audience: 'worker',
      title: 'Office closed on Friday',
      message: 'We are back on Monday.',
    });
    expect(await screen.findByText('Sent. It is on its way.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });
});

describe('delivery logs', () => {
  it('filters come from the address and go to the API', async () => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 20 } });
    renderWithRouter(<DeliveryLogsPage />, '/admin/delivery-logs?status=failed&channel=sms');
    expect(await screen.findByText('No deliveries match these filters')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/admin/delivery-logs', {
      params: { channel: 'sms', status: 'failed', from: undefined, to: undefined, page: 1 },
    });
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });
});

describe('employer: who got the job alert', () => {
  it('totals only, with a "seen by" meter; each applicant shows what they saw', () => {
    renderWithRouter(
      <>
        <JobAlertReach
          jobAlert={{ total: 12, seen: 8, delivered: 2, sent: 1, waiting: 0, not_delivered: 1 }}
        />
        <ApplicantDelivery status={{ statusUpdate: 'seen', message: 'delivered' }} />
      </>,
    );
    expect(screen.getByRole('meter', { name: 'Seen by 8 of 12 workers' })).toHaveAttribute(
      'aria-valuenow',
      '8',
    );
    expect(screen.getByText('Delivered, not opened yet').closest('li')).toHaveTextContent('2');
    expect(screen.queryByText('Waiting to be sent')).not.toBeInTheDocument();
    expect(screen.getByText('Your latest update: seen')).toBeInTheDocument();
    expect(screen.getByText('Your last message: delivered, not opened yet')).toBeInTheDocument();
  });
});
