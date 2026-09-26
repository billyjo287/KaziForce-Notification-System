import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { useSettings } from '../../stores/settings';
import { renderWithRouter } from '../../test/renderWithRouter';
import type { User } from '../../types/api';
import { ThemeButtons } from '../ThemeButtons';
import { AppShell } from './AppShell';
import WelcomeBanner from './WelcomeBanner';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api: { post: vi.fn() },
}));

const wanjiru = { id: 'u1', name: 'Wanjiru Kamau', role: 'worker', language: 'en' } as User;

describe('theme buttons', () => {
  afterEach(() => useSettings.setState({ theme: 'system' }));

  it('"Dark" switches dark mode on and off; "Device" follows the phone or computer', async () => {
    renderWithRouter(<ThemeButtons />);
    const dark = screen.getByRole('button', { name: 'Dark' });
    const device = screen.getByRole('button', { name: 'Device' });
    expect(device).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await userEvent.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(device).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(dark);
    expect(document.documentElement.dataset.theme).toBe('light');

    await userEvent.click(device);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('welcome message after logging in', () => {
  beforeEach(() => useAuth.setState({ user: wanjiru, justLoggedIn: true }));

  it('greets the person, then slides away after 5 seconds', () => {
    vi.useFakeTimers();
    try {
      renderWithRouter(<WelcomeBanner />);
      expect(screen.getByRole('status')).toHaveTextContent('Welcome back, Wanjiru!');
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole('status')).toHaveClass('kf-leave');
      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(useAuth.getState().justLoggedIn).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be closed early', async () => {
    renderWithRouter(<WelcomeBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument();
  });
});

describe('log out on every page', () => {
  it('the app frame has a Log out button that logs out and goes to the log-in page', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    useAuth.setState({ status: 'user', user: wanjiru, accessToken: 'token', justLoggedIn: false });
    const { router } = renderWithRouter(
      <AppShell role="worker" unreadCount={0}>
        <p>page</p>
      </AppShell>,
      '/worker/jobs',
    );
    // One in the phone top bar and one in the sidebar; CSS shows one at a time.
    const [button] = screen.getAllByRole('button', { name: 'Log out' });
    await userEvent.click(button!);

    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(useAuth.getState()).toMatchObject({ status: 'guest', notice: 'loggedOut' });
  });
});
