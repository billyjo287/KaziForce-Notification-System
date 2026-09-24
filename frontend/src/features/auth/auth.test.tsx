import { screen } from '@testing-library/react';
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
    useAuth.setState({ status: 'guest', user: null, accessToken: null, notice: null });
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
});
