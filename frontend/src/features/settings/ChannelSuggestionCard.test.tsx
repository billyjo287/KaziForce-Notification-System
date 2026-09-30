import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../../components/ui/Toaster';
import { api } from '../../lib/api';
import { renderWithRouter } from '../../test/renderWithRouter';
import { ChannelSuggestionCard } from './ChannelSuggestionCard';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const suggestion = {
  channel: 'sms',
  currentFirst: 'whatsapp',
  alerts: 5,
  wins: 5,
  medianMinutes: 2,
};

function renderCard() {
  return renderWithRouter(
    <>
      <ChannelSuggestionCard enabled />
      <Toaster />
    </>,
  );
}

describe('channel suggestion card (FR-4b)', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('shows nothing when there is no suggestion', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { suggestion: null } });
    renderCard();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith('/me/channel-suggestion'));
    expect(screen.queryByRole('region', { name: /fastest/ })).not.toBeInTheDocument();
  });

  it('explains the suggestion in plain words; only "Yes" changes the order', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { suggestion } });
    vi.mocked(api.post).mockResolvedValue({ data: { user: { id: 'u1' } } });
    renderCard();

    const card = await screen.findByRole('region', { name: 'You usually open SMS fastest' });
    expect(card).toHaveTextContent(
      'Of your last 5 urgent alerts, you opened 5 first on SMS, usually within 2 minutes.',
    );
    expect(api.post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, use SMS first' }));
    expect(api.post).toHaveBeenCalledWith('/me/channel-suggestion', { accept: true });
    expect(
      await screen.findByText('Done. Urgent alerts now go to SMS first.', { exact: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /fastest/ })).not.toBeInTheDocument();
  });

  it('"No, keep WhatsApp" sends a no', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { suggestion } });
    vi.mocked(api.post).mockResolvedValue({ data: { user: { id: 'u1' } } });
    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'No, keep WhatsApp' }));
    expect(api.post).toHaveBeenCalledWith('/me/channel-suggestion', { accept: false });
  });
});
