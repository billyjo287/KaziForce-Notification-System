// Live in-app delivery (PRD FR-6). Socket.IO starts with long-polling and upgrades to WebSocket
// when it can, so it also works on networks that block WebSockets.
//
//   - Connecting needs a valid login token (the same JWT as the REST API); suspended users are
//     refused. Each user joins one room, "user:<id>", shared by all their tabs and devices.
//   - Messages published on the Redis channel (by the worker, or by admin actions) are passed
//     to the right room.
//   - The browser confirms each new notification ("notification:received"), which records when
//     it was delivered.
import type { Server as HttpServer } from 'node:http';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { Server } from 'socket.io';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { verifyAccessToken } from '../lib/tokens.js';
import {
  realtimeChannel,
  userRoom,
  type BusMessage,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from './bus.js';

export interface RealtimeOptions {
  frontendOrigin: string;
  prisma: PrismaClient;
  /** A Redis connection used only for subscribing (Redis requires a separate one). */
  subscriber: Redis;
  logger: Logger;
  prefix: string;
}

interface SocketData {
  userId: string;
}

const receivedSchema = z.object({ id: z.uuid() });

export async function attachRealtime(
  httpServer: HttpServer,
  { frontendOrigin, prisma, subscriber, logger, prefix }: RealtimeOptions,
) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
    httpServer,
    {
      cors: { origin: frontendOrigin, credentials: true },
      serveClient: false,
    },
  );

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const payload = typeof token === 'string' ? verifyAccessToken(token) : null;
    if (!payload) return next(new Error('unauthorized'));
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, status: true },
      });
      if (!user) return next(new Error('unauthorized'));
      if (user.status === 'suspended') return next(new Error('account_suspended'));
      socket.data.userId = user.id;
      next();
    } catch (error) {
      logger.error({ err: error }, 'Socket authentication failed');
      next(new Error('server_error'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    void socket.join(userRoom(userId));

    socket.on('notification:received', async (raw: unknown) => {
      const parsed = receivedSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        await prisma.deliveryLog.updateMany({
          where: {
            notification: { id: parsed.data.id, recipientId: userId },
            channel: 'in_app',
            deliveredAt: null,
          },
          data: { status: 'delivered', deliveredAt: new Date() },
        });
      } catch (error) {
        logger.warn({ err: error }, 'Could not record in-app delivery');
      }
    });
  });

  const channel = realtimeChannel(prefix);
  subscriber.on('message', (from, raw) => {
    if (from !== channel) return;
    let message: BusMessage;
    try {
      message = JSON.parse(raw) as BusMessage;
    } catch {
      return;
    }
    if (message.kind === 'notification') {
      io.to(userRoom(message.userId)).emit('notification:new', message.notification);
    } else if (message.kind === 'disconnect') {
      io.in(userRoom(message.userId)).disconnectSockets(true);
    }
  });
  await subscriber.subscribe(channel);

  return {
    io,
    async close() {
      await subscriber.unsubscribe(channel).catch(() => {});
      await io.close();
    },
  };
}
