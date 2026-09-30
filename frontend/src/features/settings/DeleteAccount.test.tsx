import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../../components/ui/Toaster';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { renderWithRouter } from '../../test/renderWithRouter';
import type { User } from '../../types/api';
import { DeleteAccount } from './DeleteAccount';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api: { post: vi.fn(), delete: vi.fn() },
}));

const user: User = {
  id: 'u1',
  name: 'Wanjiru Kamau',
  email: 'worker1@example.com',
  role: 'worker',
  language: 'en',
  phone: null,
  phoneVerified: false,
  usesWhatsApp: false,
  companyName: null,
  location: null,
  skills: [],
  onboardingCompleted: true,
  preference: null,
  deletionScheduledFor: null,
};
const pending = { ...user, deletionScheduledFor: '2026-10-14T09:00:00.000Z' };

function wrongPassword() {
  const response = {
    status: 400,
    data: { error: { code: 'password_wrong', message: 'That password is not right.' } },
    statusText: 'Bad Request',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return new AxiosError('Bad Request', '400', undefined, undefined, response);
}

describe('delete my account', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
    useAuth.setState({ user });
  });

  it('asks for the password, then shows the day the account will be deleted', async () => {
    renderWithRouter(
      <>
        <DeleteAccount />
        <Toaster />
      </>,
    );
    expect(
      screen.getByText(
        'We delete your account and everything in it after 14 days. You can change your mind until then.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(dialog).toBeInTheDocument();

    vi.mocked(api.post).mockRejectedValueOnce(wrongPassword());
    await userEvent.type(screen.getByLabelText('Your password'), 'not-it');
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account', hidden: false }));
    expect(await screen.findByText('That password is not right.')).toBeInTheDocument();

    vi.mocked(api.post).mockResolvedValueOnce({ data: { user: pending } });
    await userEvent.clear(screen.getByLabelText('Your password'));
    await userEvent.type(screen.getByLabelText('Your password'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(api.post).toHaveBeenLastCalledWith('/me/deletion', { password: 'Password123!' });
    expect(
      await screen.findByText('We will delete your account on 14 October 2026.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your account will be deleted on 14 October 2026.'),
    ).toBeInTheDocument();
  });

  it('"Keep my account" cancels the request', async () => {
    useAuth.setState({ user: pending });
    vi.mocked(api.delete).mockResolvedValue({ data: { user } });
    renderWithRouter(
      <>
        <DeleteAccount />
        <Toaster />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(api.delete).toHaveBeenCalledWith('/me/deletion');
    expect(
      await screen.findByText('Your account is safe. We will not delete it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeInTheDocument();
  });
});
