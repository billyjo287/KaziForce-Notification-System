import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { renderWithRouter } from '../../test/renderWithRouter';
import RegisterPage from './RegisterPage';

// Set before RegisterPage loads (it reads the switch once).
vi.hoisted(() => vi.stubEnv('VITE_ACCOUNT_CODES', 'false'));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: { post: vi.fn(), get: vi.fn() } };
});

afterAll(() => vi.unstubAllEnvs());

describe('Sign up with codes switched off (VITE_ACCOUNT_CODES=false, for a demo)', () => {
  it('makes the account straight after the password: 4 steps, no code screens', async () => {
    vi.mocked(api.post).mockImplementation(async (url: string) => ({
      data:
        url === '/auth/check'
          ? { exists: false, kind: 'email' }
          : {
              accessToken: 'token',
              user: { id: 'u1', name: 'Amina Hassan', role: 'worker', onboardingCompleted: false },
            },
    }));
    const { router } = renderWithRouter(<RegisterPage />, '/register');
    const next = () => userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Step 1 of 4')).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: /I'm looking for work/ }));
    await next();
    await userEvent.type(screen.getByLabelText('Email address'), 'amina@example.com');
    await next();
    await userEvent.type(await screen.findByLabelText('Your full name'), 'Amina Hassan');
    await next();
    expect(screen.getByText('Step 4 of 4')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Choose a password'), 'green mango tree');
    await next();

    expect(api.post).toHaveBeenLastCalledWith('/auth/register', {
      role: 'worker',
      name: 'Amina Hassan',
      email: 'amina@example.com',
      password: 'green mango tree',
      language: 'en',
      channel: 'email',
    });
    expect(screen.queryByText('Where should we send your code?')).toBeNull();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });
});
