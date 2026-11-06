import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderWithRouter } from '../../test/renderWithRouter';
import PrivacyPage from './PrivacyPage';

afterEach(async () => {
  vi.unstubAllEnvs();
  await i18n.changeLanguage('en');
});

describe('Privacy page (Kenya Data Protection Act, BT-10)', () => {
  it('says what is kept, why, who sees it, for how long and the rights, in plain words', () => {
    renderWithRouter(<PrivacyPage />, '/privacy');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy: how we use your information' }),
    ).toBeVisible();
    for (const heading of [
      'Who we are',
      'What we keep',
      'Why we keep it',
      'Who else sees it',
      'Where it is stored',
      'How long we keep it',
      'Your rights',
      'Contact',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    const rights = screen.getByRole('region', { name: 'Your rights' });
    expect(within(rights).getByText(/Office of the Data Protection Commissioner/)).toBeVisible();
    expect(
      screen.getByText('We never sell your information and never use it for advertising.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('shows the contact email when one is set, and a way to reach the team when not', () => {
    const { unmount } = renderWithRouter(<PrivacyPage />, '/privacy');
    expect(screen.getByText(/send a message to the KaziForce team/)).toBeVisible();
    unmount();

    vi.stubEnv('VITE_PRIVACY_EMAIL', 'privacy@example.com');
    renderWithRouter(<PrivacyPage />, '/privacy');
    expect(screen.getByText(/write to privacy@example.com/)).toBeVisible();
  });

  it('is in Kiswahili too', async () => {
    await i18n.changeLanguage('sw');
    renderWithRouter(<PrivacyPage />, '/privacy');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Faragha: jinsi tunavyotumia taarifa zako',
      }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Haki zako' })).toBeVisible();
  });
});
