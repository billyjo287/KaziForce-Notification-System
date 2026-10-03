// Load test, step 3: the numbers, from the load-test database and the listener's file.
//   npm run load:report -w backend
//
//   in-app latency      notification created -> live alert arrived in the "browser" (listener)
//   in-app, server side notification created -> pushed (DeliveryLog in_app sentAt)
//   time to provider    URGENT: notification created -> WhatsApp/SMS accepted by the provider
//                       (first try; mock mode, so this is our own pipeline's time) - NFR-1 says
//                       95% within 2 s
//   nothing lost        every message has a notification, and every notification was sent
import './applyEnv.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma.js';
import { DATA_DIR } from './env.mjs';

const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : NaN;
const stats = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return {
    count: s.length,
    p50: pct(s, 50),
    p95: pct(s, 95),
    p99: pct(s, 99),
    max: s.at(-1) ?? NaN,
  };
};
const fmt = (x: { count: number; p50: number; p95: number; p99: number; max: number }) =>
  `n=${x.count}  p50 ${x.p50.toFixed(0)} ms  p95 ${x.p95.toFixed(0)} ms  p99 ${x.p99.toFixed(0)} ms  max ${x.max.toFixed(0)} ms`;

const [messages, events, unprocessed, byStatus, bySource, byPriority] = await Promise.all([
  prisma.message.count(),
  prisma.domainEvent.count({ where: { type: 'message.sent' } }),
  prisma.domainEvent.count({ where: { processedAt: null, cancelledAt: null } }),
  prisma.notification.groupBy({ by: ['status'], _count: { _all: true } }),
  prisma.notification.groupBy({ by: ['predictionSource'], _count: { _all: true } }),
  prisma.notification.groupBy({ by: ['predictedPriority'], _count: { _all: true } }),
]);
const notifications = byStatus.reduce((t, s) => t + s._count._all, 0);

const inAppServer = await prisma.$queryRaw<{ ms: number }[]>`
  SELECT EXTRACT(EPOCH FROM (d."sentAt" - n."createdAt")) * 1000 AS ms
  FROM "DeliveryLog" d JOIN "Notification" n ON n.id = d."notificationId"
  WHERE d.channel = 'in_app' AND d."sentAt" IS NOT NULL`;
const toProvider = await prisma.$queryRaw<{ ms: number }[]>`
  SELECT EXTRACT(EPOCH FROM (d."sentAt" - n."createdAt")) * 1000 AS ms
  FROM "DeliveryLog" d JOIN "Notification" n ON n.id = d."notificationId"
  WHERE n."predictedPriority" = 'urgent' AND d.channel IN ('whatsapp', 'sms')
    AND d.attempt = 1 AND d."isEscalation" = false AND d."sentAt" IS NOT NULL`;
const eventToNotification = await prisma.$queryRaw<{ ms: number }[]>`
  SELECT EXTRACT(EPOCH FROM (e."processedAt" - e."createdAt")) * 1000 AS ms
  FROM "DomainEvent" e WHERE e.type = 'message.sent' AND e."processedAt" IS NOT NULL`;
const [failedSends] = await prisma.$queryRaw<{ n: bigint }[]>`
  SELECT COUNT(*) AS n FROM "DeliveryLog" WHERE status = 'failed'`;

const providerStats = stats(toProvider.map((r) => Number(r.ms)));
const within2s = toProvider.filter((r) => Number(r.ms) <= 2000).length / (toProvider.length || 1);

let inApp: ReturnType<typeof stats> | null = null;
let listenerInfo = 'listener file not found';
if (existsSync(`${DATA_DIR}inapp.json`)) {
  const file = JSON.parse(readFileSync(`${DATA_DIR}inapp.json`, 'utf8')) as {
    reconnects: number;
    caughtUp?: { resyncs: number; alerts: number };
    arrivals: { createdAt: string; receivedAt: number }[];
  };
  inApp = stats(file.arrivals.map((a) => a.receivedAt - Date.parse(a.createdAt)));
  listenerInfo = `${file.arrivals.length} alerts on screen, ${file.reconnects} reconnects, ${file.caughtUp?.alerts ?? 0} of them fetched after ${file.caughtUp?.resyncs ?? 0} catch-up requests`;
}

let k6 = '';
if (existsSync(`${DATA_DIR}k6-summary.json`)) {
  const m = JSON.parse(readFileSync(`${DATA_DIR}k6-summary.json`, 'utf8')).metrics;
  const v = (name: string, stat: string) => m[name]?.values?.[stat];
  k6 = [
    `k6: messages ${v('messages_sent', 'count')} (urgent ${v('urgent_messages', 'count')}), failed requests ${(100 * (v('http_req_failed{scenario:notifications}', 'rate') ?? 0)).toFixed(2)} %, dropped ${v('dropped_iterations', 'count') ?? 0}`,
    `k6: send message p50 ${v('http_req_duration{scenario:notifications}', 'med')?.toFixed(1)} ms, p95 ${v('http_req_duration{scenario:notifications}', 'p(95)')?.toFixed(1)} ms`,
    `k6: /predict p50 ${v('predict_ms', 'med')?.toFixed(1)} ms, p95 ${v('predict_ms', 'p(95)')?.toFixed(1)} ms, p99 ${v('predict_ms', 'p(99)')?.toFixed(1)} ms`,
  ].join('\n');
}

const lines = [
  `messages saved: ${messages}, message events: ${events}, events not processed yet: ${unprocessed}`,
  `notifications: ${notifications} by status ${JSON.stringify(Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])))}`,
  `classified by: ${JSON.stringify(Object.fromEntries(bySource.map((s) => [s.predictionSource ?? 'none', s._count._all])))}`,
  `priority: ${JSON.stringify(Object.fromEntries(byPriority.map((s) => [s.predictedPriority ?? 'none', s._count._all])))}`,
  `failed delivery tries: ${failedSends!.n}`,
  '',
  `event -> notifications created: ${fmt(stats(eventToNotification.map((r) => Number(r.ms))))}`,
  `in-app (created -> pushed, server): ${fmt(stats(inAppServer.map((r) => Number(r.ms))))}`,
  `in-app (created -> on screen): ${inApp ? fmt(inApp) : 'n/a'} (${listenerInfo})`,
  `urgent: created -> provider: ${fmt(providerStats)}; within 2 s: ${(100 * within2s).toFixed(2)} %`,
  '',
  k6,
];
const report = lines.join('\n');
console.log(report);
writeFileSync(`${DATA_DIR}report.txt`, report);
await prisma.$disconnect();
