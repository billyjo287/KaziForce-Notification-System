import { ChevronDown, MonitorSmartphone, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings, type Theme } from '../stores/settings';

const ICONS = { light: Sun, dark: Moon, system: MonitorSmartphone } as const;
const THEMES: Theme[] = ['light', 'dark', 'system'];

/**
 * Screen colours dropdown: Light, Dark, or Same as my device (the default).
 * A native <select>, so phones show their own large, familiar picker and it works with any
 * keyboard or screen reader. The icon shows the current choice.
 */
export function ThemeSelect({ wide = false }: { wide?: boolean }) {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const Icon = ICONS[theme];

  return (
    <label
      className={`relative inline-flex min-h-11 items-center rounded-lg border-2 border-line-strong bg-surface font-bold text-ink hover:bg-canvas has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${
        wide ? 'w-full' : ''
      }`}
    >
      <span className="sr-only">{t('theme.label')}</span>
      <Icon aria-hidden="true" className="pointer-events-none absolute left-3 size-5" />
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
        className="min-h-10 w-full cursor-pointer appearance-none rounded-lg bg-transparent py-1 pr-9 pl-10 font-bold focus-visible:outline-none"
      >
        {THEMES.map((value) => (
          <option key={value} value={value} className="bg-surface text-ink">
            {t(`theme.options.${value}`)}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 size-5" />
    </label>
  );
}
