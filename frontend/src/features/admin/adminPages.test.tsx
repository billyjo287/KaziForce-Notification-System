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
import NotificationRulesPage from './NotificationRulesPage';
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
  summaries: { sent: 12, failed: 1 },
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
    // Summary emails are counted too (BT-09).
    expect(screen.getByText('Summary emails sent (last 24 hours)').closest('li')).toHaveTextContent(
      '12',
    );
    expect(
      screen.getByText('Summary emails that failed (last 24 hours)').closest('li'),
    ).toHaveTextContent('1');
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
    // Blocked alerts, and (separately) job posts held by the scam check.
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data:
        url === '/admin/review/jobs'
          ? { items: heldJobs }
          : { items: [spam], total: 1, page: 1, pageSize: 20 },
    }));
    vi.mocked(api.post).mockResolvedValue({ data: { ok: true } });
    heldJobs = [];
  });

  let heldJobs: object[] = [];

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
    expect(
      await screen.findByText('Blocked. That one won’t bother anyone again.'),
    ).toBeInTheDocument();
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
    // Starts on what the classifier said ("When you're free"); each choice has one line of help.
    expect(within(dialog).getByRole('radio', { name: /When you're free/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: /Check today/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deliver now' }));
    expect(api.post).toHaveBeenCalledWith('/admin/review/spam/s1/release', { priority: 'medium' });
    expect(await screen.findByText('Delivered to Faith Njeri.')).toBeInTheDocument();
  });

  it('job posts held by the scam check come first; "remove it" and "publish it"', async () => {
    heldJobs = [
      {
        id: 'j1',
        title: 'Warehouse packers',
        description: 'Send 500ksh to secure the Job!!!! Send money on my M-Pesa: 0700030367',
        pay: 'KSh 1,200',
        location: 'Embu',
        employer: { id: 'e1', name: 'Mwangi Logistics' },
        spamScore: 1,
        explanation: [
          { feature: 'direct_message', weight: 0.7 },
          { feature: 'spam:mobile_money_number', weight: 0.45 },
        ],
        createdAt: new Date().toISOString(),
      },
    ];
    renderWithRouter(
      <>
        <SpamReviewPage />
        <Toaster />
      </>,
    );
    const section = await screen.findByRole('region', { name: '1 job post waiting for a check' });
    expect(within(section).getByText('Job post: Warehouse packers')).toBeInTheDocument();
    expect(within(section).getByText(/Why: mobile money number/)).toBeInTheDocument();
    await userEvent.click(
      within(section).getByRole('button', { name: 'Yes, it is a scam: remove it' }),
    );
    expect(api.post).toHaveBeenCalledWith('/admin/review/jobs/j1/remove');
    expect(await screen.findByText('Removed. The employer sees why.')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Not a scam: publish it' }));
    expect(api.post).toHaveBeenCalledWith('/admin/review/jobs/j1/publish');
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
    expect(preview).toHaveTextContent("When you're free");
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

describe('notification rules (ADR 0016)', () => {
  const wordingRow = (urgent: boolean, text: string | null) => ({
    category: 'new_job',
    language: 'en',
    urgent,
    defaultText: urgent ? 'An urgent job near you' : 'A new job near you',
    text,
    version: text ? 2 : 0,
    updatedAt: text ? '2026-11-03T09:00:00Z' : null,
    updatedBy: text ? 'Admin' : null,
  });

  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url) =>
      url === '/admin/notification-policy'
        ? {
            data: {
              dailyTextLimit: null,
              choices: [null, 3, 5, 10],
              updatedAt: null,
              updatedBy: null,
            },
          }
        : url === '/admin/notification-rules'
          ? {
              data: {
                items: [
                  { category: 'new_job', mandatory: false, updatedAt: null, updatedBy: null },
                  { category: 'announcement', mandatory: true, updatedAt: null, updatedBy: null },
                ],
              },
            }
          : {
              data: {
                items: [wordingRow(false, null), wordingRow(true, 'Urgent: a job close by')],
              },
            },
    );
    vi.mocked(api.post).mockResolvedValue({ data: { version: 1 } });
  });

  it('"Always send" switches save at once (FR-NOT-035)', async () => {
    const put = vi.fn().mockResolvedValue({ data: {} });
    (api as unknown as { put: typeof put }).put = put;
    renderWithRouter(
      <>
        <NotificationRulesPage />
        <Toaster />
      </>,
    );
    expect(await screen.findByRole('switch', { name: 'News from KaziForce' })).toBeChecked();
    await userEvent.click(screen.getByRole('switch', { name: 'New jobs' }));
    expect(put).toHaveBeenCalledWith('/admin/notification-rules/new_job', { mandatory: true });
    expect(await screen.findByText('“New jobs” is now always sent.')).toBeInTheDocument();
  });

  it('"For everyone": the daily SMS and WhatsApp limit saves at once (FR-NOT-034)', async () => {
    const put = vi.fn().mockResolvedValue({ data: {} });
    (api as unknown as { put: typeof put }).put = put;
    renderWithRouter(
      <>
        <NotificationRulesPage />
        <Toaster />
      </>,
    );
    const select = await screen.findByRole('combobox', {
      name: 'Most SMS and WhatsApp messages per person per day',
    });
    expect(select).toHaveTextContent('No limit');
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole('option', { name: '5 a day' }));
    expect(put).toHaveBeenCalledWith('/admin/notification-policy', { dailyTextLimit: 5 });
    expect(
      await screen.findByText(
        'Now at most 5 SMS and WhatsApp messages a day per person (urgent alerts always go).',
      ),
    ).toBeInTheDocument();
  });

  it('wording: live SMS preview, 80-character limit, new version, back to default (FR-NOT-003/011)', async () => {
    renderWithRouter(
      <>
        <NotificationRulesPage />
        <Toaster />
      </>,
    );
    const normal = await screen.findByRole('heading', { level: 3, name: 'Normal alerts' });
    const form = normal.closest('form')!;
    const line = within(form).getByLabelText('The line');
    await userEvent.clear(line);
    await userEvent.type(line, 'A job near you today');
    expect(
      within(form).getByText(
        'KaziForce: A job near you today. Open: https://api.kaziforce.co.ke/o/k7Qp2xZa',
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Save new version' }));
    expect(api.post).toHaveBeenCalledWith('/admin/wording', {
      category: 'new_job',
      language: 'en',
      urgent: false,
      text: 'A job near you today',
    });

    await userEvent.type(line, ' '.padEnd(70, 'x'));
    expect(within(form).getByText(/Use at most 80 characters/)).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Save new version' })).toBeDisabled();

    // The urgent one has saved wording: it can go back to the built-in line.
    const urgent = screen
      .getByRole('heading', { level: 3, name: '“Act now” alerts' })
      .closest('form')!;
    expect(within(urgent).getByText(/Version 2, saved by Admin/)).toBeInTheDocument();
    await userEvent.click(
      within(urgent).getByRole('button', { name: 'Back to the built-in wording' }),
    );
    expect(api.post).toHaveBeenLastCalledWith('/admin/wording', {
      category: 'new_job',
      language: 'en',
      urgent: true,
      text: null,
    });
  });
});
