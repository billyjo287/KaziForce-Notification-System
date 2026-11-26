// A/B test of priority routing (ml-v2 plan step 8): assigning volunteers, counting opt-outs,
// the CSV export, and that group A gets no daily summary (its low alerts already went by email).
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { closeApiQueues } from '../src/lib/queue.js';
import { redis } from '../src/lib/redis.js';
import { PRESETS } from '../src/modules/me/presets.js';
import { optOuts, snapshot } from '../src/modules/admin/abTest.js';
import { summaryRecipients } from '../src/scheduled/dailySummary.js';
import { auth, login, testApp, uniqueEmail } from './helpers.js';

const app = testApp();

afterAll(async () => {
  await closeApiQueues();
  await redis.quit();
  await prisma.$disconnect();
});

async function volunteer() {
  return prisma.user.create({
    data: {
      email: uniqueEmail('ab'),
      passwordHash: 'not-used',
      name: 'AB Volunteer',
      role: 'worker',
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
      preference: {
        create: {
          channelOrder: ['whatsapp', 'sms', 'email'],
          channelSettings: PRESETS.recommended.channelSettings,
          dailySummary: true,
          quietHours: { enabled: false, start: '21:00', end: '07:00' },
        },
      },
    },
  });
}

describe('opt-outs since joining', () => {
  it('counts channels and categories switched off, STOP replies and account deletion', () => {
    const before = snapshot({
      channelSettings: PRESETS.recommended.channelSettings,
      categorySettings: null,
    });
    expect(before.categoriesOff).toEqual([]);
    const joined = new Date('2026-11-27T08:00:00Z');
    const after = {
      channelsOn: before.channelsOn.filter((c) => c !== 'email'),
      categoriesOff: ['announcement'],
    };
    expect(
      optOuts(before, after, {
        abAssignedAt: joined,
        whatsappOptedOutAt: new Date('2026-11-28T08:00:00Z'),
        smsOptedOutAt: new Date('2026-11-20T08:00:00Z'), // before joining: not counted
        deletionRequestedAt: null,
      }),
    ).toEqual(['channel_off:email', 'category_off:announcement', 'stop:whatsapp']);
    expect(
      optOuts(before, before, {
        abAssignedAt: joined,
        whatsappOptedOutAt: null,
        smsOptedOutAt: null,
        deletionRequestedAt: null,
      }),
    ).toEqual([]);
  });
});

describe('admin: A/B test', () => {
  it('splits volunteers evenly at random, exports one row per alert, and can remove them', async () => {
    const admin = await login(app, 'admin@example.com');
    const people = await Promise.all([1, 2, 3, 4].map(() => volunteer()));
    const ids = people.map((p) => p.id);

    await request(app).get('/api/admin/ab-test').expect(401);
    const assigned = await request(app)
      .post('/api/admin/ab-test/assign')
      .set(auth(admin.token))
      .send({ userIds: ids, group: 'random' })
      .expect(200);
    // Unknown people are refused, and nobody is changed.
    await request(app)
      .post('/api/admin/ab-test/assign')
      .set(auth(admin.token))
      .send({ emails: ['nobody.here@example.com'], group: 'A' })
      .expect(404);
    const groups = assigned.body.items.map((i: { group: string }) => i.group).sort();
    expect(groups).toEqual(['A', 'A', 'B', 'B']);

    // One alert for the first volunteer, opened after 90 seconds; then they switch email off.
    const createdAt = new Date(Date.now() + 1000);
    await prisma.notification.create({
      data: {
        recipientId: ids[0]!,
        recipientRole: 'worker',
        senderRole: 'system',
        type: 'announcement',
        category: 'announcement',
        title: 'Market day',
        message: 'The market opens late on Friday.',
        status: 'sent',
        predictedPriority: 'low',
        createdAt,
        readAt: new Date(createdAt.getTime() + 90_000),
        deliveries: { create: { channel: 'in_app', status: 'sent', sentAt: createdAt } },
      },
    });
    await prisma.userPreference.update({
      where: { userId: ids[0]! },
      data: {
        channelSettings: {
          ...PRESETS.recommended.channelSettings,
          email: { enabled: false, threshold: 'urgent_and_important' },
        },
      },
    });

    const list = await request(app).get('/api/admin/ab-test').set(auth(admin.token)).expect(200);
    const first = list.body.items.find((i: { id: string }) => i.id === ids[0]);
    expect(first.optOuts).toEqual(['channel_off:email']);

    const csv = await request(app)
      .get('/api/admin/ab-test/export.csv')
      .set(auth(admin.token))
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines =
      csv.text.replace('﻿', '').trim().split('\r\n').length > 1
        ? csv.text.replace('﻿', '').trim().split(/\r?\n/)
        : csv.text.replace('﻿', '').trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      'user_token,group,role,priority,type,category,created_at,channels_sent,opened,seconds_to_open,marked_not_important,user_opted_out,user_opt_outs',
    );
    const row = lines.find((l) => l.includes(',announcement,announcement,'))!;
    expect(row).toContain(',low,');
    expect(row).toContain(',in_app,true,90,false,true,channel_off:email');
    expect(row).not.toContain('AB Volunteer');

    // Group A gets every low alert by email already: no daily summary for them.
    const inA = assigned.body.items
      .filter((i: { group: string }) => i.group === 'A')
      .map((i: { id: string }) => i.id);
    for (const id of ids) {
      await prisma.notification.create({
        data: {
          recipientId: id,
          recipientRole: 'worker',
          senderRole: 'system',
          type: 'announcement',
          category: 'announcement',
          title: 'Low news',
          message: 'Something small.',
          status: 'sent',
          predictedPriority: 'low',
        },
      });
    }
    const due = await summaryRecipients(prisma, new Date(Date.now() + 60_000));
    for (const id of ids) expect(due.includes(id)).toBe(!inA.includes(id));

    await request(app)
      .post('/api/admin/ab-test/remove')
      .set(auth(admin.token))
      .send({ userIds: ids.slice(1), emails: [people[0]!.email.toUpperCase()] })
      .expect(200, { removed: 4 });
    const after = await prisma.user.findMany({ where: { id: { in: ids } } });
    expect(after.every((u) => u.abGroup === null && u.abBaseline === null)).toBe(true);
  });
});
