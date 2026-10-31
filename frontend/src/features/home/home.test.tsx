import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { createNotifications } from '../../test/fixtures/notifications';
import { renderWithRouter } from '../../test/renderWithRouter';
import type { User } from '../../types/api';
import DailySummaryPage from './DailySummaryPage';
import EmployerHomePage from './EmployerHomePage';
import WorkerHomePage from './WorkerHomePage';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  apiErrorCode: () => 'generic',
}));

const westlands = { id: 'loc-1', slug: 'westlands', name: 'Westlands', county: 'Nairobi' };
const wanjiru = {
  id: 'u1',
  name: 'Wanjiru Kamau',
  role: 'worker',
  language: 'en',
  location: westlands,
} as unknown as User;

const job = {
  id: 'j1',
  title: 'Shop assistant for the weekend',
  description: 'Help in the shop.',
  pay: 'KSh 1,000 per day',
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
  urgent: false,
  status: 'open',
  removedReason: null,
  location: westlands,
  skill: { id: 's1', slug: 'retail', nameEn: 'Retail', nameSw: 'Rejareja' },
  employer: { id: 'e1', name: 'Duka Bora' },
  createdAt: new Date().toISOString(),
  myApplication: { id: 'a1', status: 'received' },
};

beforeEach(() => {
  useAuth.setState({ user: wanjiru });
  vi.mocked(api.get).mockImplementation(async (url: string) =>
    url === '/notifications'
      ? { data: { items: createNotifications() } }
      : { data: { items: [job], total: 1, page: 1, pageSize: 20 } },
  );
});

describe('Worker home', () => {
  it('greets by first name and shows what needs them now, with the time left', async () => {
    renderWithRouter(<WorkerHomePage />, '/worker/home');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Habari, Wanjiru!');
    const needsYou = await screen.findByRole('region', { name: 'Needs you now' });
    expect(within(needsYou).getByText('Warehouse packers needed today')).toBeVisible();
    expect(within(needsYou).getAllByText(/^Closes in \d+:\d\d:\d\d$/).length).toBeGreaterThan(0);
    expect(
      within(needsYou).getByRole('link', { name: 'Open: Warehouse packers needed today' }),
    ).toHaveAttribute('href', '/worker/alerts?open=a1');
  });

  it('counts what is waiting per level, and lists jobs in their place', async () => {
    renderWithRouter(<WorkerHomePage />, '/worker/home');
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' });
    expect(within(waiting).getByText('Act now')).toBeVisible();
    expect(await screen.findByText('Open jobs in Westlands')).toBeVisible();
    expect(
      await screen.findByRole('link', { name: 'Shop assistant for the weekend' }),
    ).toBeVisible();
    // Applied jobs say so, kindly.
    expect(screen.getByText('Fingers crossed for you')).toBeVisible();
    expect(api.get).toHaveBeenCalledWith('/jobs', { params: { locationId: 'loc-1' } });
  });
});

describe('Daily summary', () => {
  it('lists only the "When you\'re free" alerts of the last 7 days, by day', async () => {
    renderWithRouter(<DailySummaryPage />, '/worker/summary');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Daily summary');
    const lows = createNotifications().filter((n) => n.priority === 'low');
    await screen.findAllByText("When you're free");
    for (const n of lows) {
      const old = Date.now() - new Date(n.createdAt).getTime() > 7 * 86_400_000;
      if (old || n.markedNotImportant) continue;
      expect(screen.getByRole('link', { name: n.title })).toHaveAttribute(
        'href',
        `/worker/alerts?open=${n.id}`,
      );
    }
    // Nothing from the other levels.
    expect(screen.queryByText('Warehouse packers needed today')).not.toBeInTheDocument();
  });

  it('a quiet week says so', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [] } });
    renderWithRouter(<DailySummaryPage />, '/worker/summary');
    expect(await screen.findByText('Quiet day.')).toBeVisible();
  });
});

describe('Employer home', () => {
  const amina = { id: 'e1', name: 'Amina Hassan', role: 'business', language: 'en' } as User;
  const jobs = [
    { ...job, id: 'j1', urgent: true, applicantCount: 4, newApplicantCount: 2 },
    { ...job, id: 'j2', title: 'Cleaner for one day', applicantCount: 1, newApplicantCount: 0 },
    { ...job, id: 'j3', title: 'Old job', status: 'closed', applicantCount: 3 },
  ];

  beforeEach(() => {
    useAuth.setState({ user: amina });
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url === '/notifications'
        ? { data: { items: createNotifications() } }
        : { data: { items: jobs } },
    );
  });

  it('greets, counts what is waiting and lists the jobs with their state', async () => {
    renderWithRouter(<EmployerHomePage />, '/employer/home');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Habari, Amina!');
    expect(await screen.findByText('2 new applicants are waiting for your answer.')).toBeVisible();
    // Screen readers get the real numbers (the counting is only drawn).
    const counts = screen.getByRole('region', { name: 'Your jobs in numbers' });
    expect(within(counts).getByText('Open jobs').parentElement).toHaveTextContent('2');
    expect(within(counts).getByText('All applicants').parentElement).toHaveTextContent('8');

    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('link', { name: 'Shop assistant for the weekend' }),
    ).toHaveAttribute('href', '/employer/jobs/j1');
    expect(within(table).getByText('Needs workers soon')).toBeVisible();
    expect(within(table).getByText('Closed')).toBeVisible();

    const fresh = screen.getByRole('region', { name: 'New applicants' });
    expect(within(fresh).getAllByRole('link')).toHaveLength(1);
  });

  it('no jobs yet: one clear way to post the first', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url === '/notifications' ? { data: { items: [] } } : { data: { items: [] } },
    );
    renderWithRouter(<EmployerHomePage />, '/employer/home');
    expect(await screen.findByText('You have not posted a job yet')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Post a job' }).length).toBeGreaterThan(0);
  });
});
