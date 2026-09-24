// The words of each notification, in the recipient's language (English or Kiswahili).
// Short and plain, like the rest of the app. The text is also what the ML service reads later.
import { env } from '../config/env.js';
import type { Language } from '../generated/prisma/client.js';

/** Shortens text to `max` characters, ending with "…" when cut. */
export function fit(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** e.g. "Fri 26 Sep, 18:00" in Kenyan time. */
function when(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(language === 'sw' ? 'sw-KE' : 'en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: env.APP_TIMEZONE,
  }).format(date);
}

export interface Text {
  title: string;
  message: string;
}

export function jobAlertText(
  language: Language,
  job: {
    title: string;
    company: string;
    skill: string;
    location: string;
    pay: string | null;
    deadline: Date;
    urgent: boolean;
  },
): Text {
  const deadline = when(job.deadline, language);
  if (language === 'sw') {
    return {
      title: job.title,
      message: [
        job.urgent && 'Haraka.',
        `${job.company} inahitaji ${job.skill} huko ${job.location}.`,
        job.pay && `Malipo: ${job.pay}.`,
        `Omba kabla ya ${deadline}.`,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  return {
    title: job.title,
    message: [
      job.urgent && 'Urgent.',
      `${job.company} needs ${job.skill} in ${job.location}.`,
      job.pay && `Pay: ${job.pay}.`,
      `Apply before ${deadline}.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function applicationStatusText(
  language: Language,
  status: 'reviewed' | 'accepted' | 'rejected',
  company: string,
  jobTitle: string,
): Text {
  const job = `"${jobTitle}"`;
  const texts: Record<Language, Record<typeof status, Text>> = {
    en: {
      reviewed: {
        title: 'Your application was reviewed',
        message: `${company} looked at your application for ${job}.`,
      },
      accepted: {
        title: 'Your application was accepted',
        message: `${company} accepted your application for ${job}. Open Messages to agree the details.`,
      },
      rejected: {
        title: 'Your application was not successful',
        message: `${company} chose other people for ${job}. New jobs are added every day.`,
      },
    },
    sw: {
      reviewed: {
        title: 'Ombi lako limeangaliwa',
        message: `${company} wameangalia ombi lako la ${job}.`,
      },
      accepted: {
        title: 'Ombi lako limekubaliwa',
        message: `${company} wamekubali ombi lako la ${job}. Fungua Ujumbe mkubaliane maelezo.`,
      },
      rejected: {
        title: 'Ombi lako halikufanikiwa',
        message: `${company} wamechagua watu wengine kwa ${job}. Kazi mpya huongezwa kila siku.`,
      },
    },
  };
  return texts[language][status];
}

export function newApplicantText(language: Language, worker: string, jobTitle: string): Text {
  return language === 'sw'
    ? { title: 'Mwombaji mpya', message: `${worker} ameomba kazi ya "${jobTitle}".` }
    : { title: 'New applicant', message: `${worker} applied for "${jobTitle}".` };
}

export function messageText(language: Language, sender: string, body: string): Text {
  return {
    title: language === 'sw' ? `Ujumbe mpya kutoka kwa ${sender}` : `New message from ${sender}`,
    message: body,
  };
}
