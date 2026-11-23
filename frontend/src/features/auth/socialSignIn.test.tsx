import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { renderWithRouter } from '../../test/renderWithRouter';
import LoginPage from './LoginPage';
import { SocialSignIn } from './SocialSignIn';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: { post: vi.fn(), get: vi.fn() } };
});

beforeEach(() => {
  useAuth.setState({ status: 'guest', user: null, accessToken: null, notice: null });
  vi.mocked(api.get).mockReset();
  localStorage.clear();
});

describe('Continue with Google / GitHub', () => {
  it('shows a button for each provider the server offers, with the role for sign-up', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { providers: ['google', 'github'] } });
    renderWithRouter(<SocialSignIn intent="signup" role="business" />);

    const google = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(google.getAttribute('href')).toMatch(
      /\/api\/auth\/oauth\/google\/start\?intent=signup&lang=en&role=business$/,
    );
    expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
  });

  it('shows nothing when no provider is set up', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { providers: [] } });
    renderWithRouter(<SocialSignIn intent="login" />);
    await Promise.resolve();
    expect(screen.queryByRole('link', { name: /Continue with/ })).not.toBeInTheDocument();
  });

  it('explains a failed attempt on the log-in page', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { providers: ['google'] } });
    renderWithRouter(<LoginPage />, '/login?oauth_error=cancelled');
    expect(await screen.findByText(/You stopped before finishing/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
  });
});
