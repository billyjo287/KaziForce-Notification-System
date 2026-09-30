// In-app: the live push to the person's open tabs (Socket.IO, via the Redis channel) plus the
// alert list. Always available, always first, never retried here (the app fetches anything it
// missed when it reconnects), so it is called directly rather than through a queue.
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { SerializedNotification } from '../modules/notifications/serialize.js';
import { publish } from '../realtime/bus.js';
import {
  ChannelAdapter,
  type AdapterOptions,
  type OutgoingMessage,
  type SendResult,
} from './ChannelAdapter.js';

export class InAppAdapter extends ChannelAdapter {
  readonly name = 'in_app' as const;
  override readonly attempts = 1;

  constructor(
    options: AdapterOptions,
    private readonly publisher: Redis,
    private readonly prefix: string,
  ) {
    super(options);
  }

  addressFor(recipient: { id: string }) {
    return recipient.id;
  }

  /** The same in every mode: there is no outside provider. */
  override send(): Promise<SendResult> {
    throw new Error('Use push() for in-app notifications');
  }

  protected sendWithProvider(_message: OutgoingMessage): Promise<SendResult> {
    throw new Error('Use push() for in-app notifications');
  }

  async push(userId: string, notification: SerializedNotification): Promise<SendResult> {
    await publish(this.publisher, { kind: 'notification', userId, notification }, this.prefix);
    return { providerMessageId: `in-app-${randomUUID()}` };
  }
}
