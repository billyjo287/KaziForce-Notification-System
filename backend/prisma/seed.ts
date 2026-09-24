// Fills the database with FAKE sample data for development and tests.
// Run with `npm run db:seed -w backend`. Running it again wipes and recreates everything.
//
// All people, companies, phone numbers (+2547000000xx) and emails (@example.com) are made up.
// Every sample account's password is: Password123!
// The admin account comes from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in backend/.env
// (admins are never created by sign-up).
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { LOCATIONS, SKILLS } from '../src/data/lookups.js';
import type { Prisma, User } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';
import { DEFAULT_QUIET_HOURS, PRESETS, channelOrderFor } from '../src/modules/me/presets.js';

const PASSWORD = 'Password123!';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);
const fromNow = (ms: number) => new Date(now + ms);

async function clear() {
  // Children first, so foreign keys are never broken.
  await prisma.domainEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.deliveryLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.phoneVerification.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.mLMetadata.deleteMany();
}

async function main() {
  await clear();

  // ---------- Lookup lists ----------
  await prisma.location.createMany({ data: LOCATIONS });
  await prisma.skill.createMany({ data: SKILLS });
  const locations = new Map((await prisma.location.findMany()).map((l) => [l.slug, l.id]));
  const skills = new Map((await prisma.skill.findMany()).map((s) => [s.slug, s.id]));
  const loc = (slug: string) => locations.get(slug)!;
  const skill = (slug: string) => skills.get(slug)!;

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let phoneCounter = 1;
  const nextPhone = () => `+2547000000${String(phoneCounter++).padStart(2, '0')}`;

  async function createUser(
    data: Omit<Prisma.UserCreateInput, 'passwordHash' | 'preference'> & { passwordHash?: string },
    usesWhatsApp = true,
  ): Promise<User> {
    const channelOrder = channelOrderFor(usesWhatsApp, usesWhatsApp ? 'whatsapp' : 'sms');
    return prisma.user.create({
      data: {
        passwordHash,
        onboardingCompletedAt: ago(20 * DAY),
        ...data,
        preference: {
          create: {
            preset: 'recommended',
            channelOrder,
            channelSettings: PRESETS.recommended.channelSettings,
            dailySummary: PRESETS.recommended.dailySummary,
            quietHours: DEFAULT_QUIET_HOURS,
          },
        },
      },
    });
  }

  // ---------- Admin (from .env) ----------
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? PASSWORD;
  const admin = await createUser({
    name: process.env.ADMIN_NAME ?? 'KaziForce Admin',
    email: adminEmail,
    passwordHash: await bcrypt.hash(adminPassword, 10),
    role: 'admin',
  });

  // ---------- Employers ----------
  const employer = (i: number, name: string, company: string, location: string) =>
    createUser({
      name,
      email: `employer${i}@example.com`,
      role: 'business',
      companyName: company,
      location: { connect: { id: loc(location) } },
      phone: nextPhone(),
      phoneVerified: true,
      consentSmsWhatsapp: true,
      consentAt: ago(30 * DAY),
      usesWhatsApp: true,
    });
  const logistics = await employer(1, 'Peter Mwangi', 'Mwangi Logistics', 'industrial-area');
  const events = await employer(2, 'Halima Abdalla', 'Pwani Events Ltd', 'nyali');
  const builders = await employer(3, 'James Otieno', 'Lakeside Builders', 'kisumu');

  // ---------- Workers ----------
  const worker = (
    i: number,
    name: string,
    location: string,
    skillSlugs: string[],
    usesWhatsApp: boolean,
    language: 'en' | 'sw' = 'en',
  ) =>
    createUser(
      {
        name,
        email: `worker${i}@example.com`,
        role: 'worker',
        language,
        location: { connect: { id: loc(location) } },
        skills: { connect: skillSlugs.map((s) => ({ id: skill(s) })) },
        phone: nextPhone(),
        phoneVerified: true,
        consentSmsWhatsapp: true,
        consentAt: ago(20 * DAY),
        usesWhatsApp,
      },
      usesWhatsApp,
    );
  const wanjiru = await worker(
    1,
    'Wanjiru Kamau',
    'industrial-area',
    ['warehouse', 'packing'],
    true,
  );
  const brian = await worker(
    2,
    'Brian Kiprono',
    'westlands',
    ['driving', 'delivery', 'boda-boda'],
    true,
  );
  const amina = await worker(
    3,
    'Amina Hassan',
    'nyali',
    ['catering', 'events', 'cooking'],
    true,
    'sw',
  );
  const kevin = await worker(4, 'Kevin Omondi', 'kisumu', ['construction', 'painting'], false);
  const faith = await worker(5, 'Faith Njeri', 'kilimani', ['cleaning', 'events'], true, 'sw');
  const joseph = await worker(6, 'Joseph Mutua', 'mombasa-island', ['security', 'events'], false);

  // ---------- Jobs ----------
  const job = (data: Prisma.JobUncheckedCreateInput) => prisma.job.create({ data });
  const packers = await job({
    employerId: logistics.id,
    title: 'Warehouse packers needed today',
    description: 'Pack and label parcels for same-day delivery. 6-hour shift starting 2pm.',
    locationId: loc('industrial-area'),
    skillId: skill('packing'),
    pay: 'KSh 1,200 for the shift',
    deadline: fromNow(45 * MINUTE),
    urgency: 'urgent',
  });
  const rider = await job({
    employerId: logistics.id,
    title: 'Delivery rider for the weekend',
    description: 'Deliver parcels around Westlands on Saturday and Sunday. Own motorbike needed.',
    locationId: loc('westlands'),
    skillId: skill('boda-boda'),
    pay: 'KSh 1,500 per day',
    deadline: fromNow(3 * DAY),
  });
  const wedding = await job({
    employerId: events.id,
    title: 'Catering staff for a wedding in Nyali',
    description: 'Serve food and drinks at a 200-guest wedding. Uniform provided.',
    locationId: loc('nyali'),
    skillId: skill('catering'),
    pay: 'KSh 2,000 for the evening',
    deadline: fromNow(2 * DAY),
  });
  const painting = await job({
    employerId: builders.id,
    title: 'Painters for a school renovation',
    description: 'Interior painting of 6 classrooms. 5 days, materials provided.',
    locationId: loc('kisumu'),
    skillId: skill('painting'),
    pay: 'KSh 900 per day',
    deadline: fromNow(5 * DAY),
  });
  await job({
    employerId: logistics.id,
    title: 'Loaders for a moving truck',
    description: 'Help load and unload furniture for an office move in Upper Hill. 4 hours.',
    locationId: loc('upper-hill'),
    skillId: skill('warehouse'),
    pay: 'KSh 800',
    deadline: fromNow(1 * DAY),
  });
  await job({
    employerId: builders.id,
    title: 'Site cleaner (filled)',
    description: 'General cleaning at a building site in Milimani.',
    locationId: loc('kisumu'),
    skillId: skill('cleaning'),
    deadline: ago(2 * DAY),
    status: 'closed',
  });

  // ---------- Applications ----------
  const apply = (data: Prisma.ApplicationUncheckedCreateInput) =>
    prisma.application.create({ data });
  const wanjiruPackers = await apply({
    jobId: packers.id,
    workerId: wanjiru.id,
    status: 'accepted',
    statusChangedAt: ago(40 * MINUTE),
  });
  await apply({
    jobId: rider.id,
    workerId: brian.id,
    status: 'reviewed',
    note: 'I have my own motorbike.',
    statusChangedAt: ago(3 * HOUR),
  });
  const aminaWedding = await apply({ jobId: wedding.id, workerId: amina.id });
  await apply({
    jobId: wedding.id,
    workerId: joseph.id,
    status: 'rejected',
    statusChangedAt: ago(DAY),
  });
  await apply({ jobId: painting.id, workerId: kevin.id });

  // ---------- Messages (one conversation per application) ----------
  await prisma.message.createMany({
    data: [
      {
        applicationId: wanjiruPackers.id,
        senderId: logistics.id,
        recipientId: wanjiru.id,
        body: 'Hello Wanjiru, please come to Gate B by 2pm. Ask for the shift supervisor.',
        createdAt: ago(20 * MINUTE),
      },
      {
        applicationId: wanjiruPackers.id,
        senderId: wanjiru.id,
        recipientId: logistics.id,
        body: 'Thank you, I will be there.',
        createdAt: ago(15 * MINUTE),
        readAt: ago(10 * MINUTE),
      },
      {
        applicationId: aminaWedding.id,
        senderId: amina.id,
        recipientId: events.id,
        body: 'Habari, is transport provided after the event?',
        createdAt: ago(2 * HOUR),
      },
    ],
  });

  // ---------- ML model registry ----------
  await prisma.mLMetadata.create({
    data: {
      version: 'rules-v0',
      algorithm: 'rules',
      description: 'Rule-based classifier used until the trained models are ready.',
      isActive: true,
      deployedAt: ago(7 * DAY),
    },
  });

  // ---------- Notifications (Phase 3 creates these for real; samples for the dashboard) ----------
  const classified = {
    modelVersion: 'rules-v0',
    predictionSource: 'rules',
    status: 'sent',
  } as const;
  const inApp = (at: Date, dismissedAt: Date | null = null) => ({
    channel: 'in_app' as const,
    status: 'delivered' as const,
    sentAt: at,
    deliveredAt: at,
    dismissedAt,
  });

  // Wanjiru: something in every tab of her dashboard.
  await prisma.notification.create({
    data: {
      ...classified,
      recipientId: wanjiru.id,
      recipientRole: 'worker',
      senderId: logistics.id,
      senderRole: 'business',
      type: 'job_alert',
      category: 'new_job',
      title: 'Warehouse packers needed today',
      message: 'Mwangi Logistics needs packers in Industrial Area. Apply within 45 minutes.',
      link: `/worker/jobs/${packers.id}`,
      jobId: packers.id,
      deadlineAt: packers.deadline,
      predictedPriority: 'urgent',
      priorityConfidence: 0.9,
      spamScore: 0.02,
      explanation: [{ feature: 'deadline_minutes<=60', weight: 1 }],
      createdAt: ago(12 * MINUTE),
      deliveries: {
        create: [
          inApp(ago(12 * MINUTE)),
          {
            channel: 'whatsapp',
            status: 'delivered',
            providerMessageId: 'mock-wa-0001',
            sentAt: ago(12 * MINUTE),
            deliveredAt: ago(11 * MINUTE),
          },
        ],
      },
    },
  });
  await prisma.notification.create({
    data: {
      ...classified,
      recipientId: wanjiru.id,
      recipientRole: 'worker',
      senderId: logistics.id,
      senderRole: 'business',
      type: 'message',
      category: 'message',
      title: 'New message from Mwangi Logistics',
      message: 'Hello Wanjiru, please come to Gate B by 2pm. Ask for the shift supervisor.',
      link: `/worker/messages/${wanjiruPackers.id}`,
      jobId: packers.id,
      predictedPriority: 'medium',
      priorityConfidence: 0.75,
      spamScore: 0.01,
      createdAt: ago(20 * MINUTE),
      deliveries: { create: [inApp(ago(20 * MINUTE))] },
    },
  });

  // Kevin (no WhatsApp): SMS failed 3 times, escalated to email.
  await prisma.notification.create({
    data: {
      ...classified,
      recipientId: kevin.id,
      recipientRole: 'worker',
      senderId: builders.id,
      senderRole: 'business',
      type: 'job_alert',
      category: 'new_job',
      title: 'Painters for a school renovation',
      message: 'Painters needed for a school renovation in Kisumu. Action required today.',
      link: `/worker/jobs/${painting.id}`,
      jobId: painting.id,
      predictedPriority: 'urgent',
      priorityConfidence: 0.8,
      spamScore: 0.03,
      escalatedAt: ago(2 * HOUR - 5 * MINUTE),
      escalatedTo: 'email',
      createdAt: ago(2 * HOUR),
      deliveries: {
        create: [
          inApp(ago(2 * HOUR)),
          ...[1, 2, 3].map((attempt) => ({
            channel: 'sms' as const,
            attempt,
            status: 'failed' as const,
            error: 'Mock provider: network timeout',
            createdAt: ago(2 * HOUR - attempt * MINUTE),
          })),
          {
            channel: 'email',
            status: 'delivered',
            isEscalation: true,
            sentAt: ago(2 * HOUR - 5 * MINUTE),
            deliveredAt: ago(2 * HOUR - 5 * MINUTE),
          },
        ],
      },
    },
  });

  // Brian: application reviewed (medium).
  await prisma.notification.create({
    data: {
      ...classified,
      recipientId: brian.id,
      recipientRole: 'worker',
      senderRole: 'system',
      type: 'status_update',
      category: 'application_update',
      title: 'Your application was reviewed',
      message: 'Mwangi Logistics reviewed your application for "Delivery rider for the weekend".',
      link: '/worker/jobs?tab=applications',
      jobId: rider.id,
      predictedPriority: 'medium',
      priorityConfidence: 0.75,
      spamScore: 0.01,
      createdAt: ago(3 * HOUR),
      deliveries: {
        create: [
          inApp(ago(3 * HOUR)),
          { channel: 'email', status: 'delivered', sentAt: ago(3 * HOUR) },
        ],
      },
    },
  });

  // Employer: new applicant. Admin corrected it from medium to low (a training label).
  await prisma.notification.create({
    data: {
      ...classified,
      recipientId: events.id,
      recipientRole: 'business',
      senderId: amina.id,
      senderRole: 'worker',
      type: 'status_update',
      category: 'new_applicant',
      title: 'New applicant',
      message: 'Amina Hassan applied for "Catering staff for a wedding in Nyali".',
      link: `/employer/jobs/${wedding.id}`,
      jobId: wedding.id,
      predictedPriority: 'medium',
      priorityConfidence: 0.6,
      spamScore: 0.01,
      correctedPriority: 'low',
      correctedById: admin.id,
      correctedAt: ago(HOUR),
      createdAt: ago(4 * HOUR),
      deliveries: { create: [inApp(ago(4 * HOUR))] },
    },
  });

  // Announcement (low) to several workers; Faith marked hers "Not important to me".
  for (const person of [wanjiru, faith, joseph, amina]) {
    const dismissed = person.id === faith.id;
    await prisma.notification.create({
      data: {
        ...classified,
        recipientId: person.id,
        recipientRole: 'worker',
        senderId: admin.id,
        senderRole: 'admin',
        type: 'announcement',
        category: 'announcement',
        title: 'New: choose how we contact you',
        message: 'You can now pick WhatsApp, SMS or email for urgent job alerts in Settings.',
        link: '/worker/settings',
        predictedPriority: 'low',
        priorityConfidence: 0.85,
        spamScore: 0.01,
        markedNotImportant: dismissed,
        markedNotImportantAt: dismissed ? ago(HOUR) : null,
        createdAt: ago(6 * HOUR),
        deliveries: { create: [inApp(ago(6 * HOUR), dismissed ? ago(HOUR) : null)] },
      },
    });
  }

  // Spam: fake job asking for a registration fee. Blocked, never delivered, waiting for review.
  await prisma.notification.create({
    data: {
      modelVersion: 'rules-v0',
      predictionSource: 'rules',
      status: 'blocked',
      recipientId: faith.id,
      recipientRole: 'worker',
      senderId: events.id,
      senderRole: 'business',
      type: 'message',
      category: 'message',
      title: 'New message',
      message:
        'CONGRATULATIONS!!! You are hired. Send KSh 500 registration fee to secure your job NOW!!!',
      predictedPriority: 'low',
      priorityConfidence: 0.5,
      isSpam: true,
      spamScore: 0.97,
      explanation: [
        { feature: 'payment_request', weight: 0.6 },
        { feature: 'all_caps_and_punctuation', weight: 0.3 },
      ],
      createdAt: ago(30 * MINUTE),
    },
  });

  const counts = {
    users: await prisma.user.count(),
    locations: await prisma.location.count(),
    skills: await prisma.skill.count(),
    jobs: await prisma.job.count(),
    applications: await prisma.application.count(),
    messages: await prisma.message.count(),
    notifications: await prisma.notification.count(),
  };
  console.log('Seeded sample data:', counts);
  console.log(`Admin: ${adminEmail}. Sample users: worker1@example.com, employer1@example.com`);
  console.log(`Sample users' password: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
