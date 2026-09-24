// The three notification presets from onboarding step 3 (PRD FR-5) and the channel-order rule
// from the two onboarding questions. Phase 6 adds the detailed "Customise" controls.
import type { Channel, Preset } from '../../generated/prisma/client.js';

export type Threshold = 'everything' | 'urgent_and_important' | 'urgent_only';
export type ExternalChannel = Exclude<Channel, 'in_app'>;
export type ChannelSettings = Record<ExternalChannel, { enabled: boolean; threshold: Threshold }>;

export const PRESETS: Record<
  Exclude<Preset, 'custom'>,
  { channelSettings: ChannelSettings; dailySummary: boolean }
> = {
  // Urgent on WhatsApp/SMS, important by email, the rest in the app + daily summary.
  recommended: {
    channelSettings: {
      whatsapp: { enabled: true, threshold: 'urgent_only' },
      sms: { enabled: true, threshold: 'urgent_only' },
      email: { enabled: true, threshold: 'urgent_and_important' },
    },
    dailySummary: true,
  },
  // Only urgent things leave the app; no daily summary email.
  urgent_only: {
    channelSettings: {
      whatsapp: { enabled: true, threshold: 'urgent_only' },
      sms: { enabled: true, threshold: 'urgent_only' },
      email: { enabled: true, threshold: 'urgent_only' },
    },
    dailySummary: false,
  },
  // Everything by email; SMS stays urgent-only because it costs money.
  everything: {
    channelSettings: {
      whatsapp: { enabled: true, threshold: 'urgent_and_important' },
      sms: { enabled: true, threshold: 'urgent_only' },
      email: { enabled: true, threshold: 'everything' },
    },
    dailySummary: true,
  },
};

export const DEFAULT_QUIET_HOURS = { enabled: true, start: '21:00', end: '07:00' };

const DEFAULT_ORDER: ExternalChannel[] = ['whatsapp', 'sms', 'email'];

/**
 * Channel order from "Do you use WhatsApp on this number?" and "Where do you check messages
 * most?". The answer to the second question goes first; people without WhatsApp never get it.
 */
export function channelOrderFor(
  usesWhatsApp: boolean,
  checksMost: ExternalChannel,
): ExternalChannel[] {
  const allowed = DEFAULT_ORDER.filter((c) => usesWhatsApp || c !== 'whatsapp');
  const first = allowed.includes(checksMost) ? checksMost : allowed[0]!;
  return [first, ...allowed.filter((c) => c !== first)];
}
