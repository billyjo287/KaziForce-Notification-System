import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { renderWithRouter } from '../../test/renderWithRouter';
import { formatPhone, isCommonPassword, parseIdentifier, suggestEmail } from './identifier';
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

const SESSION = {
  accessToken: 'token',
  user: {
    id: 'u1',
    name: 'Wanjiru Kamau',
    email: 'worker1@example.com',
    role: 'worker',
    language: 'en',
    onboardingCompleted: true,
  },
};

/** Answers each API address with a list of replies, in order (an Error is thrown). */
function replies(byUrl: Record<string, unknown[]>) {
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    const next = byUrl[url]?.shift();
    if (next === undefined) throw new Error(`unexpected call to ${url}`);
    if (next instanceof Error) throw next;
    return { data: next };
  });
}

beforeEach(() => {
  useAuth.setState({
    status: 'guest',
    user: null,
    accessToken: null,
    notice: null,
    justLoggedIn: false,
  });
  vi.mocked(api.post).mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

describe('email or phone number', () => {
  it('understands the ways people type a Kenyan number', () => {
    for (const typed of ['0712 345 678', '712345678', '+254 712-345-678']) {
      expect(parseIdentifier(typed)).toEqual({ kind: 'phone', value: '+254712345678' });
    }
    expect(formatPhone('+254712345678')).toBe('0712 345 678');
    expect(parseIdentifier('Amina@Gmail.com')).toEqual({ kind: 'email', value: 'amina@gmail.com' });
    expect(parseIdentifier('amina')).toBeNull();
  });

  it('spots common email typos and easy passwords', () => {
    expect(suggestEmail('amina@gmial.com')).toBe('amina@gmail.com');
    expect(suggestEmail('amina@yaho.com')).toBe('amina@yahoo.com');
    expect(suggestEmail('amina@gmail.com')).toBeNull();
    expect(suggestEmail('amina@kaziforce.co.ke')).toBeNull();
    expect(isCommonPassword('Password123')).toBe(true);
    expect(isCommonPassword('green mango tree')).toBe(false);
  });
});

describe('Log in', () => {
  const continueTo = async (typed: string) => {
    await userEvent.type(screen.getByLabelText('Email or phone number'), typed);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it('asks for an email or phone number first, and checks it before sending', async () => {
    renderWithRouter(<LoginPage />, '/login');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Please fill this in.')).toBeInTheDocument();
    await continueTo('amina');
    expect(screen.getByText(/Type an email address like name@gmail.com/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('no account: offers to create one instead of a dead end', async () => {
    replies({ '/auth/check': [{ exists: false, kind: 'email' }] });
    renderWithRouter(<LoginPage />, '/login');
    await continueTo('new.person@example.com');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'We cannot find an account' }),
    ).toHaveFocus();
    expect(screen.getByText(/No KaziForce account uses new.person@example.com/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('a phone number works; two wrong passwords suggest a new one', async () => {
    replies({
      '/auth/check': [{ exists: true, kind: 'phone' }],
      '/auth/login': [apiError(401, 'wrong_credentials'), apiError(401, 'wrong_credentials')],
    });
    renderWithRouter(<LoginPage />, '/login');
    await continueTo('0712345678');
    expect(api.post).toHaveBeenCalledWith('/auth/check', { identifier: '+254712345678' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Enter your password' }),
    ).toBeVisible();
    expect(screen.getByText('0712 345 678')).toBeVisible();

    await userEvent.type(screen.getByLabelText('Password'), 'not-right');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email, phone number or password is not right.',
    );
    expect(screen.queryByText(/Not right twice/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/Not right twice/)).toBeVisible();
    expect(api.post).toHaveBeenLastCalledWith('/auth/login', {
      identifier: '+254712345678',
      password: 'not-right',
    });
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

  it('a remembered device: no code, and the app shows the welcome message', async () => {
    replies({ '/auth/check': [{ exists: true, kind: 'email' }], '/auth/login': [SESSION] });
    renderWithRouter(<LoginPage />, '/login');
    await continueTo('worker1@example.com');
    await userEvent.type(await screen.findByLabelText('Password'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await vi.waitFor(() => expect(useAuth.getState().justLoggedIn).toBe(true));
  });

  it('a new device: choose SMS or email, then the code is checked as soon as it is complete', async () => {
    replies({
      '/auth/check': [{ exists: true, kind: 'email' }],
      '/auth/login': [
        {
          codeRequired: true,
          challengeId: 'challenge-1',
          firstName: 'Wanjiru',
          options: [
            { channel: 'sms', to: '07•• ••• 004' },
            { channel: 'email', to: 'wo•••@example.com' },
          ],
        },
      ],
      '/auth/login/send': [
        {
          channel: 'sms',
          to: '07•• ••• 004',
          expiresInSeconds: 300,
          resendInSeconds: 30,
          demoCode: '482913',
        },
      ],
      '/auth/login/code': [apiError(400, 'login_code_wrong'), SESSION],
    });
    renderWithRouter(<LoginPage />, '/login');
    await continueTo('worker1@example.com');
    await userEvent.type(await screen.findByLabelText('Password'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Where should we send your code?' }),
    ).toHaveFocus();
    expect(screen.getByText(/Hello Wanjiru/)).toBeVisible();
    expect(screen.getByRole('radio', { name: /By SMS/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /By email/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send my code' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Enter the code' })).toHaveFocus();
    expect(screen.getByText(/We sent a 6-digit code by SMS to 07•• ••• 004/)).toBeVisible();
    expect(screen.getByTestId('demo-code')).toHaveTextContent('482913');
    expect(screen.getByRole('button', { name: /Send a new code in \d+ s/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send it by email instead' })).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Remember this phone or computer for 30 days' }),
    ).toBeChecked();

    // The sixth digit sends it: no button press needed.
    await userEvent.type(screen.getByLabelText('6-digit code'), '111111');
    expect(
      await screen.findByText('That code is not right. Check it and try again.'),
    ).toBeVisible();
    await userEvent.clear(screen.getByLabelText('6-digit code'));
    await userEvent.type(screen.getByLabelText('6-digit code'), '48 29 13');
    await vi.waitFor(() => expect(useAuth.getState().justLoggedIn).toBe(true));
    expect(api.post).toHaveBeenLastCalledWith('/auth/login/code', {
      challengeId: 'challenge-1',
      code: '482913',
      rememberDevice: true,
    });
    // Next time this device says "Welcome back, Wanjiru".
    expect(JSON.parse(localStorage.getItem('kf.rememberedAccount')!)).toEqual({
      name: 'Wanjiru',
      email: 'worker1@example.com',
    });
  });

  it('a remembered account is greeted by name; "Not you?" forgets it', async () => {
    localStorage.setItem(
      'kf.rememberedAccount',
      JSON.stringify({ name: 'Wanjiru', email: 'worker1@example.com' }),
    );
    renderWithRouter(<LoginPage />, '/login');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back, Wanjiru');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Not you? Use another account' }));
    expect(screen.getByLabelText('Email or phone number')).toBeVisible();
    expect(localStorage.getItem('kf.rememberedAccount')).toBeNull();
  });
});

describe('Sign up', () => {
  const next = () => userEvent.click(screen.getByRole('button', { name: 'Continue' }));

  it('asks "looking for work or hiring?" first and needs an answer', async () => {
    renderWithRouter(<RegisterPage />, '/register');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What brings you to KaziForce?',
    );
    expect(screen.getByText('Step 1 of 5')).toBeVisible();
    await next();
    expect(screen.getByText('Please choose one.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /I'm hiring/ }));
    await next();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What is your email address?',
    );
  });

  it('"Did you mean gmail.com?" and "You already have an account"', async () => {
    replies({ '/auth/check': [{ exists: true, kind: 'email' }] });
    renderWithRouter(<RegisterPage />, '/register');
    await userEvent.click(screen.getByRole('radio', { name: /I'm looking for work/ }));
    await next();
    await userEvent.type(screen.getByLabelText('Email address'), 'amina@gmial.com');
    await next();
    expect(screen.getByText('Did you mean amina@gmail.com?')).toBeVisible();
    expect(api.post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, use this' }));
    expect(api.post).toHaveBeenCalledWith('/auth/check', { identifier: 'amina@gmail.com' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'You already have an account' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Log in instead' })).toBeVisible();
  });

  it('one question per screen; the account is made after the emailed code', async () => {
    replies({
      '/auth/check': [{ exists: false, kind: 'email' }],
      '/auth/register': [
        {
          codeRequired: true,
          challengeId: 'signup-1',
          sent: {
            channel: 'email',
            to: 'am•••@example.com',
            expiresInSeconds: 300,
            resendInSeconds: 30,
          },
        },
      ],
      '/auth/register/code': [
        { ...SESSION, user: { ...SESSION.user, onboardingCompleted: false } },
      ],
    });
    renderWithRouter(<RegisterPage />, '/register');
    await userEvent.click(screen.getByRole('radio', { name: /I'm looking for work/ }));
    await next();
    await userEvent.type(screen.getByLabelText('Email address'), 'amina@example.com');
    await next();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'What is your name?' }),
    ).toBeVisible();
    await next();
    expect(screen.getByText('Please fill this in.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Your full name'), 'Amina Hassan');
    await next();

    expect(screen.getByRole('heading', { level: 1, name: 'Choose a password' })).toBeVisible();
    await userEvent.type(screen.getByLabelText('Choose a password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/too easy to guess/)).toBeVisible();
    await userEvent.clear(screen.getByLabelText('Choose a password'));
    await userEvent.type(screen.getByLabelText('Choose a password'), 'green mango tree');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      role: 'worker',
      name: 'Amina Hassan',
      email: 'amina@example.com',
      password: 'green mango tree',
      language: 'en',
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check your email' }),
    ).toHaveFocus();
    expect(screen.getByText('Step 5 of 5')).toBeVisible();
    expect(screen.getByText(/We sent a 6-digit code to am•••@example.com/)).toBeVisible();
    await userEvent.type(screen.getByLabelText('6-digit code'), '123456');
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('user'));
    expect(api.post).toHaveBeenLastCalledWith('/auth/register/code', {
      challengeId: 'signup-1',
      code: '123456',
      rememberDevice: true,
    });
    // Nothing typed is kept once the account exists.
    expect(sessionStorage.getItem('kf.signupDraft')).toBeNull();
  });

  it('keeps the answers (never the password) if the page reloads', async () => {
    renderWithRouter(<RegisterPage />, '/register');
    await userEvent.click(screen.getByRole('radio', { name: /I'm hiring/ }));
    await next();
    await userEvent.type(screen.getByLabelText('Email address'), 'boss@example.com');
    const saved = JSON.parse(sessionStorage.getItem('kf.signupDraft')!);
    expect(saved).toMatchObject({ step: 'email', role: 'business', email: 'boss@example.com' });
    expect(JSON.stringify(saved)).not.toContain('password');
  });
});
