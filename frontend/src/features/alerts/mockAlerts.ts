// Made-up alerts for the design phase (no backend yet). Times are relative to "now" so the
// "Closes in ..." countdowns always look realistic.
import type { Alert } from './types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function createMockAlerts(now = Date.now()): Alert[] {
  const at = (offset: number) => new Date(now + offset);

  return [
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
}

/** Alerts an employer (Peter Mwangi, Mwangi Logistics) would receive. */
export function createEmployerMockAlerts(now = Date.now()): Alert[] {
  const at = (offset: number) => new Date(now + offset);

  return [
    {
      id: 'e1',
      priority: 'urgent',
      type: 'status_update',
      title: 'Wanjiru Kamau accepted your job offer',
      body: 'Wanjiru Kamau accepted "Warehouse packers needed today". The shift starts at 2pm. Send her the meeting point if you have not already.',
      sender: 'Wanjiru Kamau',
      createdAt: at(-8 * MINUTE),
      readAt: null,
      deadlineAt: at(90 * MINUTE),
      location: 'Industrial Area, Nairobi',
    },
    {
      id: 'e2',
      priority: 'urgent',
      type: 'status_update',
      title: '3 new applicants for "Warehouse packers"',
      body: 'Three workers applied in the last 20 minutes. This job closes soon, so review them now to fill your places.',
      sender: 'KaziForce',
      createdAt: at(-20 * MINUTE),
      readAt: null,
      deadlineAt: at(38 * MINUTE),
    },
    {
      id: 'e3',
      priority: 'medium',
      type: 'message',
      title: 'New message from Brian Kiprono',
      body: 'Good morning. I have my own motorbike and a valid licence. Can I start on Saturday at 8am?',
      sender: 'Brian Kiprono',
      createdAt: at(-2 * HOUR),
      readAt: null,
    },
    {
      id: 'e4',
      priority: 'low',
      type: 'status_update',
      title: 'Your job post "Site cleaner" has closed',
      body: 'The deadline passed, so the job is no longer shown to workers. You can post it again at any time.',
      sender: 'KaziForce',
      createdAt: at(-1 * DAY),
      readAt: at(-20 * HOUR),
    },
    {
      id: 'e5',
      priority: 'low',
      type: 'announcement',
      title: 'See when your messages were delivered',
      body: 'You can now see if each worker received your message, and on which channel.',
      sender: 'KaziForce',
      createdAt: at(-4 * DAY),
      readAt: at(-4 * DAY + HOUR),
    },
  ];
}

/** A fresh urgent alert used to show how a live alert slides in. */
export function createIncomingAlert(now = Date.now()): Alert {
  return {
    id: `live-${now}`,
    priority: 'urgent',
    type: 'job_alert',
    title: 'Event ushers needed this evening',
    body: 'Nairobi Expo Centre needs 6 ushers from 5pm to 10pm tonight. Pay is KSh 1,500. Closes in 45 minutes.',
    sender: 'Nairobi Expo Centre',
    createdAt: new Date(now),
    readAt: null,
    deadlineAt: new Date(now + 45 * MINUTE),
    location: 'Upper Hill, Nairobi',
    arrivedLive: true,
  };
}
