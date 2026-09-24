// How the worker process (and admin actions) reach the people connected to the API process.
// Messages go through one Redis publish/subscribe channel; every API process listens and passes
// them to its own Socket.IO rooms. This works with one API process or many.
import type { Redis } from 'ioredis';
import { env } from '../config/env.js';
import type { SerializedNotification } from '../modules/notifications/serialize.js';

export const realtimeChannel = (prefix = env.QUEUE_PREFIX) => `${prefix}:realtime`;

export type BusMessage =
  /** A new in-app notification for every open tab/device of this user. */
  | { kind: 'notification'; userId: string; notification: SerializedNotification }
  /** Close this user's live connections (suspended, or "log out of all devices"). */
  | { kind: 'disconnect'; userId: string };

export function publish(redis: Redis, message: BusMessage, prefix = env.QUEUE_PREFIX) {
  return redis.publish(realtimeChannel(prefix), JSON.stringify(message));
}

export const userRoom = (userId: string) => `user:${userId}`;

/** Events the server sends to the browser, and the browser sends back. */
export interface ServerToClientEvents {
  'notification:new': (notification: SerializedNotification) => void;
}
export interface ClientToServerEvents {
  /** The browser confirms a live notification arrived (records deliveredAt). */
  'notification:received': (payload: unknown) => void;
}
