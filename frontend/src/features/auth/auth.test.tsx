import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { renderWithRouter } from '../../test/renderWithRouter';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: { post: vi.fn(), get: vi.fn() } };
});

function apiError(status: number, code: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { error: { code, message: code } },
  });
}

describe('Log in', () => {
  beforeEach(() => {
    useAuth.setState({
      status: 'guest',
      user: null,
      accessToken: null,
      notice: null,
      justLoggedIn: false,
    });
    vi.mocked(api.post).mockReset();
  });

  it('checks the form before sending it', async () => {
    renderWithRouter(<LoginPage />, '/login');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(
      await screen.findByText('Enter an email address like name@example.com.'),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('explains a wrong password in plain words', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(apiError(401, 'wrong_credentials'));
    renderWithRouter(<LoginPage />, '/login');

    await userEvent.type(screen.getByLabelText('Email address'), 'worker1@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'not-right');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is not right. Check them and try again.',
    );
  });

  it('tells suspended users why they were logged out', () => {
    useAuth.setState({ notice: 'suspended' });
    renderWithRouter(<LoginPage />, '/login');
    expect(screen.getByRole('alert')).toHaveTextContent('This account has been suspended.');
  });

  it('"You are logged out" slides away after 5 seconds', () => {
    vi.useFakeTimers();
    try {
      useAuth.setState({ notice: 'loggedOut' });
      renderWithRouter(<LoginPage />, '/login');
      const message = screen.getByRole('status');
      expect(message).toHaveClass('kf-enter');

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole('status')).toHaveClass('kf-leave');
      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(useAuth.getState().notice).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a successful log-in asks the app to show the welcome message', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        accessToken: 'token',
        user: {
          id: 'u1',
          name: 'Wanjiru Kamau',
          role: 'worker',
          language: 'en',
          onboardingCompleted: true,
        },
      },
    });
    renderWithRouter(<LoginPage />, '/login');
    await userEvent.type(screen.getByLabelText('Email address'), 'worker1@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await vi.waitFor(() => expect(useAuth.getState().justLoggedIn).toBe(true));
  });
});

describe('Sign up', () => {
  it('asks "looking for work or hiring?" first and needs an answer', async () => {
    renderWithRouter(<RegisterPage />, '/register');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What brings you to KaziForce?',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Please choose one.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /I'm hiring/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your details');
  });

  async function fillDetails(password: string, again: string) {
    renderWithRouter(<RegisterPage />, '/register');
    await userEvent.click(screen.getByRole('radio', { name: /I'm looking for work/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Your full name'), 'Amina Hassan');
    await userEvent.type(screen.getByLabelText('Email address'), 'amina@example.com');
    await userEvent.type(screen.getByLabelText('Choose a password'), password);
    await userEvent.type(screen.getByLabelText('Type the password again'), again);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('asks for the password twice and explains when they are different', async () => {
    await fillDetails('Password123!', 'Password124!');
    expect(
      await screen.findByText(
        'The two passwords are not the same. Type the same password in both boxes.',
      ),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends the password once when both match', async () => {
    vi.mocked(api.post).mockReset().mockRejectedValueOnce(apiError(409, 'email_taken'));
    await fillDetails('Password123!', 'Password123!');
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        name: 'Amina Hassan',
        email: 'amina@example.com',
        password: 'Password123!',
        role: 'worker',
        language: 'en',
      }),
    );
  });
});
