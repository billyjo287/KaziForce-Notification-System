import { LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { addPageStrings } from '../../i18n/addPageStrings';
import privacyEn from '../../i18n/locales/privacy.en.json';
import privacySw from '../../i18n/locales/privacy.sw.json';
import { usePageTitle } from '../../lib/usePageTitle';

addPageStrings(privacyEn, privacySw);

/** The page's sections, in reading order: a paragraph ("body") or a list ("items"). */
const SECTIONS = [
  { key: 'who', kind: 'body' },
  { key: 'collect', kind: 'items' },
  { key: 'why', kind: 'items' },
  { key: 'share', kind: 'items' },
  { key: 'abroad', kind: 'body' },
  { key: 'keep', kind: 'items' },
  { key: 'rights', kind: 'items' },
] as const;

const LINK = 'font-bold text-kf-primary-text underline underline-offset-4';

/**
 * Privacy notice (Kenya Data Protection Act 2019, section 29: tell people what is collected, why,
 * who receives it, how long it is kept and their rights; BT-10). Open to everyone, logged in or
 * not, and linked from sign-up, the landing page footer and Settings.
 */
export default function PrivacyPage() {
  const { t } = useTranslation();
  usePageTitle(t('privacy.title'));
  const email = import.meta.env.VITE_PRIVACY_EMAIL?.trim();
  const list = (key: string) =>
    t(`privacy.sections.${key}.items`, { returnObjects: true }) as string[];

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <p className="flex items-center gap-2 text-lg font-bold text-kf-primary-text">
        <LockKeyhole aria-hidden="true" className="size-5" />
        KaziForce
      </p>
      <h1 className="mt-3 text-3xl font-bold">{t('privacy.title')}</h1>
      <p className="mt-2 text-ink-muted">{t('privacy.updated')}</p>
      <p className="mt-6 text-lg">{t('privacy.intro')}</p>

      {SECTIONS.map(({ key, kind }) => (
        <section key={key} aria-labelledby={`privacy-${key}`} className="mt-10">
          <h2 id={`privacy-${key}`} className="text-2xl font-bold">
            {t(`privacy.sections.${key}.heading`)}
          </h2>
          {key === 'share' && <p className="mt-3 text-lg">{t('privacy.sections.share.intro')}</p>}
          {kind === 'body' ? (
            <p className="mt-3 text-lg">{t(`privacy.sections.${key}.body`)}</p>
          ) : (
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-6 text-lg">
              {list(key).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {key === 'share' && (
            <p className="mt-3 text-lg font-bold">{t('privacy.sections.share.never')}</p>
          )}
        </section>
      ))}

      <section aria-labelledby="privacy-contact" className="mt-10">
        <h2 id="privacy-contact" className="text-2xl font-bold">
          {t('privacy.sections.contact.heading')}
        </h2>
        <p className="mt-3 text-lg">
          {email
            ? t('privacy.sections.contact.withEmail', { email })
            : t('privacy.sections.contact.withoutEmail')}
        </p>
      </section>

      <p className="mt-12">
        <Link to="/" className={LINK}>
          {t('privacy.back')}
        </Link>
      </p>
    </main>
  );
}
