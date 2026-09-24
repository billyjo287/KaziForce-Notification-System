// Account emails in the user's language. Short, plain, and no personal details beyond the name.
import type { Language } from '../../generated/prisma/client.js';

const nairobiTime = (date: Date, language: Language) =>
  date.toLocaleString(language === 'sw' ? 'sw-KE' : 'en-KE', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export function passwordResetEmail(name: string, link: string, language: Language) {
  return language === 'sw'
    ? {
        subject: 'Weka nenosiri jipya la KaziForce',
        text: `Habari ${name},\n\nFungua kiungo hiki kuweka nenosiri jipya. Kinafanya kazi kwa saa 1, mara moja tu:\n${link}\n\nKama hukuomba hili, puuza barua pepe hii. Nenosiri lako halijabadilika.\n\nKaziForce`,
      }
    : {
        subject: 'Set a new KaziForce password',
        text: `Hello ${name},\n\nOpen this link to set a new password. It works for 1 hour, once:\n${link}\n\nIf you did not ask for this, ignore this email. Your password has not changed.\n\nKaziForce`,
      };
}

export function newLoginEmail(
  name: string,
  device: string,
  at: Date,
  settingsLink: string,
  language: Language,
) {
  const when = nairobiTime(at, language);
  return language === 'sw'
    ? {
        subject: 'Kuingia kupya kwenye akaunti yako ya KaziForce',
        text: `Habari ${name},\n\nMtu ameingia kwenye akaunti yako ${when} kwa kutumia: ${device}.\n\nKama ni wewe, huhitaji kufanya chochote.\nKama si wewe, fungua Mipangilio na uchague "Toka kwenye vifaa vyote", kisha ubadilishe nenosiri lako:\n${settingsLink}\n\nKaziForce`,
      }
    : {
        subject: 'New login to your KaziForce account',
        text: `Hello ${name},\n\nSomeone logged in to your account on ${when} using: ${device}.\n\nIf this was you, there is nothing to do.\nIf it was not you, open Settings, choose "Log out of all devices" and change your password:\n${settingsLink}\n\nKaziForce`,
      };
}

/** A short, readable description of a browser, e.g. "Chrome on Android". */
export function describeDevice(userAgent: string | undefined): string {
  if (!userAgent) return 'an unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /SamsungBrowser/.test(userAgent)
      ? 'Samsung Internet'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'a browser';
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iPhone or iPad'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'an unknown system';
  return `${browser} on ${system}`;
}
