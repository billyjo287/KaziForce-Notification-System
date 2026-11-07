// "Download my data" (Kenya Data Protection Act 2019, right of access, section 26; BT-11): one
// JSON file with everything KaziForce keeps about the person, in plain field names. Never the
// password (only its scrambled form is kept, and even that is left out), log-in tokens or codes.
import type { PrismaClient } from '../../generated/prisma/client.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function buildDataExport(prisma: PrismaClient, userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      location: { select: { name: true } },
      skills: { select: { nameEn: true } },
      preference: true,
    },
  });
  const [
    jobs,
    applications,
    messages,
    notifications,
    settingsHistory,
    browsers,
    devices,
    summaries,
  ] = await Promise.all([
    prisma.job.findMany({
      where: { employerId: userId },
      select: {
        title: true,
        description: true,
        pay: true,
        status: true,
        deadline: true,
        createdAt: true,
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.application.findMany({
      where: { workerId: userId },
      select: {
        status: true,
        note: true,
        createdAt: true,
        job: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      select: {
        applicationId: true,
        senderId: true,
        body: true,
        createdAt: true,
        readAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.notification.findMany({
      where: { recipientId: userId },
      select: {
        category: true,
        title: true,
        message: true,
        status: true,
        predictedPriority: true,
        correctedPriority: true,
        createdAt: true,
        readAt: true,
        markedNotImportant: true,
        notImportantReason: true,
        deliveries: { select: { channel: true, status: true, sentAt: true, openedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.findMany({
      where: { actorId: userId, action: 'preferences.changed' },
      select: { createdAt: true, metadata: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.pushSubscription.findMany({
      where: { userId },
      select: { userAgent: true, createdAt: true, lastUsedAt: true },
    }),
    prisma.trustedDevice.findMany({
      where: { userId },
      select: { userAgent: true, createdAt: true, expiresAt: true },
    }),
    prisma.summaryLog.findMany({
      where: { userId },
      select: { frequency: true, alertCount: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const p = user.preference;
  return {
    about:
      'Everything KaziForce keeps about you, as of the time below (Kenya Data Protection Act ' +
      '2019, right of access). Your password is never included. See /privacy for how long ' +
      'each part is kept.',
    exportedAt: now.toISOString(),
    account: {
      name: user.name,
      email: user.email,
      emailConfirmedAt: iso(user.emailVerifiedAt),
      side: user.role === 'business' ? 'employer' : user.role,
      companyName: user.companyName,
      language: user.language,
      phone: user.phone,
      phoneConfirmed: user.phoneVerified,
      agreedToSmsAndWhatsAppAt: user.consentSmsWhatsapp ? iso(user.consentAt) : null,
      usesWhatsApp: user.usesWhatsApp,
      area: user.location?.name ?? null,
      skills: user.skills.map((s) => s.nameEn),
      status: user.status,
      createdAt: iso(user.createdAt),
      lastLoginAt: iso(user.lastLoginAt),
      deletionRequestedAt: iso(user.deletionRequestedAt),
      whatsappStoppedAt: iso(user.whatsappOptedOutAt),
      smsStoppedAt: iso(user.smsOptedOutAt),
    },
    alertSettings: p
      ? {
          channelOrder: p.channelOrder,
          channels: p.channelSettings,
          quietHours: p.quietHours,
          summary: p.dailySummary ? p.summaryFrequency : 'off',
          typesOfAlerts: p.categorySettings,
          updatedAt: iso(p.updatedAt),
        }
      : null,
    settingsHistory: settingsHistory.map((h) => ({ at: iso(h.createdAt), change: h.metadata })),
    jobsPosted: jobs.map((j) => ({
      title: j.title,
      description: j.description,
      pay: j.pay,
      status: j.status,
      closes: iso(j.deadline),
      postedAt: iso(j.createdAt),
      applicants: j._count.applications,
    })),
    applications: applications.map((a) => ({
      job: a.job.title,
      status: a.status,
      note: a.note,
      appliedAt: iso(a.createdAt),
    })),
    messages: messages.map((m) => ({
      conversation: m.applicationId,
      from: m.senderId === userId ? 'you' : 'the other person',
      text: m.body,
      sentAt: iso(m.createdAt),
      readAt: iso(m.readAt),
    })),
    alerts: notifications.map((n) => ({
      type: n.category,
      title: n.title,
      text: n.message,
      priority: n.correctedPriority ?? n.predictedPriority,
      status: n.status,
      createdAt: iso(n.createdAt),
      readAt: iso(n.readAt),
      notImportant: n.markedNotImportant ? (n.notImportantReason ?? true) : false,
      deliveries: n.deliveries.map((d) => ({
        channel: d.channel,
        status: d.status,
        sentAt: iso(d.sentAt),
        openedAt: iso(d.openedAt),
      })),
    })),
    summaryEmails: summaries.map((s) => ({
      frequency: s.frequency,
      alerts: s.alertCount,
      status: s.status,
      at: iso(s.createdAt),
    })),
    browsersWithPopups: browsers.map((b) => ({
      browser: b.userAgent,
      since: iso(b.createdAt),
      lastUsed: iso(b.lastUsedAt),
    })),
    rememberedDevices: devices.map((d) => ({
      browser: d.userAgent,
      since: iso(d.createdAt),
      until: iso(d.expiresAt),
    })),
  };
}
