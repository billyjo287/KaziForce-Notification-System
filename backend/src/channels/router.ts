// The channel router (PRD FR-4, "first choice, with a safety net"). Pure decisions only: which
// external channels to use now, and whether and when to check for escalation. No database, no
// queues, so every rule is easy to test. In-app always happens first, separately.
//
//   URGENT  the person's FIRST usable channel from channelOrder, now. If the alert is not opened
//           within the escalation window (10 minutes, or half the time left before the job
//           deadline if that is shorter), the NEXT usable channel. If the first channel fails
//           after its retries, the next one at once. "Send urgent alerts on both": first and
//           second together, no escalation.
//   MEDIUM  every usable channel whose threshold includes "important" (email in the Recommended
//           preset). No escalation. (Held during quiet hours: Phase 6.)
//   LOW     in-app only (and the daily summary email, Phase 6).
//
// "Usable" = switched on in the person's settings, its threshold includes this priority, and the
// channel can reach them (e.g. WhatsApp only for people who use it, with a verified number and
// consent, who have not replied STOP). The channel itself decides that last part (addressFor),
// so a new channel needs no change here.
import type { Channel, Priority } from '../generated/prisma/client.js';
import { PRESETS, type ChannelSettings, type Threshold } from '../modules/me/presets.js';
import type { ChannelAdapter, Recipient } from './ChannelAdapter.js';

export type ExternalChannel = Exclude<Channel, 'in_app'>;

export interface Preferences {
  channelOrder: Channel[];
  channelSettings: unknown;
  urgentOnBothChannels: boolean;
}

export type Adapters = Partial<Record<ExternalChannel, ChannelAdapter>>;

const ALLOWS: Record<Threshold, Priority[]> = {
  everything: ['urgent', 'medium', 'low'],
  urgent_and_important: ['urgent', 'medium'],
  urgent_only: ['urgent'],
};

/** Settings saved as JSON: anything missing falls back to the Recommended preset. */
function settingFor(settings: unknown, channel: ExternalChannel) {
  const saved = (settings as Partial<ChannelSettings> | null)?.[channel];
  const fallback = PRESETS.recommended.channelSettings[channel];
  return {
    enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : fallback.enabled,
    threshold: saved?.threshold && saved.threshold in ALLOWS ? saved.threshold : fallback.threshold,
  };
}

/** The external channels usable for this priority, in the person's order. */
export function usableChannels(
  priority: Priority,
  preferences: Preferences,
  recipient: Recipient,
  adapters: Adapters,
): ExternalChannel[] {
  return preferences.channelOrder
    .filter((c): c is ExternalChannel => c !== 'in_app')
    .filter((c, i, all) => all.indexOf(c) === i)
    .filter((c) => {
      const setting = settingFor(preferences.channelSettings, c);
      const adapter = adapters[c];
      return (
        setting.enabled &&
        ALLOWS[setting.threshold].includes(priority) &&
        adapter !== undefined &&
        adapter.addressFor(recipient) !== null
      );
    });
}

/**
 * How long to wait for an urgent alert to be opened before trying the next channel:
 * the normal window, or half the time left before the deadline if that is shorter.
 */
export function escalationWindowMs(
  now: Date,
  deadlineAt: Date | null,
  windowMinutes: number,
): number {
  const normal = windowMinutes * 60_000;
  if (!deadlineAt) return normal;
  const halfLeft = Math.max(0, (deadlineAt.getTime() - now.getTime()) / 2);
  return Math.min(normal, halfLeft);
}

export interface DeliveryPlan {
  /** External channels to send on now. */
  now: ExternalChannel[];
  /** Urgent only: the channel to try if the alert is still unopened after `windowMs`. */
  escalation: { to: ExternalChannel; windowMs: number } | null;
}

export function planDelivery(input: {
  priority: Priority;
  preferences: Preferences;
  recipient: Recipient;
  adapters: Adapters;
  deadlineAt: Date | null;
  now: Date;
  windowMinutes: number;
}): DeliveryPlan {
  const usable = usableChannels(input.priority, input.preferences, input.recipient, input.adapters);
  if (input.priority === 'low') return { now: [], escalation: null };
  if (input.priority === 'medium') return { now: usable, escalation: null };

  const [first, second] = usable;
  if (!first) return { now: [], escalation: null };
  if (input.preferences.urgentOnBothChannels) {
    return { now: second ? [first, second] : [first], escalation: null };
  }
  return {
    now: [first],
    escalation: second
      ? {
          to: second,
          windowMs: escalationWindowMs(input.now, input.deadlineAt, input.windowMinutes),
        }
      : null,
  };
}

/** The next usable channel not tried yet (after a failure or an unopened window). */
export function nextChannel(
  usable: ExternalChannel[],
  tried: Iterable<Channel>,
): ExternalChannel | null {
  const done = new Set(tried);
  return usable.find((c) => !done.has(c)) ?? null;
}
