import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../../components/ui/Toaster';
import { api } from '../../lib/api';
import { renderWithRouter } from '../../test/renderWithRouter';
import type { NotificationPreferences, PreferencesChange } from '../../types/api';
import { NotificationSettings } from './NotificationSettings';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api: { get: vi.fn(), patch: vi.fn() },
}));

const recommended = {
  whatsapp: { enabled: true, threshold: 'urgent_only' },
  sms: { enabled: true, threshold: 'urgent_only' },
  email: { enabled: true, threshold: 'urgent_and_important' },
} as const;

let saved: NotificationPreferences;

/** A tiny fake server: applies each change and answers like PATCH /me/preferences. */
function fakeServer() {
  saved = {
    preset: 'recommended',
    channelOrder: ['whatsapp', 'sms', 'email'],
    channelSettings: structuredClone(recommended),
    urgentOnBothChannels: false,
    quietHours: { enabled: true, start: '21:00', end: '07:00' },
    dailySummary: true,
    usesWhatsApp: true,
    phoneVerified: true,
    optedOut: { whatsapp: false, sms: false },
  };
  vi.mocked(api.get).mockImplementation(async () => ({ data: { preferences: saved } }));
  vi.mocked(api.patch).mockImplementation(async (_url, body) => {
    const change = body as PreferencesChange;
    const channelSettings = structuredClone(saved.channelSettings);
    for (const [c, s] of Object.entries(change.channelSettings ?? {})) {
      Object.assign(channelSettings[c as keyof typeof channelSettings], s);
    }
    saved = { ...saved, ...change, channelSettings, preset: change.preset ?? 'custom' };
    return { data: { preferences: saved, user: { id: 'u1' } } };
  });
}

function renderSettings() {
  return renderWithRouter(
    <>
      <NotificationSettings />
      <Toaster />
    </>,
  );
}

const patched = () => vi.mocked(api.patch).mock.calls.map(([, body]) => body);

describe('notification settings (FR-5)', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.patch).mockReset();
    fakeServer();
  });

  it('simplest first: channel order, WhatsApp, "both", then three presets; details are hidden', async () => {
    renderSettings();
    const list = await screen.findByRole('list', { name: 'Where urgent alerts go first' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1WhatsApp', '2SMS', '3Email']);
    expect(screen.getByRole('switch', { name: 'I use WhatsApp' })).toBeChecked();
    // One line of help under each control; "both" warns that SMS may cost more.
    expect(
      screen.getByRole('switch', { name: 'Send urgent alerts on both' }),
    ).toHaveAccessibleDescription(
      'Your first and second choice get urgent alerts at the same time. SMS may cost more.',
    );
    expect(screen.getByRole('radio', { name: /Recommended/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Customise' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('switch', { name: 'Quiet hours' })).not.toBeInTheDocument();
  });

  it('up/down buttons change the order, save at once, and Undo puts it back', async () => {
    renderSettings();
    const up = await screen.findByRole('button', { name: 'Move SMS up' });
    await userEvent.click(up);

    expect(patched()).toEqual([{ channelOrder: ['sms', 'whatsapp', 'email'] }]);
    expect(await screen.findByText('Saved: SMS is now choice 1')).toBeInTheDocument();
    // SMS is at the top, so its "up" button is disabled: the focus moves to "down".
    expect(screen.getByRole('button', { name: 'Move SMS up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move SMS down' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(patched()[1]).toEqual({ channelOrder: ['whatsapp', 'sms', 'email'] });
    expect(await screen.findByText('Change undone')).toBeInTheDocument();
  });

  it('a preset saves at once; Undo sends the old settings back', async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole('radio', { name: /Only urgent things/ }));
    expect(patched()).toEqual([{ preset: 'urgent_only' }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(patched()[1]).toEqual({ channelSettings: recommended, dailySummary: true });
  });

  it('Customise: per-channel on/off and what it gets, quiet hours and the daily summary', async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Customise' }));

    await userEvent.click(screen.getByRole('switch', { name: 'WhatsApp messages' }));
    expect(patched()).toEqual([{ channelSettings: { whatsapp: { enabled: false } } }]);
    // Switched off: its "what comes" choice disappears, and the list says why it is skipped.
    expect(
      await screen.findByText('Switched off under Customise, so we skip it.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('You changed some settings under Customise, so none of these is picked.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Daily summary email' }));
    expect(patched()[1]).toEqual({ dailySummary: false });
  });

  it('quiet hours: two different times are needed; a valid change saves when leaving the field', async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Customise' }));
    const until = screen.getByLabelText('Until');
    expect(until).toHaveAccessibleDescription('When messages start again (Kenya time).');

    fireEvent.change(until, { target: { value: '21:00' } });
    fireEvent.blur(until);
    expect(await screen.findByText('Choose two different times.')).toBeInTheDocument();
    expect(patched()).toEqual([]);

    fireEvent.change(until, { target: { value: '06:00' } });
    fireEvent.blur(until);
    await vi.waitFor(() =>
      expect(patched()).toEqual([{ quietHours: { enabled: true, start: '21:00', end: '06:00' } }]),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('explains why a channel is skipped (no verified phone, replied STOP)', async () => {
    saved = { ...saved, phoneVerified: false };
    renderSettings();
    expect(
      await screen.findAllByText('Needs a verified phone number. Add one in Your profile.'),
    ).toHaveLength(2);
  });

  it('says so in plain words when the settings cannot be loaded', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    renderSettings();
    expect(
      await screen.findByText(
        'We could not load your notification settings.',
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
