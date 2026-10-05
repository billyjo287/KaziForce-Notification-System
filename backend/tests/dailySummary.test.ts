// Phase 6: the daily summary email (PRD FR-8) and the retention cleanup (DR-4), with real queues.
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type { EmailContent } from '../src/channels/EmailAdapter.js';
import type { Language, Priority } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { closeApiQueues, queueConnection } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { PRESETS } from '../src/modules/me/presets.js';
import { groupForSummary, summaryEmail, type SummaryItem } from '../src/scheduled/dailySummary.js';
import { messageText, newApplicantText } from '../src/pipeline/templates.js';
import { replaceName, runRetention } from '../src/scheduled/retention.js';
import { startScheduledJobs } from '../src/scheduled/scheduledJobs.js';
import { PASSWORD, auth, testApp, uniqueEmail } from './helpers.js';

const silent = pino({ level: 'silent' });
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const connection = queueConnection();
const sent: EmailContent[] = [];
const jobs = startScheduledJobs({
  prisma,
  connection,
  prefix: 'kf-test-summary',
  logger: silent,
  sendEmail: async (email) => sent.push(email),
  publicAppUrl: 'http://localhost:5173',
  schedule: false,
});

afterAll(async () => {
  await jobs.close();
  await closeApiQueues();
  await Promise.allSettled([connection.quit(), redis.quit()]);
  await prisma.$disconnect();
});

