import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '../../test/renderWithRouter';
import { InstallApp } from './InstallApp';

const realAgent = navigator.userAgent;
afterEach(() => {
  Object.defineProperty(navigator, 'userAgent', { value: realAgent, configurable: true });
});

/** What Chrome fires when KaziForce can be installed. */
function chromeOffersInstall(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('KaziForce on the home screen (FR-NOT-016/017)', () => {
  it('without an install offer, says where to find it in the browser menu', () => {
    renderWithRouter(<InstallApp />);
    expect(screen.getByText('KaziForce on your home screen')).toBeVisible();
    expect(screen.getByText(/choose “Install app” or “Add to Home screen”/)).toBeVisible();
  });

  it('on an iPhone, gives the two steps (Share, then Add to Home Screen)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
      configurable: true,
    });
    renderWithRouter(<InstallApp />);
    expect(screen.getByText(/tap Share .*then “Add to Home Screen”/)).toBeVisible();
  });

  it('when Chrome offers it, one button opens the browser’s own install box', async () => {
    renderWithRouter(<InstallApp />);
    const offer = chromeOffersInstall('accepted');
    await userEvent.click(screen.getByRole('button', { name: 'Add KaziForce to this phone' }));
    expect(offer.prompt).toHaveBeenCalled();
  });
});
