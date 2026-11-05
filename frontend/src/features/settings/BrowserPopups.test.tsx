import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { renderWithRouter } from '../../test/renderWithRouter';
import { BrowserPopups } from './BrowserPopups';
import './strings';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

describe('pop-ups on this device (ADR 0017)', () => {
  beforeEach(() => vi.mocked(api.get).mockReset());

  it('hidden when the server has no push keys', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { publicKey: null } });
    const { container } = renderWithRouter(<BrowserPopups />);
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith('/me/push'));
    expect(container).toBeEmptyDOMElement();
  });

  it('a browser that cannot do pop-ups gets a plain sentence, not a switch', async () => {
    // The test browser (jsdom) has no service workers, like an iPhone before "Add to Home Screen".
    vi.mocked(api.get).mockResolvedValue({ data: { publicKey: 'BKey' } });
    renderWithRouter(<BrowserPopups />);
    expect(await screen.findByText(/This browser cannot show pop-ups/)).toBeVisible();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
