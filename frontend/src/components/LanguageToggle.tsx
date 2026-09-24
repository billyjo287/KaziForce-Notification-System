import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * One-tap switch between English and Kiswahili (login screen and landing page).
 * The button shows the OTHER language in its own words ("Kiswahili" / "English").
 */
export function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === 'sw' ? 'en' : 'sw';

  return (
    <button
      type="button"
      lang={next}
      onClick={() => void i18n.changeLanguage(next)}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line-strong bg-surface px-3 font-bold hover:bg-canvas"
    >
      <Languages aria-hidden="true" className="size-5" />
      {next === 'sw' ? 'Kiswahili' : 'English'}
    </button>
  );
}
