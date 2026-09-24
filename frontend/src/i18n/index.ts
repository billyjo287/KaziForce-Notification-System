import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

export const LANGUAGES = ['en', 'sw'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'kf.language';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** Saved choice first, then ?lang= in the address (handy for previews), then English. */
function initialLanguage(): Language {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (isLanguage(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage can be blocked (private mode); English is fine then.
  }
  return 'en';
}

// English is built in. Kiswahili is a separate small download, fetched only for people who
// use it (keeps the first download of the app small for everyone else).
const loadOnDemand: BackendModule = {
  type: 'backend',
  init: () => {},
  read: (language, _namespace, callback) => {
    if (language === 'en') return callback(null, en);
    import('./locales/sw.json').then(
      (module) => callback(null, module.default),
      (error: unknown) => callback(error as Error, null),
    );
  },
};

/** Resolves when the starting language is ready (main.tsx waits for it before drawing). */
export const i18nReady = i18n
  .use(loadOnDemand)
  .use(initReactI18next)
  .init({
    lng: initialLanguage(),
    fallbackLng: 'en',
    partialBundledLanguages: true,
    resources: { en: { translation: en } },
    initAsync: false,
    interpolation: { escapeValue: false }, // React already escapes text
    react: { useSuspense: false },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
