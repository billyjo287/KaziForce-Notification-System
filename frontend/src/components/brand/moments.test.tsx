import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudOff } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OnboardingPage from '../../features/onboarding/OnboardingPage';
import { api } from '../../lib/api';
import { ErrorPage, NotFoundPage } from '../../pages/StatusPages';
import { useAuth } from '../../stores/auth';
import { renderWithRouter } from '../../test/renderWithRouter';
import type { User } from '../../types/api';
import { EmptyState } from '../ui/EmptyState';
import { OfflineBanner } from '../ui/OfflineBanner';
import { CardListSkeleton } from '../ui/Skeleton';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
  apiErrorCode: () => 'generic',
  refreshSession: vi.fn(),
}));

const amina = {
  id: 'u1',
  name: 'Amina Hassan',
  role: 'worker',
  language: 'en',
  phone: '+254712345678',
  phoneVerified: true,
  onboardingCompleted: false,
  preference: { preset: 'recommended', channelOrder: ['sms', 'email'] },
} as User;

afterEach(() => {
  vi.restoreAllMocks();
  useAuth.setState({ user: null, status: 'unknown' });
});

describe('moments (design refresh, Step 8)', () => {
  it('loading: one steady "Loading…" for screen readers; the hopping logo is decoration', async () => {
    render(<CardListSkeleton count={2} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Loading…/);
    // The logo and its friendly line arrive as a small separate download, hidden from readers.
    const line = await screen.findByText('Getting things ready…');
    expect(line.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('offline: the SMS promise and chip only for people who get SMS', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    useAuth.setState({ user: amina });
    const { unmount } = render(<OfflineBanner />);
    expect(screen.getByText('You’re offline. Don’t worry.')).toBeVisible();
    expect(screen.getByText(/still reach you by SMS/)).toBeVisible();
    expect(screen.getByText('SMS alerts are on')).toBeVisible();
    unmount();

    useAuth.setState({ user: { ...amina, phoneVerified: false } });
    render(<OfflineBanner />);
    expect(screen.getByText('New alerts will show up the moment you’re back.')).toBeVisible();
    expect(screen.queryByText('SMS alerts are on')).toBeNull();
  });

  it('404: a friendly heading and one way home', () => {
    renderWithRouter(<NotFoundPage />, '/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: /went for lunch/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take me home' })).toHaveAttribute('href', '/');
  });

  it('errors: announced straight away, with a warning tile that shakes once', () => {
    render(<ErrorPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something tripped on our side.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    render(<EmptyState role="alert" icon={CloudOff} title="Could not load" body="Try again." />);
    expect(document.querySelectorAll('.kf-shake')).toHaveLength(2);
  });

  it('onboarding done: "You\'re all set", then "Show me jobs"', async () => {
    useAuth.setState({ status: 'user', user: amina, accessToken: 'token' });
    vi.mocked(api.post).mockResolvedValue({
      data: { user: { ...amina, onboardingCompleted: true } },
    });
    const { router } = renderWithRouter(<OnboardingPage />, '/onboarding');
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'You’re all set, Amina!' }),
    ).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Show me jobs' }));
    expect(router.state.location.pathname).toBe('/worker/jobs');
  });
});
