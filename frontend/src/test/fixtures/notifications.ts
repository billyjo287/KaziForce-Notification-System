// Sample alerts in the shape the API returns, for unit tests.
import type { ApiNotification } from '../../types/api';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Sample = Omit<ApiNotification, 'link' | 'deadlineAt' | 'location' | 'markedNotImportant'> &
  Partial<ApiNotification>;

export function createNotifications(now = Date.now()): ApiNotification[] {
  const at = (offset: number) => new Date(now + offset).toISOString();

  const samples: Sample[] = [
    {
      id: 'a1',
      priority: 'urgent',
      type: 'job_alert',
      title: 'Warehouse packers needed today',
      body: 'Mwangi Logistics needs 4 packers for a 6-hour shift in Industrial Area, starting 2pm. Pay is KSh 1,200 for the shift. Apply soon: the job closes in under an hour.',
      sender: 'Mwangi Logistics',
      createdAt: at(-12 * MINUTE),
      readAt: null,
      deadlineAt: at(38 * MINUTE),
      location: 'Industrial Area, Nairobi',
    },
    {
      id: 'a2',
      priority: 'urgent',
      type: 'status_update',
      title: 'You got the job: Delivery rider',
      body: 'Good news! Swift Parcels accepted your application for "Delivery rider for the weekend". Please confirm by 6pm today so they can keep your place.',
      sender: 'Swift Parcels',
      createdAt: at(-50 * MINUTE),
      readAt: null,
      deadlineAt: at(5 * HOUR),
      location: 'Westlands, Nairobi',
    },
    {
      id: 'a3',
      priority: 'medium',
      type: 'message',
      title: 'New message from Pwani Events',
      body: 'Hello Wanjiru, transport is provided after the wedding. The bus leaves Nyali at 11pm. See you on Saturday.',
      sender: 'Pwani Events Ltd',
      createdAt: at(-3 * HOUR),
      readAt: null,
    },
    {
      id: 'a4',
      priority: 'medium',
      type: 'status_update',
      title: 'Your application was reviewed',
      body: 'Lakeside Builders reviewed your application for "Painters for a school renovation". They will tell you their decision soon.',
      sender: 'Lakeside Builders',
      createdAt: at(-1 * DAY),
      readAt: at(-20 * HOUR),
    },
    {
      id: 'a5',
      priority: 'low',
      type: 'job_alert',
      title: 'New job near you: Shop assistant',
      body: 'A shop in Kasarani is looking for a weekend shop assistant. The job is open for 5 days.',
      sender: 'Kasarani Mini Mart',
      createdAt: at(-2 * DAY),
      readAt: null,
      deadlineAt: at(5 * DAY),
      location: 'Kasarani, Nairobi',
    },
    {
      id: 'a6',
      priority: 'low',
      type: 'announcement',
      title: 'New: choose how we contact you',
      body: 'You can now choose WhatsApp, SMS or email for urgent job alerts. Go to Settings to pick the one you check most.',
      sender: 'KaziForce',
      createdAt: at(-3 * DAY),
      readAt: at(-3 * DAY + HOUR),
    },
    {
      id: 'a7',
      priority: 'low',
      type: 'announcement',
      title: 'Tips for a strong profile',
      body: 'Workers with at least three skills on their profile get more job alerts. Add your skills in your profile.',
      sender: 'KaziForce',
      createdAt: at(-10 * DAY),
      readAt: at(-9 * DAY),
    },
    {
      id: 'a8',
      priority: 'low',
      type: 'announcement',
      title: 'Holiday opening hours',
      body: 'The KaziForce help desk is closed on public holidays. Job alerts keep working as usual.',
      sender: 'KaziForce',
      createdAt: at(-12 * DAY),
      readAt: at(-12 * DAY + HOUR),
    },
  ];
  return samples.map((n) => ({
    link: n.type === 'announcement' ? null : `/worker/jobs/job-${n.id}`,
    deadlineAt: null,
    location: null,
    markedNotImportant: false,
    ...n,
  }));
}
