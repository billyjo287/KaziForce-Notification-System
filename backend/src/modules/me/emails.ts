// Emails about the person's own account settings, in their language.
import type { Language } from '../../generated/prisma/client.js';

const nairobiDay = (date: Date, language: Language) =>
  date.toLocaleDateString(language === 'sw' ? 'sw-KE' : 'en-KE', {
    timeZone: 'Africa/Nairobi',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** Confirms a deletion request, and warns the owner if it was not them. */
export function deletionRequestedEmail(
  name: string,
  deleteOn: Date,
  settingsLink: string,
  language: Language,
) {
  const day = nairobiDay(deleteOn, language);
  return language === 'sw'
    ? {
        subject: 'Akaunti yako ya KaziForce itafutwa',
        text: `Habari ${name},\n\nUliomba tufute akaunti yako. Tutaifuta pamoja na kila kitu ndani yake tarehe ${day}.\n\nUkibadilisha nia, ingia kabla ya tarehe hiyo, fungua Mipangilio na uchague "Hifadhi akaunti yangu":\n${settingsLink}\n\nKama si wewe uliyeomba hili, ingia sasa, hifadhi akaunti yako na ubadilishe nenosiri lako.\n\nKaziForce`,
      }
    : {
        subject: 'Your KaziForce account will be deleted',
        text: `Hello ${name},\n\nYou asked us to delete your account. We will delete it, and everything in it, on ${day}.\n\nIf you change your mind, log in before then, open Settings and choose "Keep my account":\n${settingsLink}\n\nIf you did not ask for this, log in now, keep your account and change your password.\n\nKaziForce`,
      };
}
