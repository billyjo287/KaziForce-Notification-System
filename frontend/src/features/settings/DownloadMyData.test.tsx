import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../../components/ui/Toaster';
import { api } from '../../lib/api';
import { renderWithRouter } from '../../test/renderWithRouter';
import { DownloadMyData } from './DownloadMyData';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api: { get: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  // jsdom has no real downloads.
  URL.createObjectURL = vi.fn(() => 'blob:my-data');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('Download my data (BT-11)', () => {
  it('downloads the file the server prepares, with its name, and says so', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: new Blob(['{}'], { type: 'application/json' }),
      headers: {
        'content-disposition': 'attachment; filename="kaziforce-my-data-2026-11-07.json"',
      },
    });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    renderWithRouter(
      <>
        <DownloadMyData />
        <Toaster />
      </>,
    );
    expect(screen.getByText(/Never your password/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    expect(api.get).toHaveBeenCalledWith('/me/export', { responseType: 'blob' });
    expect(await screen.findByText('Your file is downloading.')).toBeVisible();
    expect(clicked).toEqual(['kaziforce-my-data-2026-11-07.json']);
  });

  it('says so in plain words when it fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    renderWithRouter(
      <>
        <DownloadMyData />
        <Toaster />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    expect(
      await screen.findByText('We could not prepare your file. Please try again.'),
    ).toBeVisible();
  });
});
