// Browser pop-ups (Web Push; SRS FR-NOT-016..020, ADR 0017). Sent with every in-app alert to the
// browsers (phones and computers) where the person switched pop-ups on, so they hear about it
// even when KaziForce is not open. Like in-app, it is called directly, not through the channel
// router: it is part of "in the app", not one of the person's ordered channels.
//
//   - No personal details: the pop-up shows only the summary line an SMS would carry ("You have a
//     new message"); the details need the app (CLAUDE.md decision 10, SRS 6.13.3 locked devices).
//   - Silent during quiet hours (FR-NOT-020): non-urgent pop-ups arrive with no sound or
//     vibration; urgent ones are normal, as with the other channels.
//   - Expired browsers (the push service answers 404 or 410) are removed at once.
//   - One DeliveryLog row (channel "push") per alert: sent if any browser accepted it.
// The push services (Google, Mozilla, Apple) are free, so this works the same in every
// CHANNEL_MODE; without VAPID keys it is simply not created (src/worker.ts).
import webpush from 'web-push';
import type { Language, Priority, PrismaClient } from '../generated/prisma/client.js';
import type { UserPreferenceManager } from '../preferences/UserPreferenceManager.js';
import { isQuietTime } from '../preferences/quietHours.js';
import {
  ChannelAdapter,
  type AdapterOptions,
  type OutgoingMessage,
  type SendResult,
} from './ChannelAdapter.js';
import type { Wording } from './wording.js';
import { isPushServiceUrl } from './pushServices.js';

export interface PushPayload {
  title: string;
  body: string;
  /** Opens this alert in the app. */
  url: string;
  /** One pop-up per alert, even if it arrives twice. */
  tag: string;
  silent: boolean;
  urgent: boolean;
}

/** What actually sends one message (web-push's sendNotification; tests give a fake). */
export type SendPush = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { TTL: number; urgency: 'high' | 'normal' },
) => Promise<unknown>;

const TITLE: Record<Language, { normal: string; urgent: string }> = {
  en: { normal: 'KaziForce', urgent: 'KaziForce: Act now' },
  sw: { normal: 'KaziForce', urgent: 'KaziForce: Sasa hivi' },
};

/** An alert is worth little after a day; the push service drops it if the phone stays off. */
const TTL_SECONDS = 24 * 60 * 60;

export class PushAdapter extends ChannelAdapter {
  readonly name = 'push' as const;
  override readonly attempts = 1;
  private readonly sendPush: SendPush;

  constructor(
    options: AdapterOptions,
    private readonly deps: {
      prisma: PrismaClient;
      preferences: UserPreferenceManager;
      wording: Wording;
      vapid: { publicKey: string; privateKey: string; subject: string };
      now?: () => Date;
      sendPush?: SendPush;
    },
  ) {
    super(options);
    const { publicKey, privateKey, subject } = deps.vapid;
    this.sendPush =
      deps.sendPush ??
      ((subscription, payload, opts) =>
        webpush.sendNotification(subscription, payload, {
          ...opts,
          vapidDetails: { subject, publicKey, privateKey },
        }));
  }

  addressFor(recipient: { id: string }) {
    return recipient.id;
  }

  override send(): Promise<SendResult> {
    throw new Error('Use notify() for browser pop-ups');
  }

  protected sendWithProvider(_message: OutgoingMessage): Promise<SendResult> {
    throw new Error('Use notify() for browser pop-ups');
  }

  /** Pop-ups for one alert on every browser the person allowed. Returns how many accepted it. */
  async notify(notificationId: string): Promise<number> {
    const { prisma } = this.deps;
    const n = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        recipient: {
          select: {
            id: true,
            role: true,
            language: true,
            status: true,
            pushSubscriptions: true,
          },
        },
      },
    });
    if (!n || n.recipient.status !== 'active' || n.recipient.role === 'admin') return 0;
    const subscriptions = n.recipient.pushSubscriptions;
    if (subscriptions.length === 0) return 0;

    const priority: Priority = n.correctedPriority ?? n.predictedPriority ?? 'medium';
    const { language } = n.recipient;
    const urgent = priority === 'urgent';
    const now = this.deps.now?.() ?? new Date();
    const prefs = await this.deps.preferences.get(n.recipientId);
    const side = n.recipient.role === 'business' ? 'employer' : 'worker';
    const payload: PushPayload = {
      title: urgent ? TITLE[language].urgent : TITLE[language].normal,
      body: await this.deps.wording.summary(n.category, priority, language),
      url: `/${side}/alerts?open=${n.id}`,
      tag: n.id,
      silent: !urgent && isQuietTime(prefs.quietHours, now),
      urgent,
    };

    let accepted = 0;
    const errors: string[] = [];
    for (const s of subscriptions) {
      // Saved before the push-service check existed (or changed in the database): never sent to.
      if (!isPushServiceUrl(s.endpoint)) {
        await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        errors.push('not a push service address');
        continue;
      }
      try {
        await this.sendPush(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: TTL_SECONDS, urgency: urgent ? 'high' : 'normal' },
        );
        accepted += 1;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: now } });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The browser unsubscribed or the subscription expired: never try it again.
          await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
          errors.push(`expired (${status})`);
        } else {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    await prisma.deliveryLog.create({
      data: {
        notificationId: n.id,
        channel: 'push',
        status: accepted > 0 ? 'sent' : 'failed',
        sentAt: accepted > 0 ? now : null,
        error: accepted > 0 ? null : errors.join('; ').slice(0, 500),
      },
    });
    this.options.logger.debug(
      { notificationId: n.id, accepted, failed: errors.length, silent: payload.silent },
      'Browser pop-ups sent',
    );
    return accepted;
  }
}
