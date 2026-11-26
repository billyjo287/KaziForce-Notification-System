import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { addPageStrings } from '../../i18n/addPageStrings';
import termsEn from '../../i18n/locales/terms.en.json';
import termsSw from '../../i18n/locales/terms.sw.json';
import { usePageTitle } from '../../lib/usePageTitle';

addPageStrings(termsEn, termsSw);

/** The page's sections, in reading order: a paragraph ("body") or a list ("items"). */
const SECTIONS = [
  { key: 'who', kind: 'body' },
  { key: 'account', kind: 'items' },
  { key: 'use', kind: 'items' },
  { key: 'alerts', kind: 'items' },
  { key: 'role', kind: 'body' },
  { key: 'service', kind: 'body' },
  { key: 'ending', kind: 'body' },
  { key: 'changes', kind: 'body' },
] as const;

const LINK = 'font-bold text-kf-primary-text underline underline-offset-4';

/**
 * Terms of Service: the rules for using KaziForce, agreed to with a tick box at sign-up (with the
 * Privacy Policy). Open to everyone, logged in or not; linked from sign-up, the landing page
 * footer, Settings and the Privacy Policy, and given to Google as the app's terms address.
 */
export default function TermsPage() {
  const { t } = useTranslation();
  usePageTitle(t('terms.title'));
  const email = import.meta.env.VITE_PRIVACY_EMAIL?.trim();
  const list = (key: string) =>
    t(`terms.sections.${key}.items`, { returnObjects: true }) as string[];

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <p className="flex items-center gap-2 text-lg font-bold text-kf-primary-text">
        <ScrollText aria-hidden="true" className="size-5" />
        KaziForce
      </p>
      <h1 className="mt-3 text-3xl font-bold">{t('terms.title')}</h1>
      <p className="mt-2 text-ink-muted">{t('terms.updated')}</p>
      <p className="mt-6 text-lg">{t('terms.intro')}</p>

      {SECTIONS.map(({ key, kind }) => (
        <section key={key} aria-labelledby={`terms-${key}`} className="mt-10">
          <h2 id={`terms-${key}`} className="text-2xl font-bold">
            {t(`terms.sections.${key}.heading`)}
          </h2>
          {kind === 'body' ? (
            <p className="mt-3 text-lg">{t(`terms.sections.${key}.body`)}</p>
          ) : (
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-6 text-lg">
              {list(key).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section aria-labelledby="terms-contact" className="mt-10">
        <h2 id="terms-contact" className="text-2xl font-bold">
          {t('terms.contact.heading')}
        </h2>
        <p className="mt-3 text-lg">
          {email ? t('terms.contact.withEmail', { email }) : t('terms.contact.withoutEmail')}
        </p>
      </section>

      <p className="mt-12 flex flex-col gap-3">
        <Link to="/privacy" className={LINK}>
          {t('terms.privacyLink')}
        </Link>
        <Link to="/" className={LINK}>
          {t('terms.back')}
        </Link>
      </p>
    </main>
  );
}
