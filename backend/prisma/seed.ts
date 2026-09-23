// Fills the database with FAKE sample data for development. Run with `npm run db:seed -w backend`.
// All people, companies, phone numbers (+2547000000xx) and emails (@example.com) are made up.
// Every account's password is: Password123!
// Running it again wipes and recreates the sample data.
import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma.js';
import type { Prisma, User } from '../src/generated/prisma/client.js';

const PASSWORD = 'Password123!';

type Three<T> = [T, T, T];
type Six<T> = [T, T, T, T, T, T];
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);
const fromNow = (ms: number) => new Date(now + ms);

const defaultPreference = {
  channelSettings: {
    whatsapp: { enabled: true, threshold: 'urgent_only' },
    sms: { enabled: true, threshold: 'urgent_only' },
    email: { enabled: true, threshold: 'urgent_and_important' },
  },
  quietHours: { enabled: true, start: '21:00', end: '07:00' },
} satisfies Pick<Prisma.UserPreferenceCreateInput, 'channelSettings' | 'quietHours'>;

async function clear() {
  // Children first, so foreign keys are never broken.
  await prisma.deliveryLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.user.deleteMany();
  await prisma.mLMetadata.deleteMany();
}

async function main() {
  await clear();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  let phoneCounter = 1;
  const nextPhone = () => `+2547000000${String(phoneCounter++).padStart(2, '0')}`;

  async function createUser(
    data: Omit<Prisma.UserCreateInput, 'passwordHash' | 'preference'>,
    preference: Partial<Prisma.UserPreferenceCreateWithoutUserInput> = {},
  ) {
    return prisma.user.create({
      data: {
        passwordHash,
        ...data,
        preference: { create: { ...defaultPreference, ...preference } },
      },
    });
  }

  // ---------- Users ----------
  const admin = await createUser({
    name: 'Grace Admin',
    email: 'admin@example.com',
    role: 'admin',
  });

  const employerData = [
    { name: 'Peter Mwangi', company: 'Mwangi Logistics', location: 'Nairobi' },
    { name: 'Halima Abdalla', company: 'Pwani Events Ltd', location: 'Mombasa' },
    { name: 'James Otieno', company: 'Lakeside Builders', location: 'Kisumu' },
  ];
  const [logistics, events, builders] = (await Promise.all(
    employerData.map((e, i) =>
      createUser({
        name: e.name,
        email: `employer${i + 1}@example.com`,
        role: 'business',
        companyName: e.company,
        location: e.location,
        phone: nextPhone(),
        phoneVerified: true,
        consentSmsWhatsapp: true,
        consentAt: ago(30 * 24 * HOUR),
        usesWhatsApp: true,
      }),
    ),
  )) as Three<User>;

  const workerData = [
    {
      name: 'Wanjiru Kamau',
      location: 'Nairobi',
      skills: ['warehouse', 'packing'],
      whatsapp: true,
      lang: 'en',
    },
    {
      name: 'Brian Kiprono',
      location: 'Nairobi',
      skills: ['driving', 'delivery'],
      whatsapp: true,
      lang: 'en',
    },
    {
      name: 'Amina Hassan',
      location: 'Mombasa',
      skills: ['catering', 'events'],
      whatsapp: true,
      lang: 'sw',
    },
    {
      name: 'Kevin Omondi',
      location: 'Kisumu',
      skills: ['construction', 'painting'],
      whatsapp: false,
      lang: 'en',
    },
    {
      name: 'Faith Njeri',
      location: 'Nairobi',
      skills: ['cleaning', 'events'],
      whatsapp: true,
      lang: 'sw',
    },
    {
      name: 'Joseph Mutua',
      location: 'Mombasa',
      skills: ['security', 'events'],
      whatsapp: false,
      lang: 'en',
    },
  ] as const;
  const workers = await Promise.all(
    workerData.map((w, i) =>
      createUser(
        {
          name: w.name,
          email: `worker${i + 1}@example.com`,
          role: 'worker',
          language: w.lang,
          location: w.location,
          skills: [...w.skills],
          phone: nextPhone(),
          phoneVerified: true,
          consentSmsWhatsapp: true,
          consentAt: ago(20 * 24 * HOUR),
          usesWhatsApp: w.whatsapp,
        },
        // Users without WhatsApp never get WhatsApp: SMS comes first for them.
        w.whatsapp ? {} : { channelOrder: ['sms', 'email'] },
      ),
    ),
  );
  const [wanjiru, brian, amina, kevin, faith, joseph] = workers as Six<User>;

  // ---------- Jobs ----------
  const packers = await prisma.job.create({
    data: {
      employerId: logistics.id,
      title: 'Warehouse packers needed today',
      description: 'Pack and label parcels for same-day delivery. 6 hours, Industrial Area.',
      location: 'Nairobi',
      skillTags: ['warehouse', 'packing'],
      deadline: fromNow(45 * MINUTE),
      urgency: 'urgent',
    },
  });
  const driver = await prisma.job.create({
    data: {
      employerId: logistics.id,
      title: 'Delivery rider for the weekend',
      description: 'Deliver parcels around Westlands on Saturday and Sunday. Own motorbike needed.',
      location: 'Nairobi',
      skillTags: ['driving', 'delivery'],
      deadline: fromNow(3 * 24 * HOUR),
    },
  });
  const wedding = await prisma.job.create({
    data: {
      employerId: events.id,
      title: 'Catering staff for a wedding in Nyali',
      description: 'Serve food and drinks at a 200-guest wedding. Uniform provided.',
      location: 'Mombasa',
      skillTags: ['catering', 'events'],
      deadline: fromNow(2 * 24 * HOUR),
    },
  });
  const painting = await prisma.job.create({
    data: {
      employerId: builders.id,
      title: 'Painters for a school renovation',
      description: 'Interior painting of 6 classrooms. 5 days, materials provided.',
      location: 'Kisumu',
      skillTags: ['construction', 'painting'],
      deadline: fromNow(5 * 24 * HOUR),
    },
  });
  await prisma.job.create({
    data: {
      employerId: builders.id,
      title: 'Site cleaner (filled)',
      description: 'General cleaning at a building site in Milimani.',
      location: 'Kisumu',
      skillTags: ['cleaning'],
      deadline: ago(2 * 24 * HOUR),
      status: 'closed',
    },
  });

  // ---------- Applications ----------
  await prisma.application.createMany({
    data: [
      { jobId: packers.id, workerId: wanjiru.id, status: 'accepted' },
      {
        jobId: driver.id,
        workerId: brian.id,
        status: 'reviewed',
        note: 'I have my own motorbike.',
      },
      { jobId: wedding.id, workerId: amina.id, status: 'received' },
      { jobId: wedding.id, workerId: joseph.id, status: 'rejected' },
      { jobId: painting.id, workerId: kevin.id, status: 'received' },
    ],
  });

  // ---------- Messages ----------
  await prisma.message.createMany({
    data: [
      {
        senderId: logistics.id,
        recipientId: wanjiru.id,
        jobId: packers.id,
        body: 'Hello Wanjiru, please come to Gate B by 2pm. Ask for the shift supervisor.',
        createdAt: ago(20 * MINUTE),
      },
      {
        senderId: wanjiru.id,
        recipientId: logistics.id,
        jobId: packers.id,
        body: 'Thank you, I will be there.',
        createdAt: ago(15 * MINUTE),
        readAt: ago(10 * MINUTE),
      },
      {
        senderId: amina.id,
        recipientId: events.id,
        jobId: wedding.id,
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
      deployedAt: ago(7 * 24 * HOUR),
    },
  });

  // ---------- Notifications with delivery logs ----------
  const classified = {
    modelVersion: 'rules-v0',
    predictionSource: 'rules',
    status: 'sent',
  } as const;

  // Urgent job alert: in-app + WhatsApp (her first choice); opened on WhatsApp after 3 minutes.
  await prisma.notification.create({
    data: {
      ...classified,
      recipientId: wanjiru.id,
      recipientRole: 'worker',
      senderId: logistics.id,
      senderRole: 'business',
      type: 'job_alert',
      category: 'new_job',
      title: 'Urgent job near you',
      message: 'Warehouse packers needed today in Industrial Area. Apply within 45 minutes.',
      link: `/jobs/${packers.id}`,
      jobId: packers.id,
      deadlineAt: packers.deadline,
      predictedPriority: 'urgent',
      priorityConfidence: 0.9,
      spamScore: 0.02,
      explanation: [{ feature: 'deadline_minutes<=60', weight: 1 }],
      readAt: ago(52 * MINUTE),
      createdAt: ago(55 * MINUTE),
      deliveries: {
        create: [
          {
            channel: 'in_app',
            status: 'delivered',
            sentAt: ago(55 * MINUTE),
            deliveredAt: ago(55 * MINUTE),
          },
          {
            channel: 'whatsapp',
            status: 'delivered',
            providerMessageId: 'mock-wa-0001',
            sentAt: ago(55 * MINUTE),
            deliveredAt: ago(54 * MINUTE),
            openedAt: ago(52 * MINUTE),
            clickedAt: ago(52 * MINUTE),
          },
        ],
      },
    },
  });

  // Urgent alert for a worker without WhatsApp: SMS failed 3 times, escalated to email.
  await prisma.notification.create({
    data: {
      ...classified,
      recipientId: kevin.id,
      recipientRole: 'worker',
      senderId: builders.id,
      senderRole: 'business',
      type: 'job_alert',
      category: 'new_job',
      title: 'Urgent job near you',
      message: 'Painters needed for a school renovation in Kisumu. Action required today.',
      link: `/jobs/${painting.id}`,
      jobId: painting.id,
      predictedPriority: 'urgent',
      priorityConfidence: 0.8,
      spamScore: 0.03,
      escalatedAt: ago(2 * HOUR - 5 * MINUTE),
      escalatedTo: 'email',
      createdAt: ago(2 * HOUR),
      deliveries: {
        create: [
          {
            channel: 'in_app',
            status: 'delivered',
            sentAt: ago(2 * HOUR),
            deliveredAt: ago(2 * HOUR),
          },
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

  // Medium: application reviewed, sent in-app + email.
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
      link: `/applications`,
      jobId: driver.id,
      predictedPriority: 'medium',
      priorityConfidence: 0.75,
      spamScore: 0.01,
      createdAt: ago(3 * HOUR),
      deliveries: {
        create: [
          {
            channel: 'in_app',
            status: 'delivered',
            sentAt: ago(3 * HOUR),
            deliveredAt: ago(3 * HOUR),
          },
          {
            channel: 'email',
            status: 'delivered',
            sentAt: ago(3 * HOUR),
            deliveredAt: ago(3 * HOUR),
          },
        ],
      },
    },
  });

  // Medium for an employer: new applicant. Admin corrected it to low (a training label).
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
      link: `/my-jobs/${wedding.id}`,
      jobId: wedding.id,
      predictedPriority: 'medium',
      priorityConfidence: 0.6,
      spamScore: 0.01,
      correctedPriority: 'low',
      correctedById: admin.id,
      correctedAt: ago(HOUR),
      createdAt: ago(4 * HOUR),
      deliveries: {
        create: [
          {
            channel: 'in_app',
            status: 'delivered',
            sentAt: ago(4 * HOUR),
            deliveredAt: ago(4 * HOUR),
          },
        ],
      },
    },
  });

  // Low: announcement, in-app only, held for the daily summary; user marked it "Not important".
  for (const worker of [faith, joseph, amina]) {
    await prisma.notification.create({
      data: {
        ...classified,
        recipientId: worker.id,
        recipientRole: 'worker',
        senderId: admin.id,
        senderRole: 'admin',
        type: 'announcement',
        category: 'announcement',
        title: 'New: choose how we contact you',
        message: 'You can now pick WhatsApp, SMS or email for urgent job alerts in Settings.',
        link: '/settings',
        predictedPriority: 'low',
        priorityConfidence: 0.85,
        spamScore: 0.01,
        markedNotImportant: worker.id === faith.id,
        markedNotImportantAt: worker.id === faith.id ? ago(HOUR) : null,
        createdAt: ago(6 * HOUR),
        deliveries: {
          create: [
            {
              channel: 'in_app',
              status: 'delivered',
              sentAt: ago(6 * HOUR),
              deliveredAt: ago(6 * HOUR),
              dismissedAt: worker.id === faith.id ? ago(HOUR) : null,
            },
          ],
        },
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
    jobs: await prisma.job.count(),
    applications: await prisma.application.count(),
    messages: await prisma.message.count(),
    notifications: await prisma.notification.count(),
    deliveryLogs: await prisma.deliveryLog.count(),
  };
  console.log('Seeded sample data:', counts);
  console.log(`Log in later (Phase 2) with e.g. worker1@example.com / ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