async function eventually(check: () => Promise<void> | void, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

// ---------- grouping and the email (no database) ----------

const item = (category: string, title: string, minutesAgo: number): SummaryItem => ({
  id: `id-${title}`,
  category,
  title,
  createdAt: new Date(Date.UTC(2026, 9, 2, 5) - minutesAgo * 60_000),
});

describe('daily summary: grouping', () => {
  it('groups by category in a fixed order, newest first, unknown categories last', () => {
    const groups = groupForSummary(
      [
        item('announcement', 'New feature', 30),
        item('new_job', 'Waiter in Westlands', 120),
        item('something_new', 'Odd one', 10),
        item('new_job', 'Cleaner in Kilimani', 60),
      ],
      'en',
    );
    expect(groups.map((g) => [g.heading, g.items.map((i) => i.title)])).toEqual([
      ['New jobs', ['Cleaner in Kilimani', 'Waiter in Westlands']],
      ['News from KaziForce', ['New feature']],
      ['Other updates', ['Odd one']],
    ]);
  });

  it('long groups show the newest 8 and "and N more"', () => {
    const many = Array.from({ length: 11 }, (_, i) => item('new_job', `Job ${i}`, i));
    const [group] = groupForSummary(many, 'en');
    expect(group!.items).toHaveLength(8);
    expect(group!.items[0]!.title).toBe('Job 0');
    expect(group!.more).toBe(3);
    const email = summaryEmail({
      language: 'en',
      groups: [group!],
      appUrl: 'http://localhost:5173/worker',
    });
    expect(email.subject).toBe('Your KaziForce summary: 11 updates');
    expect(email.text).toContain('New jobs (11)');
    expect(email.text).toContain('- and 3 more in the app: http://localhost:5173/worker/alerts');
  });

  it('every item links into the app; the footer button manages the preferences', () => {
    const groups = groupForSummary([item('new_job', 'Waiter <Westlands>', 5)], 'en');
    const email = summaryEmail({ language: 'en', groups, appUrl: 'http://localhost:5173/worker' });
    expect(email.subject).toBe('Your KaziForce summary: 1 update');
    expect(email.html).toContain(
      'href="http://localhost:5173/worker/alerts?open=id-Waiter &lt;Westlands&gt;"',
    );
    expect(email.html).toContain('Waiter &lt;Westlands&gt;'); // escaped, never raw HTML
    expect(email.html).toContain('Manage your notification preferences');
    expect(email.html).toContain('href="http://localhost:5173/worker/settings#notifications"');
    expect(email.html).toContain('max-width:480px');
  });

  it('speaks Kiswahili to people who chose it', () => {
    const groups = groupForSummary([item('application_update', 'Ombi lako limeangaliwa', 5)], 'sw');
    const email = summaryEmail({ language: 'sw', groups, appUrl: 'http://localhost:5173/worker' });
    expect(email.subject).toBe('Muhtasari wako wa KaziForce: taarifa 1');
    expect(email.html).toContain('Maombi yako ya kazi (1)');
    expect(email.html).toContain('Dhibiti mipangilio ya arifa zako');
    expect(email.html).toContain('<html lang="sw">');
  });
});

// ---------- who gets one, and what is in it ----------

async function person(options: { dailySummary?: boolean; language?: Language } = {}) {
  return prisma.user.create({
    data: {
      email: uniqueEmail('summary'),
      passwordHash: 'not-used',
      name: 'Summary Tester',
      role: 'worker',
      language: options.language ?? 'en',
      onboardingCompletedAt: new Date(),
      preference: {
        create: {
          channelSettings: PRESETS.recommended.channelSettings,
          quietHours: { enabled: false, start: '21:00', end: '07:00' },
          dailySummary: options.dailySummary ?? true,
        },
      },
    },
  });
}

async function notification(
  recipientId: string,
  priority: Priority,
  hoursAgo: number,
  extra: { category?: string; title?: string; isSpam?: boolean; markedNotImportant?: boolean } = {},
) {
  return prisma.notification.create({
    data: {
      recipientId,
      recipientRole: 'worker',
      senderRole: 'system',
      type: 'job_alert',
      category: extra.category ?? 'new_job',
      title: extra.title ?? 'A job',
      message: 'Details in the app',
      status: 'sent',
      predictedPriority: priority,
      isSpam: extra.isSpam ?? false,
      markedNotImportant: extra.markedNotImportant ?? false,
      createdAt: new Date(Date.now() - hoursAgo * HOUR),
    },
  });
}

describe('daily summary: who gets one', () => {
  it('only LOW of the last 24 hours, grouped; skipped when empty or switched off; once a day', async () => {
    const reader = await person();
    await notification(reader.id, 'low', 2, { title: 'Waiter in Westlands' });
    await notification(reader.id, 'low', 20, { title: 'Cleaner in Kilimani' });
    await notification(reader.id, 'low', 3, { category: 'announcement', title: 'New feature' });
    // Not in the summary:
    await notification(reader.id, 'medium', 1, { title: 'MEDIUM one' });
    await notification(reader.id, 'low', 25, { title: 'Too old' });
    await notification(reader.id, 'low', 1, { title: 'Spam one', isSpam: true });
    await notification(reader.id, 'low', 1, { title: 'Not important', markedNotImportant: true });
    const corrected = await notification(reader.id, 'medium', 1, { title: 'Corrected to low' });
    await prisma.notification.update({
      where: { id: corrected.id },
      data: { correctedPriority: 'low' },
    });

    const nothingNew = await person();
    await notification(nothingNew.id, 'medium', 1);
    const switchedOff = await person({ dailySummary: false });
    await notification(switchedOff.id, 'low', 1);
    const swahili = await person({ language: 'sw' });
    await notification(swahili.id, 'low', 1, {
      category: 'application_update',
      title: 'Ombi lako limeangaliwa',
    });

    const now = new Date();
    const people = await jobs.startDailySummary(now);
    expect(people).toEqual(expect.arrayContaining([reader.id, swahili.id]));
    expect(people).not.toContain(nothingNew.id);
    expect(people).not.toContain(switchedOff.id);

    const mailFor = (email: string) => sent.filter((m) => m.to === email);
    await eventually(() => {
      expect(mailFor(reader.email)).toHaveLength(1);
      expect(mailFor(swahili.email)).toHaveLength(1);
    });
    const mail = mailFor(reader.email)[0]!;
    expect(mail.subject).toBe('Your KaziForce summary: 4 updates');
    expect(mail.text).toContain('New jobs (3)');
    expect(mail.text).toContain('News from KaziForce (1)');
    for (const title of ['Waiter in Westlands', 'Cleaner in Kilimani', 'Corrected to low']) {
      expect(mail.text).toContain(title);
    }
    for (const title of ['MEDIUM one', 'Too old', 'Spam one', 'Not important']) {
      expect(mail.text).not.toContain(title);
    }
    expect(mailFor(swahili.email)[0]!.subject).toBe('Muhtasari wako wa KaziForce: taarifa 1');

    // The 08:00 run happening twice the same day (a retry) never sends a second email.
    await jobs.startDailySummary(now);
    await new Promise((r) => setTimeout(r, 500));
    expect(mailFor(reader.email)).toHaveLength(1);
  });

  it('someone who switches the summary off after 08:00 but before sending gets nothing', async () => {
    const reader = await person();
    await notification(reader.id, 'low', 1);
    await prisma.userPreference.update({
      where: { userId: reader.id },
      data: { dailySummary: false },
    });
    expect(await jobs.sendSummary({ userId: reader.id, until: new Date().toISOString() })).toBe(
      'nothing to send',
    );
  });
});

describe('daily summary: the clock', () => {
  it('runs at 08:00 Africa/Nairobi (05:00 UTC), and the retention cleanup at 03:30', async () => {
    const scheduled = startScheduledJobs({
      prisma,
      connection,
      prefix: 'kf-test-clock',
      logger: silent,
      sendEmail: async () => undefined,
      publicAppUrl: 'http://localhost:5173',
    });
    try {
      await scheduled.ready;
      const schedulers = await scheduled.queue.getJobSchedulers();
      const byId = new Map(schedulers.map((s) => [s.key, s]));
      const summary = byId.get('daily-summary')!;
      expect(summary).toMatchObject({ pattern: '0 8 * * *', tz: 'Africa/Nairobi' });
      const next = new Date(summary.next!);
      expect([next.getUTCHours(), next.getUTCMinutes()]).toEqual([5, 0]);
      expect(next.getTime() - Date.now()).toBeLessThanOrEqual(DAY);

      const retention = byId.get('retention')!;
      const nextCleanup = new Date(retention.next!);
      expect([nextCleanup.getUTCHours(), nextCleanup.getUTCMinutes()]).toEqual([0, 30]);
    } finally {
      await scheduled.queue.obliterate({ force: true });
      await scheduled.close();
    }
  });
});

// ---------- account deletion and retention (DR-4) ----------

const app = testApp();

describe('account deletion', () => {
  async function account() {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        role: 'worker',
        name: 'Leaving Soon',
        email: uniqueEmail('delete'),
        password: PASSWORD,
      });
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  it('needs the password; shows the deletion day; "Keep my account" cancels', async () => {
    const { token, id } = await account();
    let res = await request(app)
      .post('/api/me/deletion')
      .set(auth(token))
      .send({ password: 'not-my-password' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('password_wrong');

    res = await request(app).post('/api/me/deletion').set(auth(token)).send({ password: PASSWORD });
    expect(res.status).toBe(200);
    const { deletionRequestedAt } = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(new Date(res.body.user.deletionScheduledFor).getTime()).toBe(
      deletionRequestedAt!.getTime() + 14 * DAY,
    );

    res = await request(app).delete('/api/me/deletion').set(auth(token));
    expect(res.body.user.deletionScheduledFor).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).deletionRequestedAt).toBeNull();
  });

  it('the cleanup deletes the account and everything in it after 14 days, not before', async () => {
    const due = await person();
    const waiting = await person();
    const now = new Date();
    await prisma.user.update({
      where: { id: due.id },
      data: { deletionRequestedAt: new Date(now.getTime() - 14 * DAY - HOUR) },
    });
    await prisma.user.update({
      where: { id: waiting.id },
      data: { deletionRequestedAt: new Date(now.getTime() - 13 * DAY) },
    });
    const n = await notification(due.id, 'low', 1);
    await prisma.deliveryLog.create({ data: { notificationId: n.id, channel: 'email' } });

    const deleted: string[] = [];
    const result = await runRetention(prisma, now, async (id) => void deleted.push(id));
    expect(deleted).toContain(due.id);
    expect(deleted).not.toContain(waiting.id);
    expect(result.accounts).toBeGreaterThanOrEqual(1);
    expect(await prisma.user.findUnique({ where: { id: due.id } })).toBeNull();
    expect(await prisma.userPreference.findUnique({ where: { userId: due.id } })).toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: n.id } })).toBeNull();
    expect(await prisma.deliveryLog.count({ where: { notificationId: n.id } })).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: waiting.id } })).not.toBeNull();
  });

  it('replaces a name with "a former user", whole words only, capitalised at a sentence start', () => {
    const wanjiru = { name: 'Wanjiru Kamau', companyName: null };
    expect(replaceName(messageText('en', 'Wanjiru Kamau', 'Hi').title, wanjiru, 'en')).toBe(
      'New message from a former user',
    );
    expect(
      replaceName(newApplicantText('en', 'Wanjiru Kamau', 'Cook').message, wanjiru, 'en'),
    ).toBe('A former user applied for "Cook".');
    expect(replaceName(messageText('sw', 'Wanjiru Kamau', 'Hi').title, wanjiru, 'sw')).toBe(
      'Ujumbe mpya kutoka kwa mtumiaji wa zamani',
    );
    // Parts of the name on their own, and the company; "Kamaunet" is a different word.
    const mwangi = { name: 'Peter Mwangi', companyName: 'Mwangi Logistics' };
    expect(
      replaceName('Mwangi Logistics needs drivers. Ask Peter or Kamaunet.', mwangi, 'en'),
    ).toBe('A former user needs drivers. Ask a former user or Kamaunet.');
  });

  it('alerts the deleted person sent to others keep no name and no message words', async () => {
    const leaving = await prisma.user.create({
      data: {
        email: uniqueEmail('leaving'),
        passwordHash: 'not-used',
        name: 'Achieng Otieno',
        role: 'business',
        companyName: 'Achieng Cleaners',
        deletionRequestedAt: new Date(Date.now() - 15 * DAY),
      },
    });
    const english = await person();
    const kiswahili = await person({ language: 'sw' });
    const sent = (
      recipientId: string,
      type: 'message' | 'status_update',
      title: string,
      message: string,
    ) =>
      prisma.notification.create({
        data: {
          recipientId,
          recipientRole: 'worker',
          senderId: leaving.id,
          senderRole: 'business',
          type,
          category: type,
          title,
          message,
          status: 'sent',
        },
      });
    const chat = await sent(
      english.id,
      'message',
      'New message from Achieng Cleaners',
      'Call me on 0712345678',
    );
    const status = await sent(
      kiswahili.id,
      'status_update',
      'Ombi lako limekubaliwa',
      'Achieng Cleaners wamekubali ombi lako la "Cleaner".',
    );

    await runRetention(prisma, new Date());

    expect(await prisma.user.findUnique({ where: { id: leaving.id } })).toBeNull();
    const chatAfter = await prisma.notification.findUniqueOrThrow({ where: { id: chat.id } });
    expect(chatAfter.title).toBe('New message from a former user');
    expect(chatAfter.message).toBe(
      'This message was removed because its sender deleted their account.',
    );
    expect(chatAfter.senderId).toBeNull();
    const statusAfter = await prisma.notification.findUniqueOrThrow({ where: { id: status.id } });
    expect(statusAfter.message).toBe('Mtumiaji wa zamani wamekubali ombi lako la "Cleaner".');
  });

  it('delivery logs go after 180 days; notifications are kept (at least 90 days)', async () => {
    const reader = await person();
    const old = await notification(reader.id, 'low', 200 * 24);
    const oldLog = await prisma.deliveryLog.create({
      data: {
        notificationId: old.id,
        channel: 'email',
        createdAt: new Date(Date.now() - 181 * DAY),
      },
    });
    const recentLog = await prisma.deliveryLog.create({
      data: {
        notificationId: old.id,
        channel: 'sms',
        createdAt: new Date(Date.now() - 179 * DAY),
      },
    });
    await runRetention(prisma, new Date());
    expect(await prisma.deliveryLog.findUnique({ where: { id: oldLog.id } })).toBeNull();
    expect(await prisma.deliveryLog.findUnique({ where: { id: recentLog.id } })).not.toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: old.id } })).not.toBeNull();
  });
});
