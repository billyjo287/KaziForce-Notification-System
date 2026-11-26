import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderWithRouter } from '../../test/renderWithRouter';
import TermsPage from './TermsPage';

afterEach(async () => {
  vi.unstubAllEnvs();
  await i18n.changeLanguage('en');
});

describe('Terms of Service page', () => {
  it('sets out the rules in plain words, with the scam rule and links to the Privacy Policy', () => {
    renderWithRouter(<TermsPage />, '/terms');
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    for (const heading of [
      'Who we are',
      'Your account',
      'Using KaziForce fairly',
      'Alerts',
      'What KaziForce does and does not do',
      'The service',
      'Ending your use',
      'Changes and the law',
      'Contact',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    expect(screen.getByText(/Never ask anyone for money to get a job/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read the Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('gives the contact email when one is set', () => {
    vi.stubEnv('VITE_PRIVACY_EMAIL', 'privacy@example.com');
    renderWithRouter(<TermsPage />, '/terms');
    expect(screen.getByText(/privacy@example\.com/)).toBeVisible();
  });
});
