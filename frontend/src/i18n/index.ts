import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sw from './locales/sw.json';

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

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sw: { translation: sw } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes text
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
